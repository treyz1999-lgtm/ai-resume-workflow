import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, expect, it, vi } from "vitest";
import { handleStatusReport } from "../../../worker/status-report";

const execute = vi.hoisted(() => vi.fn());
vi.mock("../../../worker/codex", () => ({ CodexAdapter: class { execute = execute; } }));
const result = { kind: "IGNORE", company: "", role: "", summary: "", quote: "", companyQuote: "", roleQuote: "", confident: false };
beforeEach(() => execute.mockReset());
function call(payload: unknown) {
  const request = Readable.from([JSON.stringify(payload)]) as IncomingMessage;
  request.method = "POST";
  request.url = "/status-report/classify";
  const response = Object.assign(new EventEmitter(), { writableEnded: false, writeHead: vi.fn(), end: vi.fn() });
  return { response, done: handleStatusReport(request, response as unknown as ServerResponse) };
}
it("passes complete message context and validates structured worker results", async () => {
  execute.mockResolvedValue({ structured: result });
  const messages = { targetId: "mail", messages: [{ id: "mail", from: "hr@example.com", subject: "Receipt", date: "2026-11-20", text: "Thanks for applying." }] };
  const { response, done } = call({ messages, model: "codex-fixture" });
  expect(await done).toBe(true);
  expect(execute.mock.calls[0][0].prompt).toContain("Thanks for applying.");
  expect(response.writeHead).toHaveBeenCalledWith(200, expect.anything());
  expect(JSON.parse(response.end.mock.calls[0][0])).toEqual(result);
  expect(response.listenerCount("close")).toBe(0);
});
it("rejects invalid request and model output without returning email content", async () => {
  const invalid = call({ messages: {}, model: "" });
  await invalid.done;
  expect(execute).not.toHaveBeenCalled();
  expect(invalid.response.writeHead).toHaveBeenCalledWith(503, expect.anything());
  execute.mockResolvedValue({ structured: { raw: "private email" } });
  const output = call({ messages: { targetId: "x", messages: [{ id: "x", from: "", subject: "", date: "", text: "" }] }, model: "" });
  await output.done;
  expect(output.response.end).toHaveBeenCalledWith(JSON.stringify({ code: "invalid-result" }));
});
