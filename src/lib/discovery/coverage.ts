import type { CoverageReport, DiscoveryAnalysis } from "./contracts";

/** Discovery evaluates the whole KB. Submitted PDF scoring is a separate later workflow. */
export function coverageReport(analysis: DiscoveryAnalysis): CoverageReport {
  let numerator = 0, denominator = 0;
  for (const requirement of analysis.requirements) {
    const weight = requirement.importance === "core" ? 2 : 1;
    denominator += weight;
    numerator += weight * ({ direct: 1, partial: 0.5, absent: 0 }[requirement.evidence]);
  }
  return {
    method: "v5-evidence@1", score: denominator ? Math.round(100 * numerator / denominator) : null,
    keywordCoverage: analysis.keywords.length ? Math.round(100 * analysis.keywords.filter(item => item.covered).length / analysis.keywords.length) : null,
    strengths: analysis.requirements.filter(item => item.evidence === "direct").map(item => item.text),
    gaps: analysis.requirements.filter(item => item.evidence !== "direct").map(item => `${item.text} (${item.evidence})`),
    requirements: analysis.requirements, keywords: analysis.keywords,
  };
}
