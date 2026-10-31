import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { testDatabaseUrl } from "@/test/db";
import { ExecutionStore } from "../../../worker/store";
import { ExecutionRunner } from "../../../worker/runner";
import type { ExecutionAdapter } from "./contracts";

const pool = new Pool({ connectionString: testDatabaseUrl() });
const store = new ExecutionStore(pool);
beforeEach(async () => { await pool.query('TRUNCATE "ExecutionRun"'); });
afterAll(() => pool.end());
it("claims only one run across competing workers, then advances FIFO", async () => {
  const first = await store.create();
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = await store.create();
  const claims = await Promise.all([store.claim("a"), store.claim("b")]);
  const run = claims.find(Boolean)!;
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(run.id).toBe(first.id);
  await store.finish(run.id, run.owner!, "COMPLETED", { text: "ok", structured: { status: "ok" } });
  expect((await store.claim("c"))?.id).toBe(second.id);
});
it("fences expired owners, retains checkpoints, and resumes the same record", async () => {
  const created = await store.create();
  await store.claim("old");
  await store.progress(created.id, "old", { type: "checkpoint", threadId: "thread-1" });
  await store.progress(created.id, "old", { type: "delta", message: "partial" });
  await pool.query('UPDATE "ExecutionRun" SET "leaseUntil"=NOW()-INTERVAL \'1 second\'');
  expect(await store.claim("new")).toBeNull();
  expect((await store.get(created.id))?.status).toBe("INTERRUPTED");
  await store.finish(created.id, "old", "COMPLETED", { text: "stale" });
  expect(await store.resume(created.id)).toBe(true);
  const resumed = await store.claim("new");
  expect(resumed).toMatchObject({ id: created.id, threadId: "thread-1", output: "partial" });
  expect(await store.list()).toHaveLength(1);
});
it("holds the active claim while cancellation is being acknowledged", async () => {
  const created = await store.create(); await store.claim("a");
  await store.cancel(created.id);
  expect(await store.resume(created.id)).toBe(false);
  expect(await store.heartbeat(created.id, "a")).toBe(false);
  expect(await store.claim("b")).toBeNull();
  await store.finish(created.id, "a", "COMPLETED", { text: "late" });
  expect(await store.get(created.id)).toMatchObject({ status: "CANCELLED", stage: "CANCELLED", output: "" });
  expect(await store.resume(created.id)).toBe(true);
});
it.each(["quota", "auth"])("persists %s blocks without duplicating attempts", async code => {
  const created = await store.create();
  const adapter: ExecutionAdapter = { capabilities: { structured: true, streaming: true, cancellation: true, resume: true },
    async execute(context, signal, emit) { void context; void signal; emit({ type: "checkpoint", threadId: "saved" }); throw Object.assign(new Error("secret raw provider text"), { code }); } };
  await new ExecutionRunner(store, adapter).tick();
  const row = await store.get(created.id);
  expect(row).toMatchObject({ status: "BLOCKED", threadId: "saved" });
  expect(row?.error).not.toContain("secret");
  expect(await store.resume(created.id)).toBe(true);
  expect(await store.list()).toHaveLength(1);
});

it("cancels active work without allowing late success to mark it completed", async () => {
  const created = await store.create();
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  const adapter: ExecutionAdapter = { capabilities: { structured: true, streaming: true, cancellation: true, resume: true },
    async execute(context, signal, emit) {
      void context; await emit({ type: "checkpoint", threadId: "cancel-thread" }); started();
      return new Promise((resolve, reject) => { void resolve; signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "cancelled" })), { once: true }); });
    } };
  const runner = new ExecutionRunner(store, adapter);
  const tick = runner.tick(); await running;
  await store.cancel(created.id); runner.cancel(created.id); await tick;
  expect((await store.get(created.id))?.status).toBe("CANCELLED");
});

it("sign-out cancels queued work beyond the thirty-row display limit", async () => {
  for (let i = 0; i < 32; i++) await store.create();
  await store.cancelAll();
  expect((await pool.query('SELECT count(*)::int AS count FROM "ExecutionRun" WHERE status=\'QUEUED\'')).rows[0].count).toBe(0);
});

it("does not start a task when shutdown happens during a pending claim", async () => {
  const created = await store.create();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const claim = store.claim.bind(store);
  const delayed = vi.spyOn(store, "claim").mockImplementation(async owner => { await pending; return claim(owner); });
  const execute = vi.fn();
  const adapter: ExecutionAdapter = { capabilities: { structured: true, streaming: true, cancellation: true, resume: true }, execute };
  try {
    const runner = new ExecutionRunner(store, adapter);
    const tick = runner.tick(); runner.stop(); release(); await tick;
    expect(execute).not.toHaveBeenCalled();
    expect((await store.get(created.id))?.status).toBe("INTERRUPTED");
  } finally { delayed.mockRestore(); }
});
