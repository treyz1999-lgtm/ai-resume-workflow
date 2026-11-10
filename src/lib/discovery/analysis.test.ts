import { describe, expect, it, vi, afterEach } from "vitest";
import { discoveryPrompt, validateAnalysis, DISCOVERY_CONTEXT_MAX_BYTES } from "./analysis-task";
import { DEFAULT_DISCOVERY_CONFIG, type DiscoveryAnalysis, type DiscoveryInput } from "./contracts";
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async () => ({ complete }) }));
vi.mock("@/lib/action", () => ({ ActionError: class ActionError extends Error {} }));
import { analyzePosting } from "./analysis";
export const posting: DiscoveryInput = { source: "TEXT", externalId: "test", url: "", company: "Fictional", role: "Engineer", jd: "Must know Python. SQL preferred. Experience: 0-2 years.", complete: true,
  postingEvidence: { raw: "", kind: "unknown", date: null, earliest: null, latest: null, observedAt: "2026-11-03T00:00:00.000Z", reposted: false } };
const kb = { projects: [{ name: "Aurora", context: "Built Python services" }] };
export function analysis(): DiscoveryAnalysis {
  return { extracted: { company: "Fictional", role: "Engineer", track: "swe", location: null, arrangement: null, salaryOriginal: null, salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, experienceOriginal: "0-2 years", experienceBand: "0-2", requisition: null, postingDateOriginal: null },
    requirements: [{ text: "Python", jdQuote: "Must know Python", importance: "core", evidence: "direct", kbQuotes: ["Built Python services"], explanation: "Project evidence" }, { text: "SQL", jdQuote: "SQL preferred", importance: "preference", evidence: "absent", kbQuotes: [], explanation: "No SQL evidence" }], keywords: [{ keyword: "Python", covered: false }, { keyword: "SQL", covered: true }] };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); complete.mockReset(); });
describe("discovery source-evidence analysis", () => {
  it("includes the whole context and calculates literal keywords separately", () => {
    expect(discoveryPrompt(posting, kb)).toContain("Built Python services");
    expect(validateAnalysis(analysis(), posting, kb).keywords).toEqual([{ keyword: "Python", covered: true }, { keyword: "SQL", covered: false }]);
  });
  it("refuses oversized context instead of slicing", () => {
    expect(() => discoveryPrompt(posting, { text: "x".repeat(DISCOVERY_CONTEXT_MAX_BYTES) })).toThrow("Nothing was omitted");
  });
  it.each(["jd", "kb", "duplicate", "missing", "keyword", "salary"])("rejects unsupported %s outputs", kind => {
    const result = analysis();
    if (kind === "jd") result.requirements[0].jdQuote = "Rust required";
    if (kind === "kb") result.requirements[0].kbQuotes = ["Led 200 staff"];
    if (kind === "duplicate") result.requirements.push(result.requirements[0]);
    if (kind === "missing") result.requirements[0].kbQuotes = [];
    if (kind === "keyword") result.keywords[0].keyword = "Rust";
    if (kind === "salary") result.extracted.salaryOriginal = "$200000";
    expect(() => validateAnalysis(result, posting, kb)).toThrow();
  });
  it("calls the explicitly configured provider with complete KB", async () => {
    complete.mockResolvedValue(analysis());
    const value = await analyzePosting(posting, kb, { ...DEFAULT_DISCOVERY_CONFIG, provider: "configured" }, new AbortController().signal);
    expect(value.requirements).toHaveLength(2);
    expect(complete.mock.calls[0][0].messages[0].content).toContain("Built Python services");
  });
  it("uses the internal fixed subscription endpoint, never falls back", async () => {
    vi.stubEnv("DOSSIER_SECRET", "fictional-worker-token");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "quota" }), { status: 503 })); vi.stubGlobal("fetch", request);
    await expect(analyzePosting(posting, kb, DEFAULT_DISCOVERY_CONFIG, new AbortController().signal)).rejects.toThrow("usage limit");
    expect(request.mock.calls[0][0]).toBe("http://worker:4310/discovery/analyze");
    expect(complete).not.toHaveBeenCalled();
  });
  it("rejects unsupported subscription evidence and accepts valid results", async () => {
    vi.stubEnv("DOSSIER_SECRET", "fictional-worker-token");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(analysis()))); vi.stubGlobal("fetch", request);
    expect((await analyzePosting(posting, kb, DEFAULT_DISCOVERY_CONFIG, new AbortController().signal)).keywords[0].covered).toBe(true);
    const bad = analysis(); bad.requirements[0].kbQuotes = ["Invented"];
    request.mockResolvedValue(new Response(JSON.stringify(bad)));
    await expect(analyzePosting(posting, kb, DEFAULT_DISCOVERY_CONFIG, new AbortController().signal)).rejects.toThrow("source-evidence");
  });
});
