import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DIAGNOSTIC_SCHEMA, type ConnectionView, type ExecutionAdapter, type ExecutionProgress, type ExecutionResult, type LoginView, type TaskContext } from "../src/lib/execution/contracts";
import { ExecutionError, executionError, startCodex, type RpcClient } from "./rpc";

export { ExecutionError } from "./rpc";
const diagnostic = z.object({ status: z.literal("ok"), message: z.string().min(1).max(4000) }).strict();
type Account = { account: { type: string; planType?: string | null } | null };
type Turn = { id: string; status: string; error?: unknown; items?: { type: string; text?: string }[] };
type Window = { usedPercent: number; windowDurationMins: number; resetsAt?: number | null };
type Limit = { limitName?: string | null; primary?: Window | null; secondary?: Window | null };

export class CodexAdapter implements ExecutionAdapter {
  readonly capabilities = { structured: true, streaming: true, cancellation: true, resume: true };
  private client?: RpcClient;
  private ready?: Promise<RpcClient>;
  private active = false;
  private abortActive?: () => void;
  constructor(private factory: (cwd: string) => RpcClient = startCodex,
    private root = process.env.EXECUTION_ROOT ?? "/work", private turnTimeoutMs = 180_000) {}
  private connect(): Promise<RpcClient> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const cwd = join(this.root, "diagnostic");
      await mkdir(cwd, { recursive: true, mode: 0o700 });
      const client = this.factory(cwd); this.client = client;
      client.onDisconnect(() => { if (this.client === client) { this.client = undefined; this.ready = undefined; } });
      await client.request("initialize", { clientInfo: { name: "ai_resume_workflow", title: "AI Resume Workflow", version: "0.1.0" }, capabilities: { experimentalApi: false } });
      client.notify("initialized");
      return client;
    })().catch((error) => { this.close(); throw executionError(error); });
    return this.ready;
  }
  async connection(): Promise<ConnectionView> {
    const disconnected: ConnectionView = { connected: false, authType: null, plan: null, models: [], limits: [] };
    try {
      const client = await this.connect();
      const { account } = await client.request<Account>("account/read", { refreshToken: false });
      if (account?.type !== "chatgpt") return { ...disconnected, authType: account?.type ?? null,
        ...(account ? { error: "This connection requires ChatGPT sign-in. API billing is not used." } : {}) };
      const view: ConnectionView = { ...disconnected, connected: true, authType: "chatgpt", plan: account.planType ?? null };
      const models = await client.request<{ data: { id: string; model: string; displayName: string; isDefault?: boolean }[] }>("model/list", { limit: 100 });
      view.models = models.data.map(model => ({ id: model.model || model.id, name: model.displayName || model.id, isDefault: model.isDefault }));
      try {
        const limits = await client.request<{ rateLimits: Limit; rateLimitsByLimitId?: Record<string, Limit> }>("account/rateLimits/read");
        for (const [id, limit] of Object.entries(limits.rateLimitsByLimitId ?? { codex: limits.rateLimits })) {
          if (!limit) continue;
          for (const [window, value] of Object.entries({ primary: limit.primary, secondary: limit.secondary })) {
            if (value) view.limits.push({ name: `${limit.limitName ?? id} ${window}`, usedPercent: value.usedPercent, windowMinutes: value.windowDurationMins, resetsAt: value.resetsAt ?? null });
          }
        }
      } catch { view.error = "Usage limits are currently unavailable."; }
      return view;
    } catch (error) { return { ...disconnected, error: executionError(error).message }; }
  }
  async login(): Promise<LoginView> {
    if (this.active) throw new ExecutionError("transport");
    const client = await this.connect();
    const result = await client.request<LoginView & { type: string }>("account/login/start", { type: "chatgptDeviceCode" });
    if (result.type !== "chatgptDeviceCode" || !result.loginId || !result.userCode || result.verificationUrl !== "https://auth.openai.com/codex/device") throw new ExecutionError("auth");
    return { loginId: result.loginId, verificationUrl: result.verificationUrl, userCode: result.userCode };
  }
  async cancelLogin(loginId: string): Promise<void> { await (await this.connect()).request("account/login/cancel", { loginId }); }
  async logout(): Promise<void> {
    this.abortActive?.();
    await (await this.connect()).request("account/logout");
    this.close();
  }
  close() { this.abortActive?.(); this.client?.close(); this.client = undefined; this.ready = undefined; }

  async execute(context: TaskContext, signal: AbortSignal, progress: (event: ExecutionProgress) => void): Promise<ExecutionResult> {
    if (this.active) throw new ExecutionError("transport");
    if (signal.aborted) throw new ExecutionError("cancelled");
    this.active = true;
    try {
      const client = await this.connect();
      const account = await client.request<Account>("account/read", { refreshToken: true });
      if (account.account?.type !== "chatgpt") throw new ExecutionError("auth");
      if (signal.aborted) throw new ExecutionError("cancelled");
      progress({ type: "stage", message: "Starting subscription-authenticated Codex task" });
      const cwd = join(this.root, "diagnostic");
      const params = { ...(context.model ? { model: context.model } : {}), cwd, approvalPolicy: "never", sandbox: "read-only",
        config: { "features.shell_tool": false, "features.unified_exec": false, "features.multi_agent": false, "web_search": "disabled" } };
      const response = await client.request<{ thread: { id: string } }>(context.threadId ? "thread/resume" : "thread/start",
        { ...params, ...(context.threadId ? { threadId: context.threadId } : {}) });
      const threadId = response.thread.id;
      await progress({ type: "checkpoint", threadId });
      if (signal.aborted) throw new ExecutionError("cancelled");
      return await this.runTurn(client, threadId, context, signal, progress);
    } catch (error) { throw executionError(error); }
    finally { this.active = false; this.abortActive = undefined; }
  }
  private async runTurn(client: RpcClient, threadId: string, context: TaskContext, signal: AbortSignal,
    progress: (event: ExecutionProgress) => void): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve, reject) => {
      let settled = false;
      let turnId: string | undefined;
      let checkpointed = false;
      let output = "";
      let finalMessage = "";
      let aborted = false;
      const early: Turn[] = [];
      const finish = (error?: Error, result?: ExecutionResult) => {
        if (settled) return;
        settled = true; clearTimeout(timer); unsubscribe(); disconnect(); signal.removeEventListener("abort", cancel);
        if (error) reject(error); else resolve(result!);
      };
      const interrupt = () => {
        if (turnId) void client.request("turn/interrupt", { threadId, turnId }).catch(() => client.close());
      };
      const cancel = () => { aborted = true; interrupt(); finish(new ExecutionError("cancelled")); client.close(); };
      const complete = (turn: Turn) => {
        if (!turnId || !checkpointed) { early.push(turn); return; }
        if (turn.id !== turnId) return;
        if (turn.status === "interrupted") return finish(new ExecutionError("cancelled"));
        if (turn.status !== "completed") return finish(executionError(turn.error));
        const final = turn.items?.filter(item => item.type === "agentMessage" && item.text).at(-1)?.text;
        const text = final || finalMessage || output;
        try {
          const structured = diagnostic.parse(JSON.parse(text));
          finish(undefined, { text, structured, threadId, turnId });
        } catch { finish(new ExecutionError("invalid-result")); }
      };
      const unsubscribe = client.subscribe(event => {
        const data = event.params;
        if (data.threadId !== threadId) return;
        if (turnId && data.turnId && data.turnId !== turnId) return;
        if (event.method === "item/agentMessage/delta" && typeof data.delta === "string") {
          output += data.delta;
          if (output.length > 64_000) { interrupt(); finish(new ExecutionError("invalid-result")); client.close(); return; }
          progress({ type: "delta", message: data.delta });
        } else if (event.method === "item/completed") {
          const item = data.item as { type?: string; text?: string } | undefined;
          if (item?.type === "agentMessage" && typeof item.text === "string") {
            if (item.text.length > 64_000) { interrupt(); finish(new ExecutionError("invalid-result")); client.close(); return; }
            finalMessage = item.text;
          }
        } else if (event.method === "turn/completed") complete(data.turn as Turn);
      });
      const disconnect = client.onDisconnect(() => finish(new ExecutionError("transport")));
      const timer = setTimeout(() => { interrupt(); finish(new ExecutionError("transport")); client.close(); }, this.turnTimeoutMs);
      signal.addEventListener("abort", cancel, { once: true });
      this.abortActive = cancel;
      if (signal.aborted) { cancel(); return; }
      void client.request<{ turn: Turn }>("turn/start", { threadId, input: [{ type: "text", text: context.prompt }],
        approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: context.outputSchema ?? DIAGNOSTIC_SCHEMA,
      }).then(async result => {
        turnId = result.turn.id;
        await progress({ type: "checkpoint", threadId, turnId });
        checkpointed = true;
        if (aborted) { interrupt(); return; }
        for (const turn of early) complete(turn);
        if (result.turn.status !== "inProgress") complete(result.turn);
      }).catch(error => { interrupt(); finish(executionError(error)); client.close(); });
    });
  }
}
