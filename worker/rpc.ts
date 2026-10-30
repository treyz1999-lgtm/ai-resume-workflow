import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export type FailureCode = "auth" | "quota" | "cancelled" | "transport" | "invalid-result";
const messages: Record<FailureCode, string> = {
  auth: "Sign in to ChatGPT again before continuing this run.",
  quota: "Your Codex usage limit was reached. This run is saved for later continuation.",
  cancelled: "Execution cancelled.",
  transport: "The execution service disconnected or timed out. This run can be retried.",
  "invalid-result": "The model did not return the required structured result.",
};
export class ExecutionError extends Error {
  constructor(readonly code: FailureCode) { super(messages[code]); this.name = "ExecutionError"; }
}
/** Inspect provider details only to classify; never preserve or expose their contents. */
export function executionError(error: unknown): ExecutionError {
  if (error instanceof ExecutionError) return error;
  const text = error instanceof Error ? error.message : JSON.stringify(error) ?? "";
  if (/rate.?limit|quota|usage.?limit|429|limit.?reached/i.test(text)) return new ExecutionError("quota");
  if (/unauthori|authentication|expired.?token|invalid.?token|not.?logged|401|403|sign.?in/i.test(text)) return new ExecutionError("auth");
  if (/abort|cancel|interrupt/i.test(text)) return new ExecutionError("cancelled");
  return new ExecutionError("transport");
}

export type Notification = { method: string; params: Record<string, unknown> };
export interface RpcClient {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  notify(method: string, params?: unknown): void;
  subscribe(listener: (event: Notification) => void): () => void;
  onDisconnect(listener: () => void): () => void;
  close(): void;
}
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** A bounded JSONL client; unsolicited server tool/approval requests are always denied. */
export class StdioRpc implements RpcClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(event: Notification) => void>();
  private disconnectListeners = new Set<() => void>();
  private buffer = "";
  private decoder = new StringDecoder("utf8");
  private closed = false;
  constructor(private child: ChildProcessWithoutNullStreams, private timeoutMs = 30_000) {
    child.stdout.on("data", (data: Buffer) => this.read(this.decoder.write(data)));
    // Drain diagnostics without logging tokens, account data, prompts, or paths.
    child.stderr.resume();
    child.on("error", () => this.close());
    child.on("exit", () => this.close());
    child.stdin.on("error", () => this.close());
  }
  request<T>(method: string, params: unknown = {}): Promise<T> {
    if (this.closed) return Promise.reject(new ExecutionError("transport"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.close(); }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.write({ id, method, params });
    });
  }
  notify(method: string, params?: unknown) { this.write({ method, ...(params === undefined ? {} : { params }) }); }
  subscribe(listener: (event: Notification) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onDisconnect(listener: () => void) { this.disconnectListeners.add(listener); return () => { this.disconnectListeners.delete(listener); }; }
  private write(message: unknown) {
    if (this.closed) return;
    try { this.child.stdin.write(`${JSON.stringify(message)}\n`); } catch { this.close(); }
  }
  private read(chunk: string) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > 2_000_000) return this.close();
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message: Record<string, unknown>;
      try { message = JSON.parse(line); } catch { return this.close(); }
      if (!message || typeof message !== "object") return this.close();
      if (typeof message.method === "string") {
        if (message.id !== undefined) {
          this.write({ id: message.id, error: { code: -32601, message: "Client tools and approvals are unavailable for this task." } });
        } else {
          const params = message.params && typeof message.params === "object" ? message.params as Record<string, unknown> : {};
          for (const listener of this.listeners) {
            try { listener({ method: message.method, params }); } catch { this.close(); return; }
          }
        }
      } else if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) pending.reject(executionError(message.error));
        else pending.resolve(message.result);
      }
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new ExecutionError("transport")); }
    this.pending.clear();
    this.child.stdin.destroy();
    this.child.kill("SIGKILL");
    for (const listener of this.disconnectListeners) listener();
    this.listeners.clear(); this.disconnectListeners.clear();
  }
}

/** Do not forward the worker's database secret or any API/provider credentials. */
export function codexEnvironment(source: Partial<NodeJS.ProcessEnv> = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const name of ["PATH", "LANG", "LC_ALL", "TZ", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"]) {
    if (source[name]) result[name] = source[name];
  }
  result.CODEX_HOME = source.CODEX_HOME ?? "/auth/codex";
  result.HOME = result.CODEX_HOME;
  return result;
}
export function startCodex(cwd: string): RpcClient {
  return new StdioRpc(spawn("codex", ["app-server", "--listen", "stdio://",
    "-c", 'forced_login_method="chatgpt"', "-c", 'cli_auth_credentials_store="file"',
    "-c", 'model_provider="openai"', "-c", 'sandbox_mode="read-only"',
    "-c", 'approval_policy="never"', "-c", "features.shell_tool=false", "-c", "features.unified_exec=false",
    "-c", "features.multi_agent=false", "-c", 'web_search="disabled"',
  ], { cwd, env: codexEnvironment(), stdio: "pipe", windowsHide: true }));
}
