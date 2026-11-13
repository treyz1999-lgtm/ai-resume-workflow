import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { discoveryInputSchema, discoveryAnalysisSchema } from "../src/lib/discovery/contracts";
import { discoveryPrompt, validateAnalysis, DISCOVERY_CONTEXT_MAX_BYTES } from "../src/lib/discovery/analysis-task";
import { ExecutionError } from "./rpc";
import { CodexAdapter } from "./codex";
import { handleTailoringAI } from "./tailoring-ai";
import { handleTailoringRender } from "./tailoring-render";
import { compileSample, compileDocument, artifactPath } from "./latex";
import { renderV5Resume, renderCoverLetter, fictionalResume, fictionalCoverLetter } from "../src/lib/templates/v5";
import { ExecutionStore, view } from "./store";
import { ExecutionRunner } from "./runner";
import { previewPdf } from "./pdf-preview";

const token = process.env.DOSSIER_SECRET;
if (!token || token.length < 32 || !process.env.DATABASE_URL) throw new Error("Worker configuration is missing.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const store = new ExecutionStore(pool);
const adapter = new CodexAdapter();
const runner = new ExecutionRunner(store, adapter);
const discoveryAdapter = new CodexAdapter(undefined, undefined, 210_000, value => discoveryAnalysisSchema.parse(value));
const root = join(process.env.EXECUTION_ROOT ?? "/work", "artifacts");
let compiling = false;
let closing = false;
let activeTick: Promise<boolean> | null = null;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}
function authorized(request: IncomingMessage) {
  const received = request.headers["x-worker-token"];
  return typeof received === "string" && Buffer.byteLength(received) === Buffer.byteLength(token!) && timingSafeEqual(Buffer.from(received), Buffer.from(token!));
}
async function body(request: IncomingMessage, limit = 4096): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const part of request) {
    const chunk = Buffer.from(part);
    bytes += chunk.byteLength;
    if (bytes > limit) throw new Error("invalid-request");
    chunks.push(chunk);
  }
  return bytes ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
