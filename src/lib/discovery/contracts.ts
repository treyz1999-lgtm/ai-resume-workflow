import { z } from "zod";

const text = z.string().max(2000);
const nullableText = text.nullable();
export const postingStateSchema = z.enum(["NEW", "SAVED", "DISMISSED"]);
export type PostingState = z.infer<typeof postingStateSchema>;
export const discoveryConfigSchema = z.object({
  paused: z.boolean().default(false),
  enabled: z.boolean(), intervalMinutes: z.number().int().min(1).max(60),
  timeZone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Use an IANA timezone."),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  sources: z.array(z.enum(["JSEARCH", "YC", "HN", "WEB"])).max(4),
  country: z.string().regex(/^[a-z]{2}$/),
  provider: z.enum(["codex", "configured"]), model: z.string().trim().max(160),
}).strict();
export type DiscoveryConfig = z.infer<typeof discoveryConfigSchema>;
export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = { paused: false, enabled: false, intervalMinutes: 10, timeZone: "UTC", days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00", sources: ["JSEARCH", "YC", "HN"], country: "us", provider: "codex", model: "" };

export const postingEvidenceSchema = z.object({
  raw: z.string().max(2000), kind: z.enum(["absolute", "relative", "unknown"]),
  observedAt: z.string().datetime(), date: z.string().datetime().nullable(),
  earliest: z.string().datetime().nullable(), latest: z.string().datetime().nullable(), reposted: z.boolean(),
}).strict();
export type PostingEvidence = z.infer<typeof postingEvidenceSchema>;
export const discoveryInputSchema = z.object({
  source: z.enum(["JSEARCH", "YC", "HN", "WEB", "URL", "TEXT"]), externalId: z.string().max(2000),
  url: z.string().max(4000).refine(value => !value || /^https?:\/\//i.test(value)),
  company: text, role: text, jd: z.string().min(1).max(500_000), complete: z.boolean(),
  postingEvidence: postingEvidenceSchema,
}).strict();
export type DiscoveryInput = z.infer<typeof discoveryInputSchema>;
export const intakeSchema = z.object({ url: z.string().max(4000), jd: z.string().max(500_000), company: text, role: text }).strict()
  .refine(value => value.jd.trim().length > 0 || /^https?:\/\//i.test(value.url), "Paste a job description or public posting URL.");
export type IntakeInput = z.infer<typeof intakeSchema>;

export const discoveryAnalysisSchema = z.object({
  extracted: z.object({
    company: nullableText, role: nullableText, track: z.enum(["swe", "data", "other"]).nullable(),
    location: nullableText, arrangement: nullableText, salaryOriginal: nullableText,
    salaryMin: z.number().nullable(), salaryMax: z.number().nullable(), salaryCurrency: nullableText, salaryPeriod: nullableText,
    experienceOriginal: nullableText, experienceBand: nullableText, requisition: nullableText, postingDateOriginal: nullableText,
  }).strict(),
  requirements: z.array(z.object({
    text, jdQuote: z.string().min(1).max(4000), importance: z.enum(["core", "preference"]),
    evidence: z.enum(["direct", "partial", "absent"]), kbQuotes: z.array(z.string().min(1).max(4000)).max(20), explanation: text,
  }).strict()).max(150),
  keywords: z.array(z.object({ keyword: text, covered: z.boolean() }).strict()).max(150),
}).strict();
export type DiscoveryAnalysis = z.infer<typeof discoveryAnalysisSchema>;
export type CoverageReport = { method: "v5-evidence@1"; score: number | null; keywordCoverage: number | null; strengths: string[]; gaps: string[]; requirements: DiscoveryAnalysis["requirements"]; keywords: DiscoveryAnalysis["keywords"] };
export type SourceResult = { source: string; found: number; error: string | null };
export type DiscoveryPostingView = { id: string; source: string; url: string; company: string; role: string; jd: string; complete: boolean; postingEvidence: PostingEvidence; postedAt: string | null; firstSeenAt: string; lastSeenAt: string; sightings: number; extracted: DiscoveryAnalysis["extracted"] | null; coverage: CoverageReport | null; kbSnapshotId: string | null; state: PostingState; analysisError: string | null; selected: boolean };
export type DiscoveryView = {
  config: DiscoveryConfig; configured: boolean; sessionUntil: string | null; nextTickAt: string | null;
  scans: { id: string; manualInput?: boolean; status: string; stage: string | null; sourceResults: SourceResult[]; error: string | null; createdAt: string; finishedAt: string | null }[];
  postings: DiscoveryPostingView[];
  selections: { id: string; postingId: string; company: string; role: string; createdAt: string }[];
};
