import { afterEach, expect, it, vi } from "vitest";
import { classifyStatus } from "./status-report-analysis";

const fixtures = vi.hoisted(() => ({ config: vi.fn(), complete: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { discoveryControl: { findUnique: fixtures.config } } }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async () => ({ complete: fixtures.complete }) }));
vi.mock("@/lib/discovery/store", () => ({ configFrom: (config: unknown) => config }));
const input = { targetId: "mail", messages: [{ id: "mail", from: "", subject: "", date: "2026-11-21", text: "Complete body" }] };
const ignored = { kind: "IGNORE", company: "", role: "", summary: "", quote: "", companyQuote: "", roleQuote: "", confident: false };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("uses the selected configured model with complete context", async () => {
  fixtures.config.mockResolvedValue({ config: { provider: "configured", model: "local" } });
  fixtures.complete.mockResolvedValue(ignored);
  expect(await classifyStatus(input)).toEqual(ignored);
  expect(fixtures.complete.mock.calls[0][0].messages[0].content).toContain("Complete body");
});

it("uses Codex and reports quota, connection and malformed response failures", async () => {
  fixtures.config.mockResolvedValue({ config: { provider: "codex", model: "fixture" } });
  vi.stubEnv("DOSSIER_SECRET", "fictional-worker-token");
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(ignored)));
  vi.stubGlobal("fetch", fetcher);
  expect(await classifyStatus(input)).toEqual(ignored);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).messages).toEqual(input);
  for (const [code, message] of [["quota", "usage limit"], ["auth", "Reconnect"], ["context", "could not complete"]]) {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code }), { status: 503 }));
    await expect(classifyStatus(input)).rejects.toThrow(message);
  }
  fetcher.mockResolvedValueOnce(new Response(null));
  await expect(classifyStatus(input)).rejects.toThrow("no response");
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ wrong: true })));
  await expect(classifyStatus(input)).rejects.toThrow();
  vi.stubEnv("DOSSIER_SECRET", "");
  await expect(classifyStatus(input)).rejects.toThrow("Configure");
});
