import { z } from "zod";
import type { NextRequest } from "next/server";

import { env } from "@/lib/env";
import { route } from "@/lib/route";

const text = z.string().max(200_000);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const run = z.object({
  id, status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "CANCELLED", "BLOCKED", "INTERRUPTED", "FAILED"]),
  model: z.string().nullable(), stage: z.string().nullable(), output: text, result: z.unknown(), error: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});
const connection = z.object({
  connected: z.boolean(), authType: z.string().nullable(), plan: z.string().nullable(), error: z.string().optional(),
  models: z.array(z.object({ id: z.string(), name: z.string(), isDefault: z.boolean().optional() })),
  limits: z.array(z.object({ name: z.string(), usedPercent: z.number(), windowMinutes: z.number(), resetsAt: z.number().nullable() })),
});
const login = z.object({
  loginId: id,
  verificationUrl: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "auth.openai.com" && !url.username && !url.password;
  }),
  userCode: z.string().max(100),
});
const artifact = z.object({ id: z.string().uuid(), pages: z.number().int().positive(), text, pdfUrl: z.string(), sourceUrl: z.string() });
const empty = z.object({}).strict();

function operation(method: string, path: string[]) {
  const key = path.join("/");
  if (method === "GET" && key === "connection") return { key, result: connection };
  if (method === "GET" && key === "runs") return { key, result: z.array(run) };
  if (method === "POST" && key === "login") return { key, body: empty, result: login };
  if (method === "POST" && key === "login/cancel") return { key, body: z.object({ loginId: id }).strict(), result: z.object({}) };
  if (method === "POST" && key === "logout") return { key, body: empty, result: z.object({}) };
  if (method === "POST" && key === "runs") return { key, body: z.object({ model: z.string().trim().min(1).max(200).optional() }).strict(), result: run };
  if (method === "POST" && key === "latex/sample") return { key, body: empty, result: artifact };
  if (method === "POST" && ["templates/swe", "templates/data", "templates/cover-letter"].includes(key)) return { key, body: empty, result: artifact };
  if (path.length >= 2 && path[0] === "runs" && id.safeParse(path[1]).success) {
    if (method === "GET" && path.length === 2) return { key, result: run };
    if (method === "POST" && path.length === 3 && ["cancel", "resume"].includes(path[2])) return { key, body: empty, result: run };
  }
  if (method === "GET" && path.length === 3 && path[0] === "artifacts" && z.string().uuid().safeParse(path[1]).success && ["sample.pdf", "sample.tex", "sample.png"].includes(path[2])) {
    return { key, file: path[2] };
  }
  return null;
}

/** Only the product's fixed operations reach the private worker; never raw RPC. */
const proxy = async (request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
  const selected = operation(request.method, (await params).path);
  if (!selected || request.nextUrl.search) return Response.json({ error: "Unknown execution operation." }, { status: 404 });
  let body: string | undefined;
  if (selected.body) {
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return Response.json({ error: "Request is too large." }, { status: 413 });
    try {
      // Read incrementally: a missing Content-Length must not bypass the bound.
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 4096) { await reader.cancel(); return Response.json({ error: "Request is too large." }, { status: 413 }); }
          chunks.push(next.value);
        }
      }
      body = JSON.stringify(selected.body.parse(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")));
    } catch {
      return Response.json({ error: "Invalid execution request." }, { status: 400 });
    }
  }
  try {
    const response = await fetch(`${(process.env.WORKER_URL ?? "http://worker:4310").replace(/\/$/, "")}/${selected.key}`, {
      method: request.method, body, cache: "no-store", redirect: "error",
      headers: { "X-Worker-Token": env.DOSSIER_SECRET, ...(body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
    });
    if (!response.ok) {
      const status = [400, 401, 404, 409, 429, 503].includes(response.status) ? response.status : 502;
      const message = status === 409 ? "This operation is not available in the current state. Refresh and try again."
        : status === 429 ? "The execution service is busy or usage-limited. Try again later."
          : status === 404 ? "This run or file is no longer available."
            : "The worker could not complete this request. Check its connection and try again.";
      return Response.json({ error: message }, { status });
    }
    if (selected.file) {
      return new Response(response.body, { headers: {
        "Content-Type": selected.file.endsWith(".pdf") ? "application/pdf" : selected.file.endsWith(".png") ? "image/png" : "text/plain; charset=utf-8",
        "Content-Disposition": `${selected.file.endsWith(".tex") ? "attachment" : "inline"}; filename="${selected.file}"`,
        "X-Content-Type-Options": "nosniff",
        // Only fixed generated files may be framed, by this app itself.
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; base-uri 'none'",
      } });
    }
    const data = selected.result!.parse(await response.json());
    if (selected.key === "latex/sample" || selected.key.startsWith("templates/")) {
      const value = artifact.parse(data);
      return Response.json({ ...value, pdfUrl: `/api/execution/artifacts/${value.id}/sample.pdf`, sourceUrl: `/api/execution/artifacts/${value.id}/sample.tex` });
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "The local worker is unavailable or returned an incomplete response. Start the worker and try again." }, { status: 503 });
  }
};

export const GET = route<{ params: Promise<{ path: string[] }> }>(proxy);
export const POST = route<{ params: Promise<{ path: string[] }> }>(proxy);
