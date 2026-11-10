import "server-only";
import { ActionError } from "@/lib/action";
import { createHash } from "node:crypto";
import { fetchPosting } from "@/lib/posting-fetch";
import { searchPostings, postingDetails } from "@/lib/job-search";
import { credentialsFor, loadJobSearchConfig, requestContext } from "@/lib/job-search/config";
import { EMPTY_QUERY, postingText } from "@/lib/job-search/search";
import { fetchYcStartups, hnItemLink } from "@/lib/startups/sources/yc";
import { fetchHnStartups } from "@/lib/startups/sources/hn";
import { placeOf } from "@/lib/startups/place";
import type { FoundStartup } from "@/lib/startups/types";
import type { DiscoveryPreferences } from "@/lib/knowledge-contracts";
import { discoveryInputSchema, intakeSchema, type DiscoveryConfig, type DiscoveryInput, type IntakeInput, type PostingEvidence, type SourceResult } from "./contracts";

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
function evidenceFromText(text: string): PostingEvidence {
  const raw = text.match(/(?:^|\n)[^\n]*(?:reposted|posted|datePosted)[^\n]*/i)?.[0].trim() ?? "";
  return dateEvidence(raw.slice(0, 2000));
}
export async function resolveIntake(input: IntakeInput, signal: AbortSignal): Promise<DiscoveryInput> {
  const value = intakeSchema.parse(input); signal.throwIfAborted();
  let jd = value.jd.trim(); let url = value.url.trim();
  if (!jd) {
    const result = await fetchPosting(url);
    signal.throwIfAborted();
    if (!result.ok) throw new ActionError(result.error);
    jd = result.text; url = result.url;
  }
  return discoveryInputSchema.parse({ source: value.jd.trim() ? "TEXT" : "URL", externalId: url || createHash("sha256").update(jd).digest("hex"),
    url, company: value.company, role: value.role, jd, complete: true, postingEvidence: evidenceFromText(jd) });
}

async function fromStartup(startup: FoundStartup, signal: AbortSignal): Promise<DiscoveryInput> {
  let jd = [startup.company, startup.summary, startup.location, startup.details].filter(Boolean).join("\n\n");
  // Upstream caps startup details at 20k. Never mislabel a clipped post as complete.
  let complete = Boolean(startup.details) && startup.details.length < 20_000;
  const link = startup.links.find(item => /job|apply|posting/i.test(item.label))?.url || startup.links[0]?.url || hnItemLink(startup.externalId);
  if (!complete && link) {
    const fetched = await fetchPosting(link); signal.throwIfAborted();
    if (fetched.ok) { jd = fetched.text; complete = true; }
  }
  return discoveryInputSchema.parse({ source: startup.source, externalId: startup.externalId, url: link, company: startup.company,
    role: startup.roles.join(" / "), jd, complete, postingEvidence: dateEvidence(startup.postedAt ?? "", new Date(), startup.postedAt) });
}

/** Explicit exclusions are exact company constraints. Role titles are search hints, not exact filters. */
export async function collectDiscovery(config: DiscoveryConfig, preferences: DiscoveryPreferences, signal: AbortSignal): Promise<{ postings: DiscoveryInput[]; sources: SourceResult[] }> {
  const sources = [...new Set(config.sources)];
  const outcomes = await Promise.allSettled(sources.map(async source => {
    signal.throwIfAborted();
    if (source === "JSEARCH") {
      const jobConfig = await loadJobSearchConfig();
      if (jobConfig.source !== "JSEARCH") throw new Error("Select JSearch and configure its key in Settings → Job search.");
      if (!preferences.roles.length) throw new Error("Add desired roles in Knowledge base → Discovery preferences.");
      const credentials = credentialsFor(jobConfig, "JSEARCH");
      const context = { ...requestContext("JSEARCH"), signal, fresh: true };
      const results: DiscoveryInput[] = [];
      for (const role of preferences.roles) {
        for (const place of preferences.locations.length ? preferences.locations : [""]) {
          signal.throwIfAborted();
          const page = await searchPostings("JSEARCH", credentials, { ...EMPTY_QUERY, keywords: role, place, country: config.country,
            remoteOnly: preferences.workArrangements.length === 1 && preferences.workArrangements[0].toLowerCase() === "remote", postedWithin: "month" }, null, context);
          for (const posting of page.postings) {
            let description = posting.description; let complete = posting.complete;
            if (!complete) {
              try { const full = await postingDetails("JSEARCH", credentials, posting, context); if (full) { description = full; complete = true; } } catch { signal.throwIfAborted(); }
              if (!complete && posting.url) {
                const fetched = await fetchPosting(posting.url); signal.throwIfAborted();
                if (fetched.ok) { description = fetched.text; complete = true; }
              }
            }
            results.push(discoveryInputSchema.parse({ source, externalId: posting.externalId, url: posting.url, company: posting.company,
              role: posting.title, jd: postingText({ ...posting, description }), complete,
              postingEvidence: dateEvidence(posting.postedAt ?? "", new Date(), posting.postedAt) }));
          }
        }
      }
      return results;
    }
    const startups = source === "YC" ? await fetchYcStartups(signal) : await fetchHnStartups(placeOf({ city: "", country: "" }), signal);
    // Each source owns its raw fetch; one source failing never hides the others.
    const result: DiscoveryInput[] = [];
    for (const startup of startups) { signal.throwIfAborted(); result.push(await fromStartup(startup, signal)); }
    return result;
  }));
  signal.throwIfAborted();
  const excluded = new Set(preferences.excludedCompanies.map(value => value.trim().toLowerCase()));
  return {
    postings: outcomes.flatMap(result => result.status === "fulfilled" ? result.value.filter(item => !excluded.has(item.company.trim().toLowerCase())) : []),
    sources: outcomes.map((result, index) => ({ source: sources[index], found: result.status === "fulfilled" ? result.value.length : 0,
      error: result.status === "fulfilled" ? null : sources[index] === "JSEARCH" ? "JSearch failed. Check its source selection, credentials, country and discovery role preferences; retry the scan." : `${sources[index]} could not be reached or returned an invalid posting. Retry the scan.` })),
  };
}
