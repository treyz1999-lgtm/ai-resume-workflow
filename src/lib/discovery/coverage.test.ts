import { expect, it } from "vitest";
import { coverageReport } from "./coverage";
import type { DiscoveryAnalysis } from "./contracts";

it("weights core evidence twice and reports keyword coverage separately", () => {
  const requirement = { text: "SQL", jdQuote: "SQL", importance: "core" as const, evidence: "direct" as const, kbQuotes: ["SQL"], explanation: "Supported" };
  const report = coverageReport({ requirements: [requirement, { ...requirement, text: "Python", evidence: "partial" }, { ...requirement, text: "AWS", importance: "preference", evidence: "absent", kbQuotes: [] }], keywords: [{ keyword: "SQL", covered: true }, { keyword: "Python", covered: true }] } as DiscoveryAnalysis);
  expect(report).toMatchObject({ method: "v5-evidence@1", score: 60, keywordCoverage: 100, strengths: ["SQL"], gaps: ["Python (partial)", "AWS (absent)"] });
});
it("does not invent a score when no requirements were extracted", () => {
  expect(coverageReport({ requirements: [], keywords: [] } as unknown as DiscoveryAnalysis)).toMatchObject({ score: null, keywordCoverage: null });
});
