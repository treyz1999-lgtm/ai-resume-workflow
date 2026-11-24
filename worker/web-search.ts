import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { discoveryPreferencesSchema } from "../src/lib/knowledge-contracts";
import { webSearchPrompt, webSearchResultSchema } from "../src/lib/discovery/web-search-task";
import { CodexAdapter } from "./codex";
import { ExecutionError } from "./rpc";

const adapter = new CodexAdapter(undefined, undefined, 240_000, value => webSearchResultSchema.parse(value), true);
export const closeWebSearch = () => adapter.close();
export async function handleWebSearch(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (request.method !== "POST" || request.url !== "/discovery/search") return false;
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of request) {
    const chunk = Buffer.from(part); size += chunk.length;
    if (size > 128_000) throw new Error("invalid-request");
    chunks.push(chunk);
  }
  const input = z.object({ preferences: discoveryPreferencesSchema, model: z.string().max(160) }).strict().parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const controller = new AbortController();
  const abort = () => { if (!response.writableEnded) controller.abort(); };
  response.on("close", abort);
  try {
    const result = await adapter.execute({ id: "web-discovery", prompt: webSearchPrompt(input.preferences), model: input.model || undefined,
      outputSchema: z.toJSONSchema(webSearchResultSchema) }, controller.signal, () => {});
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(webSearchResultSchema.parse(result.structured)));
  } catch (error) {
    if (!response.destroyed) {
      response.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ code: error instanceof ExecutionError ? error.code : "invalid-result" }));
    }
  } finally { response.off("close", abort); }
  return true;
}
