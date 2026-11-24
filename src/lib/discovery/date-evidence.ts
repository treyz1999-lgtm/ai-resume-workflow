import type { PostingEvidence } from "./contracts";

export function dateEvidence(raw: string, observedAt = new Date(), absolute?: string | null): PostingEvidence {
  const base: PostingEvidence = { raw, observedAt: observedAt.toISOString(), kind: "unknown", date: null, earliest: null, latest: null, reposted: /reposted/i.test(raw) };
  const iso = absolute || raw.match(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?\b/)?.[0];
  if (iso && Number.isFinite(Date.parse(iso))) return { ...base, kind: "absolute", date: new Date(iso).toISOString() };
  const relative = raw.match(/\b(\d+)\s+(hour|day|week|month)s?\s+ago\b/i);
  if (relative) {
    const unit = { hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_678_400_000 }[relative[2].toLowerCase()]!;
    const latest = observedAt.getTime() - Number(relative[1]) * unit;
    return { ...base, kind: "relative", earliest: new Date(latest - unit).toISOString(), latest: new Date(latest).toISOString() };
  }
  return base;
}
export function evidenceFromText(text: string): PostingEvidence {
  const raw = text.match(/\b(?:reposted|posted|datePosted)\b[^\n·|]*/i)?.[0].trim() ?? "";
  return dateEvidence(raw.slice(0, 2000));
}
