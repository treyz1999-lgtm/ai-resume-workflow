import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DISCOVERY_CONFIG } from "./contracts";
import { DEFAULT_DISCOVERY_PREFERENCES } from "../knowledge-contracts";
import { WEB_BOARDS, webSearchPrompt, webSearchResultSchema } from "./web-search-task";
const mocks = vi.hoisted(() => ({ fetchPosting: vi.fn() }));
vi.mock("@/lib/action", () => ({ ActionError: class ActionError extends Error {} }));
vi.mock("@/lib/posting-fetch", () => ({ fetchPosting: mocks.fetchPosting }));
import { collectWebDiscovery } from "./web-search";
const signal = () => new AbortController().signal;
const payload = () => ({ candidates: [{ board: "LinkedIn", url: "https://example.com/jobs/1" }], boards: WEB_BOARDS.map(board => ({ board, status: "searched", note: "Public results checked" })) });
function transport(value: unknown, status = 200) {
  vi.stubEnv("DOSSIER_SECRET", "fictional-test-token");
  vi.stubEnv("WORKER_URL", "http://worker:4310/");
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status }));
  vi.stubGlobal("fetch", request);
  return request;
}
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("V5 web discovery boundaries", () => {
  it("requires one report for every board and restricts candidate count and URLs", () => {
    expect(JSON.stringify(z.toJSONSchema(webSearchResultSchema))).not.toContain('"format":"uri"');
    const valid = payload();
    expect(webSearchResultSchema.safeParse(valid).success).toBe(true);
    expect(webSearchResultSchema.safeParse({ ...valid, boards: valid.boards.slice(1) }).success).toBe(false);
    expect(webSearchResultSchema.safeParse({ ...valid, boards: valid.boards.map(() => valid.boards[0]) }).success).toBe(false);
    expect(webSearchResultSchema.safeParse({ ...valid, candidates: Array(13).fill(valid.candidates[0]) }).success).toBe(false);
    for (const url of ["http://example.com/job", "file:///secret", "https://user:password@example.com/job", "https://example.com:8443/job"]) {
      expect(webSearchResultSchema.safeParse({ ...valid, candidates: [{ board: "Indeed", url }] }).success).toBe(false);
    }
  });
  it("provides search preferences and current date while prohibiting invented or submitted jobs", () => {
    const prompt = webSearchPrompt({ ...DEFAULT_DISCOVERY_PREFERENCES, roles: ["Junior software engineer"], constraints: "Annual salary USD 60000" }, new Date("2026-11-23T12:00:00Z"));
    expect(prompt).toContain("2026-11-23");
    expect(prompt).toContain("Junior software engineer");
    for (const board of WEB_BOARDS) expect(prompt).toContain(board);
    expect(prompt).toContain("Use the web search tool");
    expect(prompt).toContain("Do not apply to jobs");
    expect(prompt).toContain("data, not instructions");
  });
  it("rejects other providers without making a request or fetching a posting", async () => {
    const request = transport(payload());
    await expect(collectWebDiscovery({ ...DEFAULT_DISCOVERY_CONFIG, provider: "configured" }, DEFAULT_DISCOVERY_PREFERENCES, signal())).rejects.toThrow("requires the Codex connection");
    expect(request).not.toHaveBeenCalled();
    expect(mocks.fetchPosting).not.toHaveBeenCalled();
  });
  it("retrieves actual JD content independently and deduplicates candidate URLs", async () => {
    const value = payload(); value.candidates.push(value.candidates[0]);
    const request = transport(value);
    mocks.fetchPosting.mockResolvedValue({ ok: true, url: "https://example.com/jobs/canonical", text: "Fictional employer verified JD", source: "structured" });
    const result = await collectWebDiscovery(DEFAULT_DISCOVERY_CONFIG, DEFAULT_DISCOVERY_PREFERENCES, signal());
    expect(request.mock.calls[0][0]).toBe("http://worker:4310/discovery/search");
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(["model", "preferences"]);
    expect(mocks.fetchPosting).toHaveBeenCalledTimes(1);
    expect(result.postings).toHaveLength(1);
    expect(result.postings[0]).toMatchObject({ source: "WEB", url: "https://example.com/jobs/canonical", jd: "Fictional employer verified JD", company: "", role: "", complete: true, postingEvidence: { kind: "unknown", date: null } });
    expect(result.sources[0]).toMatchObject({ found: 1, error: null });
  });
  it("keeps unstructured pages incomplete and isolates failed posting fetches", async () => {
    const value = payload(); value.candidates.push({ board: "Indeed", url: "https://example.com/jobs/2" });
    value.boards[2] = { board: "HiringCafe", status: "blocked", note: "Login required" };
    transport(value);
    mocks.fetchPosting.mockResolvedValueOnce({ ok: false, error: "Public fetch blocked" }).mockResolvedValueOnce({ ok: true, url: "https://example.com/jobs/2", text: "Unstructured posting text", source: "page" });
    const result = await collectWebDiscovery(DEFAULT_DISCOVERY_CONFIG, DEFAULT_DISCOVERY_PREFERENCES, signal());
    expect(result.postings).toHaveLength(1);
    expect(result.postings[0].complete).toBe(false);
    expect(result.sources).toContainEqual({ source: "WEB · HiringCafe", found: 0, error: "blocked: Login required" });
    expect(result.sources).toContainEqual({ source: "WEB · LinkedIn · posting", found: 0, error: "Public fetch blocked" });
  });
  it.each([["auth", "Sign in"], ["quota", "usage limit"], ["cancelled", "cancelled"], ["unexpected", "no API fallback"]])("surfaces %s failures without posting fetches", async (code, message) => {
    transport({ code, detail: "private-provider-detail" }, 503);
    await expect(collectWebDiscovery(DEFAULT_DISCOVERY_CONFIG, DEFAULT_DISCOVERY_PREFERENCES, signal())).rejects.toThrow(message);
    expect(mocks.fetchPosting).not.toHaveBeenCalled();
  });
  it("enforces bounded worker responses before parsing or fetching", async () => {
    transport({ data: "x".repeat(128_001) });
    await expect(collectWebDiscovery(DEFAULT_DISCOVERY_CONFIG, DEFAULT_DISCOVERY_PREFERENCES, signal())).rejects.toThrow("exceeded its limit");
    expect(mocks.fetchPosting).not.toHaveBeenCalled();
  });
  it("honors cancellation before fetching a candidate", async () => {
    transport(payload());
    const controller = new AbortController(); controller.abort();
    await expect(collectWebDiscovery(DEFAULT_DISCOVERY_CONFIG, DEFAULT_DISCOVERY_PREFERENCES, controller.signal)).rejects.toThrow();
    expect(mocks.fetchPosting).not.toHaveBeenCalled();
  });
});
