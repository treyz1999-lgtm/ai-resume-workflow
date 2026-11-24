import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAdapter } from "../../../worker/codex";
import type { Notification, RpcClient } from "../../../worker/rpc";

class SearchRpc implements RpcClient {
  listeners = new Set<(event: Notification) => void>();
  calls: { method: string; params: unknown }[] = [];
  evidence: "none" | "event" | "turn" | "wrong-thread" = "none";
  async request<T>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params });
    if (method === "account/read") return { account: { type: "chatgpt" } } as T;
    if (method === "thread/start") return { thread: { id: "search-thread" } } as T;
    if (method === "turn/start") {
      if (this.evidence === "event" || this.evidence === "wrong-thread") {
        for (const listener of this.listeners) listener({ method: "item/completed", params: {
          threadId: this.evidence === "wrong-thread" ? "unrelated-thread" : "search-thread", turnId: "search-turn", item: { type: "webSearch" },
        } });
      }
      return { turn: { id: "search-turn", status: "completed", items: [
        ...(this.evidence === "turn" ? [{ type: "webSearch" }] : []),
        { type: "agentMessage", text: '{"status":"ok","message":"Fictional result"}' },
      ] } } as T;
    }
    return {} as T;
  }
  notify() {}
  subscribe(listener: (event: Notification) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onDisconnect() { return () => {}; }
  close() {}
}
const roots: string[] = [];
const adapters: CodexAdapter[] = [];
async function fixture(webSearch: boolean, evidence: SearchRpc["evidence"]) {
  const root = await mkdtemp(join(tmpdir(), "web-search-proof-")); roots.push(root);
  const rpc = new SearchRpc(); rpc.evidence = evidence;
  const adapter = new CodexAdapter(() => rpc, root, 1000, undefined, webSearch); adapters.push(adapter);
  return { adapter, rpc };
}
afterEach(async () => {
  adapters.splice(0).forEach(adapter => adapter.close());
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const task = { id: "web-search-proof", prompt: "Find fictional jobs" };

describe("Codex web search execution evidence", () => {
  it.each(["none", "wrong-thread"] as const)("rejects search claims with %s tool evidence", async evidence => {
    const { adapter } = await fixture(true, evidence);
    await expect(adapter.execute(task, new AbortController().signal, () => {})).rejects.toMatchObject({ code: "invalid-result" });
  });
  it.each(["event", "turn"] as const)("accepts completed web-search evidence from %s", async evidence => {
    const { adapter, rpc } = await fixture(true, evidence);
    await expect(adapter.execute(task, new AbortController().signal, () => {})).resolves.toMatchObject({ structured: { status: "ok" } });
    expect(rpc.calls.find(call => call.method === "thread/start")?.params).toMatchObject({ config: { web_search: "live", "features.shell_tool": false, "features.unified_exec": false, "features.multi_agent": false } });
  });
  it("keeps web search disabled for ordinary tasks without demanding search evidence", async () => {
    const { adapter, rpc } = await fixture(false, "none");
    await expect(adapter.execute(task, new AbortController().signal, () => {})).resolves.toMatchObject({ structured: { status: "ok" } });
    expect(rpc.calls.find(call => call.method === "thread/start")?.params).toMatchObject({ config: { web_search: "disabled" } });
  });
});
