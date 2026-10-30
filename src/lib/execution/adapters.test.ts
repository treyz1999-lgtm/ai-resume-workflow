import { describe, expect, it, vi } from "vitest";
import { HttpExecutionAdapter } from "../../../worker/adapters";
import { DIAGNOSTIC_PROMPT } from "./contracts";
const context = { id: "fixture", prompt: DIAGNOSTIC_PROMPT };
const valid = JSON.stringify({ status: "ok", message: "Aurora received" });
describe("application-owned transport", () => {
  it.each(["ollama", "openai-compatible"] as const)("round-trips structured %s and sends only its selected credentials", async kind => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(kind === "ollama" ? { done: true, message: { content: valid } } : { choices: [{ finish_reason: "stop", message: { content: valid } }] })));
    const adapter = new HttpExecutionAdapter(kind, { endpoint: "http://fixture/v1", model: "fixture-model", apiKey: "fixture-key", fetchImpl });
    expect((await adapter.execute(context, new AbortController().signal, () => {})).structured).toEqual(JSON.parse(valid));
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(`http://fixture/v1/${kind === "ollama" ? "api/chat" : "chat/completions"}`);
    expect(JSON.parse(options!.body as string)).toMatchObject({ model: "fixture-model", stream: false });
    expect(options!.headers).toMatchObject({ authorization: "Bearer fixture-key" });
  });
  it.each([[401, "auth"], [429, "quota"], [500, "transport"]])("classifies HTTP %s without returning provider response bodies", async (status, code) => {
    const adapter = new HttpExecutionAdapter("ollama", { endpoint: "http://fixture", model: "fixture", fetchImpl: async () => new Response("private-provider-message", { status: status as number }) });
    await expect(adapter.execute(context, new AbortController().signal, () => {})).rejects.toMatchObject({ code });
  });
  it("rejects truncated output instead of crediting syntactically valid JSON", async () => {
    const adapter = new HttpExecutionAdapter("openai-compatible", { endpoint: "http://fixture", model: "fixture", fetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: valid } }] })) });
    await expect(adapter.execute(context, new AbortController().signal, () => {})).rejects.toMatchObject({ code: "invalid-result" });
  });
  it("passes cancellation to transport and returns a safe cancellation result", async () => {
    const controller = new AbortController();
    const adapter = new HttpExecutionAdapter("ollama", { endpoint: "http://fixture", model: "fixture", fetchImpl: async (_url, options) => {
      controller.abort(); options!.signal!.throwIfAborted(); return new Response();
    } });
    await expect(adapter.execute(context, controller.signal, () => {})).rejects.toMatchObject({ code: "cancelled" });
  });
});
