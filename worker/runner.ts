import { randomUUID } from "node:crypto";
import { DIAGNOSTIC_SCHEMA, type ExecutionAdapter } from "../src/lib/execution/contracts";
import { ExecutionStore } from "./store";

/** One loop per worker; PostgreSQL arbitrates claims across worker processes. */
export class ExecutionRunner {
  private owner = randomUUID();
  private active: { id: string; controller: AbortController } | null = null;
  private stopped = false;
  constructor(private store: ExecutionStore, private adapter: ExecutionAdapter) {}
  cancel(id: string) { if (this.active?.id === id) this.active.controller.abort(); }
  stop() { this.stopped = true; this.active?.controller.abort(); }
  async tick(): Promise<boolean> {
    if (this.stopped || this.active) return false;
    const run = await this.store.claim(this.owner);
    if (!run) return false;
    const controller = new AbortController();
    this.active = { id: run.id, controller };
    let writes = Promise.resolve();
    const heartbeat = setInterval(() => {
      void this.store.heartbeat(run.id, this.owner).then(ok => { if (!ok) controller.abort(); }, () => controller.abort());
    }, 10_000);
    try {
      const result = await this.adapter.execute({ id: run.id, prompt: run.prompt, model: run.model ?? undefined,
        threadId: run.threadId ?? undefined, outputSchema: DIAGNOSTIC_SCHEMA }, controller.signal,
      event => { writes = writes.then(() => this.store.progress(run.id, this.owner, event)); void writes.catch(() => controller.abort()); });
      await writes;
      await this.store.finish(run.id, this.owner, "COMPLETED", result);
    } catch (error) {
      await writes.catch(() => {});
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "transport";
      const status = this.stopped ? "INTERRUPTED" : controller.signal.aborted || code === "cancelled" ? "CANCELLED" : code === "auth" || code === "quota" ? "BLOCKED" : "FAILED";
      const message = code === "auth" ? "Sign in to ChatGPT, then resume this check." : code === "quota" ? "Codex usage limit reached. Resume after your limit resets." : status === "INTERRUPTED" ? "Worker stopped. Resume when ready." : status === "CANCELLED" ? "Cancelled." : "Execution could not be verified. Check your connection and retry.";
      await this.store.finish(run.id, this.owner, status, undefined, message);
    } finally { clearInterval(heartbeat); this.active = null; }
    return true;
  }
}
