import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CodexAdapter } from "./codex";
import { ExecutionError } from "./rpc";
import { statusMessagesSchema, statusClassificationSchema, classifyStatusPrompt } from "../src/lib/google/status-report-task";

const adapter = new CodexAdapter(undefined, undefined, 180_000, value => value);
const requestSchema = z.object({ messages: statusMessagesSchema, model: z.string().max(160) }).strict();

export async function handleStatusReport(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (request.method !== "POST" || request.url !== "/status-report/classify") return false;
  const send = (status: number, result: unknown) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(result));
  };
  const controller = new AbortController();
  const abort = () => { if (!response.writableEnded) controller.abort(); };
  response.on("close", abort);
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 8 * 1024 * 1024) {
        send(413, { code: "context" });
        return true;
      }
      chunks.push(buffer);
    }
    const { messages, model } = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await adapter.execute({
      id: randomUUID(), prompt: classifyStatusPrompt(messages), model: model || undefined,
      outputSchema: z.toJSONSchema(statusClassificationSchema),
    }, controller.signal, () => {});
    send(200, statusClassificationSchema.parse(result.structured));
  } catch (error) {
    send(503, { code: error instanceof ExecutionError ? error.code : "invalid-result" });
  } finally {
    response.off("close", abort);
  }
  return true;
}
