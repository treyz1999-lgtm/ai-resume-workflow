import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAdapter } from "../../../worker/codex";
import type { Notification, RpcClient } from "../../../worker/rpc";
import { ExecutionError } from "../../../worker/rpc";
import { DIAGNOSTIC_PROMPT, type ExecutionProgress } from "./contracts";

class FakeRpc implements RpcClient {
  listeners = new Set<(event: Notification) => void>();
  disconnects = new Set<() => void>();
  calls: { method: string; params: Record<string, unknown> }[] = [];
  account: unknown = { type: "chatgpt", planType: "plus" };
  failure?: unknown;
  turn: (client: FakeRpc) => Promise<unknown> = async client => {
    queueMicrotask(() => { client.delta('{"status":"ok","message":"Aurora received"}'); client.complete("completed"); });
    return { turn: { id: "turn-1", status: "inProgress" } };
  };
  async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ method, params });
    if (this.failure) throw this.failure;
    switch (method) {
      case "account/read": return { account: this.account } as T;
      case "model/list": return { data: [{ id: "choice", model: "available-model", displayName: "Available model", isDefault: true }] } as T;
      case "account/rateLimits/read": return { rateLimits: { primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1234 } } } as T;
      case "account/login/start": return { type: "chatgptDeviceCode", loginId: "login-1", verificationUrl: "https://auth.openai.com/codex/device", userCode: "TEST-ONLY" } as T;
      case "thread/start": case "thread/resume": return { thread: { id: "thread-1" } } as T;
      case "turn/start": return await this.turn(this) as T;
      default: return {} as T;
    }
  }
  notify(method: string) { this.calls.push({ method, params: {} }); }
  subscribe(listener: (event: Notification) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onDisconnect(listener: () => void) { this.disconnects.add(listener); return () => { this.disconnects.delete(listener); }; }
  close() { for (const listener of this.disconnects) listener(); }
  event(method: string, params: Record<string, unknown>) { for (const listener of this.listeners) listener({ method, params }); }
  delta(delta: string) { this.event("item/agentMessage/delta", { threadId: "thread-1", turnId: "turn-1", delta }); }
  complete(status: string, error?: unknown) { this.event("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status, error } }); }
}
const roots: string[] = [];
const adapters: CodexAdapter[] = [];
async function fixture(timeout?: number) {
  const root = await mkdtemp(join(tmpdir(), "execution-fixture-")); roots.push(root);
  const rpc = new FakeRpc(); const adapter = new CodexAdapter(() => rpc, root, timeout); adapters.push(adapter);
  return { rpc, adapter };
}
afterEach(async () => { adapters.splice(0).forEach(adapter => adapter.close()); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const task = { id: "test-run", prompt: DIAGNOSTIC_PROMPT };

describe("subscription adapter", () => {
  it("handshakes once, exposes models/limits without email, and uses device login", async () => {
    const { adapter, rpc } = await fixture();
    const view = await adapter.connection();
    expect(view).toMatchObject({ connected: true, authType: "chatgpt", plan: "plus", models: [{ id: "available-model" }], limits: [{ usedPercent: 12 }] });
    expect(await adapter.login()).toMatchObject({ loginId: "login-1", userCode: "TEST-ONLY" });
    await adapter.cancelLogin("login-1");
    expect(rpc.calls.filter(call => call.method === "initialize")).toHaveLength(1);
    expect(rpc.calls.find(call => call.method === "account/login/start")?.params).toEqual({ type: "chatgptDeviceCode" });
    expect(rpc.calls.find(call => call.method === "account/login/cancel")?.params).toEqual({ loginId: "login-1" });
    await adapter.logout();
    expect(rpc.calls.some(call => call.method === "account/logout")).toBe(true);
  });
  it("rejects API-authenticated accounts without starting a task or billing fallback", async () => {
    const { adapter, rpc } = await fixture(); rpc.account = { type: "apiKey" };
    expect((await adapter.connection()).connected).toBe(false);
    await expect(adapter.execute(task, new AbortController().signal, () => {})).rejects.toMatchObject({ code: "auth" });
    expect(rpc.calls.some(call => call.method === "thread/start")).toBe(false);
  });
  it("handles events arriving before the turn RPC resolves and records checkpoints", async () => {
    const { adapter, rpc } = await fixture(); const progress: ExecutionProgress[] = [];
    const result = await adapter.execute(task, new AbortController().signal, event => progress.push(event));
    expect(result.structured).toEqual({ status: "ok", message: "Aurora received" });
    expect(progress).toContainEqual({ type: "checkpoint", threadId: "thread-1" });
    expect(progress).toContainEqual({ type: "checkpoint", threadId: "thread-1", turnId: "turn-1" });
    expect(progress.some(event => event.type === "delta")).toBe(true);
    expect(rpc.calls.find(call => call.method === "turn/start")?.params).toMatchObject({ approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: false } });
    expect(rpc.listeners.size).toBe(0);
  });
  it("resumes the stored thread and validates completed output", async () => {
    const { adapter, rpc } = await fixture();
    await adapter.execute({ ...task, threadId: "thread-1" }, new AbortController().signal, () => {});
    expect(rpc.calls.some(call => call.method === "thread/resume")).toBe(true);
    expect(rpc.calls.some(call => call.method === "thread/start")).toBe(false);
    rpc.turn = async client => { queueMicrotask(() => { client.delta('{"status":"wrong"}'); client.complete("completed"); }); return { turn: { id: "turn-1", status: "inProgress" } }; };
    await expect(adapter.execute(task, new AbortController().signal, () => {})).rejects.toMatchObject({ code: "invalid-result" });
  });
  it("uses the final message item rather than combining commentary into JSON", async () => {
    const { adapter, rpc } = await fixture();
    rpc.turn = async client => {
      queueMicrotask(() => {
        client.delta("Checking the fictional project.");
        client.event("item/completed", { threadId: "thread-1", turnId: "turn-1", item: { type: "agentMessage", text: '{"status":"ok","message":"Aurora received"}' } });
        client.complete("completed");
      });
      return { turn: { id: "turn-1", status: "inProgress" } };
    };
    expect((await adapter.execute(task, new AbortController().signal, () => {})).structured).toMatchObject({ status: "ok" });
  });
  it.each([["quota exceeded", "quota"], ["401 expired token", "auth"], ["unknown provider detail with secret", "transport"]])("classifies %s without exposing provider details", async (message, code) => {
    const { adapter, rpc } = await fixture();
    rpc.turn = async client => { queueMicrotask(() => client.complete("failed", { message })); return { turn: { id: "turn-1", status: "inProgress" } }; };
    const error = await adapter.execute(task, new AbortController().signal, () => {}).catch(error => error);
    expect(error).toMatchObject({ code }); expect(error.message).not.toContain("secret");
  });
  it("interrupts cancellation and terminates the transport before another run can begin", async () => {
    const { adapter, rpc } = await fixture();
    rpc.turn = async () => ({ turn: { id: "turn-1", status: "inProgress" } });
    const controller = new AbortController(); const progress = vi.fn();
    const run = adapter.execute(task, controller.signal, progress);
    const assertion = expect(run).rejects.toMatchObject({ code: "cancelled" });
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith({ type: "checkpoint", threadId: "thread-1", turnId: "turn-1" }));
    controller.abort(); await assertion;
    expect(rpc.calls.some(call => call.method === "turn/interrupt")).toBe(true);
    expect(rpc.listeners.size).toBe(0);
  });
  it("handles disconnects and turn timeout without hanging", async () => {
    const { adapter, rpc } = await fixture(30);
    rpc.turn = async () => ({ turn: { id: "turn-1", status: "inProgress" } });
    await expect(adapter.execute(task, new AbortController().signal, () => {})).rejects.toBeInstanceOf(ExecutionError);
    rpc.turn = async client => { queueMicrotask(() => client.close()); return { turn: { id: "turn-1", status: "inProgress" } }; };
    await expect(adapter.execute(task, new AbortController().signal, () => {})).rejects.toMatchObject({ code: "transport" });
  });
});
