import { createHash } from "node:crypto";
import { linkKey } from "@/lib/job-search/search";
import type { DiscoveryInput, PostingEvidence } from "./contracts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function postingIdentity(posting: DiscoveryInput): string {
  const link = posting.url && linkKey(posting.url);
  return hash(link ? `url:${link}` : posting.externalId ? `${posting.source}:${posting.externalId}` : `text:${posting.company.trim().toLowerCase()}:${posting.role.trim().toLowerCase()}:${posting.jd}`);
}

function range(evidence: PostingEvidence): [number, number] | null {
  if (evidence.kind === "absolute" && evidence.date) {
    const day = evidence.date.slice(0, 10);
    return [Date.parse(`${day}T00:00:00.000Z`), Date.parse(`${day}T23:59:59.999Z`)];
  }
  if (evidence.kind === "relative" && evidence.earliest && evidence.latest) {
    const start = Date.parse(evidence.earliest), end = Date.parse(evidence.latest);
    return Number.isFinite(start) && Number.isFinite(end) && start <= end ? [start, end] : null;
  }
  return null;
}

/** Unknown dates never manufacture reposts. Relative dates retain the original observation anchor. */
export function sameOccurrence(previous: PostingEvidence, next: PostingEvidence): boolean {
  const left = range(previous), right = range(next);
  if (!left || !right) return true;
  return left[0] <= right[1] && right[0] <= left[1];
}

export function occurrenceKey(identityKey: string, evidence: PostingEvidence): string {
  const dates = range(evidence);
  return hash(`${identityKey}:${dates ? dates.join(":") : "undated"}`);
}
