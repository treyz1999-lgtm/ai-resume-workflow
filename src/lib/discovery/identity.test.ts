import { expect, it } from "vitest";
import { occurrenceKey, postingIdentity, sameOccurrence } from "./identity";
import type { DiscoveryInput, PostingEvidence } from "./contracts";

const evidence: PostingEvidence = { kind: "absolute", date: "2026-11-01T00:00:00.000Z", raw: "November 1", observedAt: "2026-11-03T00:00:00.000Z", earliest: null, latest: null, reposted: false };
const posting: DiscoveryInput = { source: "JSEARCH", externalId: "a", url: "https://example.com/jobs/1?utm_source=search", company: "Example", role: "Engineer", jd: "SQL required", complete: true, postingEvidence: evidence };
it("canonicalizes links across boards and tracking parameters", () => {
  expect(postingIdentity(posting)).toBe(postingIdentity({ ...posting, source: "URL", externalId: "different", url: "https://www.example.com/jobs/1/" }));
  expect(postingIdentity({ ...posting, url: "" })).not.toBe(postingIdentity({ ...posting, url: "", externalId: "b" }));
});
it("recognizes changed absolute posting dates, ignoring within-day time shifts", () => {
  expect(sameOccurrence(evidence, { ...evidence, date: "2026-11-01T23:00:00.000Z" })).toBe(true);
  expect(sameOccurrence(evidence, { ...evidence, date: "2026-11-02T00:00:00.000Z", reposted: true })).toBe(false);
  expect(occurrenceKey("id", evidence)).not.toBe(occurrenceKey("id", { ...evidence, date: "2026-11-02T00:00:00.000Z" }));
});
it("deduplicates relative label drift using overlapping anchored ranges", () => {
  const original = { ...evidence, kind: "relative" as const, date: null, raw: "reposted 2 days ago", earliest: "2026-10-31T00:00:00.000Z", latest: "2026-11-01T00:00:00.000Z", reposted: true };
  expect(sameOccurrence(original, { ...original, raw: "reposted 3 days ago", observedAt: "2026-11-04T00:00:00.000Z" })).toBe(true);
  expect(sameOccurrence(original, { ...original, earliest: "2026-11-02T00:00:00.000Z", latest: "2026-11-03T00:00:00.000Z" })).toBe(false);
  expect(sameOccurrence(original, { ...evidence, kind: "unknown", date: null })).toBe(true);
});
