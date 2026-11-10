import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetchPosting: vi.fn(), search: vi.fn(), details: vi.fn(), yc: vi.fn(), hn: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/action", () => ({ ActionError: class ActionError extends Error {} }));
vi.mock("@/lib/posting-fetch", () => ({ fetchPosting: mocks.fetchPosting }));
vi.mock("@/lib/job-search", () => ({ searchPostings: mocks.search, postingDetails: mocks.details }));
vi.mock("@/lib/job-search/config", () => ({ loadJobSearchConfig: mocks.config, credentialsFor: () => ({ key: "fictional" }), requestContext: () => ({}) }));
vi.mock("@/lib/startups/sources/yc", () => ({ fetchYcStartups: mocks.yc, hnItemLink: (id: string) => `https://news.ycombinator.com/item?id=${id}` }));
vi.mock("@/lib/startups/sources/hn", () => ({ fetchHnStartups: mocks.hn }));
import { collectDiscovery, dateEvidence, resolveIntake } from "./sources";
import { DEFAULT_DISCOVERY_CONFIG } from "./contracts";
import { DEFAULT_DISCOVERY_PREFERENCES } from "@/lib/knowledge-contracts";
const signal = () => new AbortController().signal;
afterEach(() => vi.clearAllMocks());
describe("discovery source intake", () => {
  it("preserves raw relative-date evidence with uncertainty", () => {
    const result = dateEvidence("Reposted 2 days ago", new Date("2026-11-03T12:00:00Z"));
    expect(result).toMatchObject({ kind: "relative", reposted: true, earliest: "2026-10-31T12:00:00.000Z", latest: "2026-11-01T12:00:00.000Z", date: null });
    expect(dateEvidence("unknown").kind).toBe("unknown");
    expect(dateEvidence("2026-11-01").date).toBe("2026-11-01T00:00:00.000Z");
  });
  it("uses pasted complete JD without fetching its reference URL", async () => {
    const input = { jd: "Fictional JD\nPosted: 2026-11-01", url: "https://example.com/job", company: "Example", role: "Engineer" };
    expect(await resolveIntake(input, signal())).toMatchObject({ source: "TEXT", complete: true, jd: input.jd, postingEvidence: { kind: "absolute" } });
    expect(mocks.fetchPosting).not.toHaveBeenCalled();
  });
  it("uses guarded URL fetching and preserves fetch failures", async () => {
    mocks.fetchPosting.mockResolvedValue({ ok: true, text: "Complete Fictional JD", url: "https://example.com/final", source: "structured" });
    expect(await resolveIntake({ jd: "", url: "https://example.com/job", company: "", role: "" }, signal())).toMatchObject({ source: "URL", url: "https://example.com/final" });
    mocks.fetchPosting.mockResolvedValue({ ok: false, error: "Paste the posting instead." });
    await expect(resolveIntake({ jd: "", url: "https://example.com/job", company: "", role: "" }, signal())).rejects.toThrow("Paste the posting");
  });
  it("isolates failed sources while preserving complete startup posts", async () => {
    mocks.config.mockResolvedValue({ source: null }); mocks.yc.mockRejectedValue(new Error("private provider failure"));
    mocks.hn.mockResolvedValue([{ source: "HN", externalId: "1", company: "Example", summary: "Hiring", details: "Python engineer needed", location: "Remote", roles: ["Engineer"], links: [], postedAt: "2026-11-01T00:00:00Z" }]);
    const result = await collectDiscovery(DEFAULT_DISCOVERY_CONFIG, DEFAULT_DISCOVERY_PREFERENCES, signal());
    expect(result.postings).toHaveLength(1); expect(result.postings[0].complete).toBe(true);
    expect(result.sources.filter(item => item.error)).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("private provider failure");
  });
  it("searches role hints with fresh cache policy and excludes explicit companies", async () => {
    mocks.config.mockResolvedValue({ source: "JSEARCH" });
    mocks.search.mockResolvedValue({ postings: [{ source: "JSEARCH", externalId: "1", title: "Software Developer", company: "Excluded", place: "Remote", remote: true, salary: "", postedAt: null, url: "https://example.com/job", description: "Python JD", complete: true }], next: null });
    const result = await collectDiscovery({ ...DEFAULT_DISCOVERY_CONFIG, sources: ["JSEARCH"] }, { ...DEFAULT_DISCOVERY_PREFERENCES, roles: ["Engineer"], excludedCompanies: ["Excluded"] }, signal());
    expect(mocks.search.mock.calls[0][4]).toMatchObject({ fresh: true }); expect(result.postings).toEqual([]);
  });
  it("keeps unavailable full descriptions incomplete", async () => {
    mocks.config.mockResolvedValue({ source: "JSEARCH" }); mocks.details.mockResolvedValue(null); mocks.fetchPosting.mockResolvedValue({ ok: false, error: "Blocked" });
    mocks.search.mockResolvedValue({ postings: [{ source: "JSEARCH", externalId: "1", title: "Engineer", company: "Example", place: "", remote: null, salary: "", postedAt: null, url: "https://example.com/job", description: "Partial JD", complete: false }] });
    const result = await collectDiscovery({ ...DEFAULT_DISCOVERY_CONFIG, sources: ["JSEARCH"] }, { ...DEFAULT_DISCOVERY_PREFERENCES, roles: ["Engineer"] }, signal());
    expect(result.postings[0]).toMatchObject({ complete: false });
  });
});