const empty = z.object({}).strict();
const server = createServer(async (request, response) => {
  if (!authorized(request)) return json(response, { error: "Unauthorized." }, 401);
  const path = request.url ?? "";
  const method = request.method;
  try {
    if (await handleTailoringAI(request, response) || await handleTailoringRender(request, response)) return;
    if (method === "POST" && path === "/discovery/analyze") {
      const input = z.object({ posting: discoveryInputSchema, kb: z.unknown(), model: z.string().max(160) }).strict().parse(await body(request, DISCOVERY_CONTEXT_MAX_BYTES));
      const prompt = discoveryPrompt(input.posting, input.kb);
      const controller = new AbortController();
      const abort = () => { if (!response.writableEnded) controller.abort(); };
      response.on("close", abort);
      try {
        const result = await discoveryAdapter.execute({ id: "discovery", prompt, model: input.model || undefined, outputSchema: z.toJSONSchema(discoveryAnalysisSchema) }, controller.signal, () => {});
        return json(response, validateAnalysis(result.structured, input.posting, input.kb));
      } catch (error) {
        return json(response, { code: error instanceof ExecutionError ? error.code : "invalid-result" }, 503);
      } finally { response.off("close", abort); }
    }
    if (method === "POST" && path === "/library/preview") {
      if (compiling) return json(response, { error: "Document tools are busy. Try again." }, 409);
      compiling = true;
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of request) {
          const bytes = Buffer.from(chunk); size += bytes.length;
          if (size > 10 * 1024 * 1024) return json(response, { error: "PDF too large." }, 413);
          chunks.push(bytes);
        }
        const png = await previewPdf(Buffer.concat(chunks), "/tmp/ai-resume-previews");
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        return response.end(png);
      } finally { compiling = false; }
    }
    if (method === "GET" && path === "/health") return json(response, { ok: true });
    if (method === "GET" && path === "/connection") return json(response, await adapter.connection());
    if (method === "GET" && path === "/runs") return json(response, await store.list());
    const runPath = path.match(new RegExp(`^/runs/(${uuid})(?:/(cancel|resume))?$`));
    if (runPath) {
      const [, id, action] = runPath;
      const row = await store.get(id);
      if (!row) return json(response, { error: "Check not found." }, 404);
      if (method === "GET" && !action) return json(response, view(row));
      if (method === "POST" && action) {
        empty.parse(await body(request));
        if (action === "cancel") { await store.cancel(id); runner.cancel(id); }
        else if (!await store.resume(id)) return json(response, { error: "This check cannot be resumed in its current state." }, 409);
        return json(response, view((await store.get(id))!));
      }
    }
    const artifact = path.match(new RegExp(`^/artifacts/(${uuid})/(sample\\.pdf|sample\\.tex|sample\\.png)$`));
    if (method === "GET" && artifact) {
      const file = artifactPath(root, artifact[1], artifact[2]);
      const content = await readFile(file);
      response.writeHead(200, { "Content-Type": artifact[2].endsWith("pdf") ? "application/pdf" : artifact[2].endsWith("png") ? "image/png" : "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="${artifact[2]}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return response.end(content);
    }
    if (method === "POST") {
      const input = await body(request);
      if (path === "/runs") {
        const { model } = z.object({ model: z.string().trim().min(1).max(160).optional() }).strict().parse(input);
        return json(response, view(await store.create(model)), 201);
      }
      if (path === "/login/cancel") {
        const { loginId } = z.object({ loginId: z.string().min(1).max(200) }).strict().parse(input);
        await adapter.cancelLogin(loginId); return json(response, { ok: true });
      }
      empty.parse(input);
      if (path === "/login") return json(response, await adapter.login());
      if (path === "/logout") {
        await store.cancelAll();
        discoveryAdapter.close(); await adapter.logout(); return json(response, { ok: true });
      }
      if (path === "/latex/sample" || ["/templates/swe", "/templates/data", "/templates/cover-letter"].includes(path)) {
        if (compiling) return json(response, { error: "A sample is already compiling." }, 409);
        compiling = true;
        try {
          const result = path === "/latex/sample" ? await compileSample(root) : await compileDocument(root,
            path === "/templates/cover-letter" ? renderCoverLetter(fictionalCoverLetter) : renderV5Resume(path === "/templates/data" ? "data" : "swe", fictionalResume),
            ["Morgan Example"]);
          return json(response, { ...result, pdfUrl: `/api/execution/artifacts/${result.id}/sample.pdf`, sourceUrl: `/api/execution/artifacts/${result.id}/sample.tex` });
        } finally { compiling = false; }
      }
    }
    return json(response, { error: "Operation not found." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError || (error instanceof Error && error.message === "invalid-request")) return json(response, { error: "Invalid request." }, 400);
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return json(response, { error: "Artifact not found." }, 404);
    // Never expose subprocess output, credential paths, or provider payloads.
    json(response, { error: "The worker could not complete this operation. Check its connection and try again." }, 503);
  }
});

// Migrations run in the application service. Do not crash-loop while it initializes.
async function start() {
  // Fixed scratch-only directory: remove abandoned uploads after interrupted conversion.
  // Credentials, saved library documents, and execution artifacts are elsewhere.
  await rm("/tmp/ai-resume-previews", { recursive: true, force: true });
  for (let attempt = 0; ; attempt++) {
    try { await pool.query('SELECT id FROM "ExecutionRun" LIMIT 1'); break; }
    catch { if (attempt >= 59) throw new Error("Worker database is not ready."); await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  server.listen(Number(process.env.WORKER_PORT ?? 4310), "0.0.0.0", () => console.log("Execution worker ready."));
  while (!closing) {
    try { activeTick = runner.tick(); await activeTick; } catch { console.error("Execution queue unavailable; retrying."); }
    if (!closing) await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
async function shutdown() {
  if (closing) return;
  closing = true; runner.stop(); server.close(); adapter.close(); discoveryAdapter.close();
  // Let cancellation record the interrupted state; the lease recovers a hard kill.
  const deadline = setTimeout(() => process.exit(1), 10_000);
  await activeTick?.catch(() => {});
  await pool.end(); clearTimeout(deadline); process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
void start().catch(() => { console.error("Worker startup failed."); process.exit(1); });
