import { z } from "zod";
import type { ExecutionAdapter, ExecutionProgress, ExecutionResult, TaskContext } from "../src/lib/execution/contracts";
import { DIAGNOSTIC_SCHEMA } from "../src/lib/execution/contracts";
import { ExecutionError, executionError } from "./rpc";

type TransportOptions = { endpoint: string; model: string; apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number };
const resultSchema = z.object({ status: z.literal("ok"), message: z.string().min(1).max(4000) }).strict();
/** Application-owned transport: no Codex credentials, file tools, or implicit provider fallback. */
export class HttpExecutionAdapter implements ExecutionAdapter {
  readonly capabilities = { structured: true, streaming: false, cancellation: true, resume: false };
  constructor(private kind: "openai-compatible" | "ollama", private options: TransportOptions) {}
  async execute(context: TaskContext, signal: AbortSignal, progress: (event: ExecutionProgress) => void): Promise<ExecutionResult> {
    if (signal.aborted) throw new ExecutionError("cancelled");
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 60_000);
    const combined = AbortSignal.any([signal, timeout]);
    const schema = context.outputSchema ?? DIAGNOSTIC_SCHEMA;
    const model = context.model ?? this.options.model;
    const endpoint = this.options.endpoint.replace(/\/+$/, "");
    progress({ type: "stage", message: `Calling selected ${this.kind} model` });
    try {
      const response = await (this.options.fetchImpl ?? fetch)(`${endpoint}/${this.kind === "ollama" ? "api/chat" : "chat/completions"}`, {
        method: "POST", headers: { "content-type": "application/json", ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}) }, signal: combined,
        body: JSON.stringify({ model, messages: [{ role: "user", content: context.prompt }], stream: false,
          ...(this.kind === "ollama" ? { format: schema } : { response_format: { type: "json_schema", json_schema: { name: "connection_result", strict: true, schema } } }) }),
      });
      if (!response.ok) throw executionError({ status: response.status });
      const raw = await response.text();
      if (raw.length > 128_000) throw new ExecutionError("invalid-result");
      const body = JSON.parse(raw);
      const text = this.kind === "ollama" ? body.message?.content : body.choices?.[0]?.message?.content;
      if (typeof text !== "string" || (this.kind === "ollama" ? body.done !== true : body.choices?.[0]?.finish_reason !== "stop")) throw new ExecutionError("invalid-result");
      let structured: unknown;
      try { structured = resultSchema.parse(JSON.parse(text)); } catch { throw new ExecutionError("invalid-result"); }
      return { text, structured };
    } catch (error) {
      if (signal.aborted) throw new ExecutionError("cancelled");
      if (timeout.aborted) throw new ExecutionError("transport");
      throw executionError(error);
    }
  }
}
