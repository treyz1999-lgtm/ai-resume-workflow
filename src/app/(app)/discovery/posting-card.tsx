"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DiscoveryPostingView, PostingState } from "@/lib/discovery/contracts";

export const eligible = (posting: DiscoveryPostingView) => posting.complete && posting.coverage !== null && !posting.analysisError && !posting.selected && posting.state !== "DISMISSED";
export function displayTime(value: string | null) { return value ? value.replace("T", " ").replace(/\.\d+Z$/, " UTC") : "Unknown"; }

export function PostingCard({ posting, checked, busy, onCheck, onState, onSelect }: {
  posting: DiscoveryPostingView; checked: boolean; busy: boolean; onCheck: (checked: boolean) => void;
  onState: (state: PostingState) => void; onSelect: () => void;
}) {
  const title = posting.role || "Role not identified";
  const extracted = posting.extracted;
  const fields = extracted ? [
    ["Track", extracted.track], ["Location", extracted.location], ["Work arrangement", extracted.arrangement],
    ["Salary as posted", extracted.salaryOriginal], ["Salary minimum", extracted.salaryMin], ["Salary maximum", extracted.salaryMax],
    ["Currency", extracted.salaryCurrency], ["Salary period", extracted.salaryPeriod], ["Experience as posted", extracted.experienceOriginal],
    ["Experience band", extracted.experienceBand], ["Requisition", extracted.requisition], ["Posting date wording", extracted.postingDateOriginal],
  ] : [];
  return <Card className="flex flex-col gap-4" aria-label={`${title} at ${posting.company || "Unknown company"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-medium">{title}</h3><p>{posting.company || "Unknown company"}</p><p className="text-sm text-muted">{posting.source} · {posting.state.toLowerCase()} · {posting.sightings} {posting.sightings === 1 ? "sighting" : "sightings"}</p></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={busy || !eligible(posting)} onChange={event => onCheck(event.target.checked)} />Select {title}</label>
    </div>
    <div className="flex flex-wrap gap-5 text-sm">
      <p><span className="block text-muted">KB evidence coverage</span><strong className="text-xl">{posting.coverage?.score == null ? "Not scored" : `${posting.coverage.score}%`}</strong></p>
      <p><span className="block text-muted">Keyword coverage</span><strong className="text-xl">{posting.coverage?.keywordCoverage == null ? "Unknown" : `${posting.coverage.keywordCoverage}%`}</strong></p>
      <p className="text-muted">{posting.complete ? "Complete JD stored" : "Incomplete JD — add the full posting before tailoring"}{posting.selected ? " · Selected for tailoring" : ""}</p>
    </div>
    {posting.analysisError && <p role="alert" className="text-danger">Analysis needs attention: {posting.analysisError}</p>}
    {posting.coverage && <div className="grid gap-4 sm:grid-cols-2">
      <div><h4 className="font-medium">Strengths</h4>{posting.coverage.strengths.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{posting.coverage.strengths.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="text-sm text-muted">No supported strengths identified.</p>}</div>
      <div><h4 className="font-medium">Gaps and partial coverage</h4>{posting.coverage.gaps.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{posting.coverage.gaps.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="text-sm text-muted">No gaps identified in the analyzed requirements.</p>}</div>
    </div>}
    <details><summary className="cursor-pointer font-medium">Posting details and evidence</summary><div className="mt-4 flex flex-col gap-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{fields.map(([name, value]) => <div key={String(name)}><dt className="text-muted">{name}</dt><dd>{value === null || value === "" ? "Unknown" : value}</dd></div>)}</dl>
      <p className="text-sm">Posting evidence: {posting.postingEvidence.raw || "No date evidence supplied"} ({posting.postingEvidence.kind}{posting.postingEvidence.reposted ? ", reposted" : ""})</p>
      <p className="text-sm text-muted">First seen: {displayTime(posting.firstSeenAt)} · Last seen: {displayTime(posting.lastSeenAt)} · Posted: {displayTime(posting.postedAt)}</p>
      {posting.kbSnapshotId && <a className="text-sm underline" href={`/knowledge?snapshot=${encodeURIComponent(posting.kbSnapshotId)}`}>Inspect the KB snapshot used</a>}
      {posting.coverage && <><p className="text-sm text-muted">Scoring method: {posting.coverage.method}. Core requirements carry weight 2; preferences weight 1. Direct evidence receives full credit; partial evidence receives half.</p>
        {posting.coverage.requirements.map((requirement, index) => <div key={index} className="rounded-card border border-line p-3 text-sm"><p className="font-medium">{requirement.text} · {requirement.importance} · {requirement.evidence}</p><p>{requirement.explanation}</p><blockquote className="mt-2 border-l-2 border-line pl-3">JD: {requirement.jdQuote}</blockquote>{requirement.kbQuotes.map((quote, i) => <blockquote className="mt-2 border-l-2 border-line pl-3" key={i}>KB: {quote}</blockquote>)}</div>)}
        <p className="text-sm">Keywords: {posting.coverage.keywords.map(item => `${item.keyword} (${item.covered ? "covered" : "missing"})`).join(", ") || "None identified"}</p></>}
      <h4 className="font-medium">Original job description</h4><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-card border border-line p-4 font-sans text-sm">{posting.jd}</pre>
    </div></details>
    <div className="flex flex-wrap gap-3">
      <Button disabled={busy || !eligible(posting)} onClick={onSelect}>{posting.selected ? "Selected for tailoring" : "Select for tailoring"}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => onState(posting.state === "SAVED" ? "NEW" : "SAVED")}>{posting.state === "SAVED" ? "Unsave" : "Save role"}</Button>
      <Button variant="text" disabled={busy} onClick={() => onState(posting.state === "DISMISSED" ? "NEW" : "DISMISSED")}>{posting.state === "DISMISSED" ? "Restore role" : "Dismiss"}</Button>
      {/^https?:\/\//i.test(posting.url) && <a href={posting.url} target="_blank" rel="noopener noreferrer" className="self-center text-sm underline">Open posting</a>}
    </div>
  </Card>;
}
