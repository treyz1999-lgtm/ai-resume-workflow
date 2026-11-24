import "server-only";
import { ActionError } from "@/lib/action";
import { createHash } from "node:crypto";
import { fetchPosting } from "@/lib/posting-fetch";
import { matchesPreferences } from "./preferences";
import { collectWebDiscovery } from "./web-search";
import { searchPostings, postingDetails } from "@/lib/job-search";
import { credentialsFor, loadJobSearchConfig, requestContext } from "@/lib/job-search/config";
import { EMPTY_QUERY, postingText } from "@/lib/job-search/search";
import { fetchYcStartups, hnItemLink } from "@/lib/startups/sources/yc";
import { fetchHnStartups } from "@/lib/startups/sources/hn";
import { placeOf } from "@/lib/startups/place";
import type { FoundStartup } from "@/lib/startups/types";
import type { DiscoveryPreferences } from "@/lib/knowledge-contracts";
import { discoveryInputSchema, intakeSchema, type DiscoveryConfig, type DiscoveryInput, type IntakeInput, type SourceResult } from "./contracts";

export { dateEvidence } from "./date-evidence";
import { dateEvidence, evidenceFromText } from "./date-evidence";
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
    if (fetched.ok && fetched.source === "structured") { jd = fetched.text; complete = true; }
  }
  return discoveryInputSchema.parse({ source: startup.source, externalId: startup.externalId, url: link, company: startup.company,
    role: startup.roles.join(" / "), jd, complete, postingEvidence: dateEvidence(startup.postedAt ?? "", new Date(), startup.postedAt) });
}

/** Explicit exclusions are exact company constraints. Role titles are search hints, not exact filters. */
export async function collectDiscovery(config: DiscoveryConfig, preferences: DiscoveryPreferences, signal: AbortSignal): Promise<{ postings: DiscoveryInput[]; sources: SourceResult[] }> {
  const sources = [...new Set(config.sources)];
  let webSources: SourceResult[] = [];
  const outcomes = await Promise.allSettled(sources.map(async source => {
    signal.throwIfAborted();
    if (source === "WEB") { const result = await collectWebDiscovery(config, preferences, signal); webSources = result.sources; return result.postings; }
    if (source === "JSEARCH") {
      const jobConfig = await loadJobSearchConfig();
      if (jobConfig.source !== "JSEARCH") throw new ActionError("Select JSearch and configure its key in Settings → Job search.");
      if (!preferences.roles.length) throw new ActionError("Add desired roles in Knowledge base → Discovery preferences.");
      const credentials = credentialsFor(jobConfig, "JSEARCH");
      const context = { ...requestContext("JSEARCH"), signal, fresh: true };
      const results: DiscoveryInput[] = [];
      const roles = [...new Set(preferences.roles)];
      const places = [...new Set(preferences.locations.length ? preferences.locations : [""])];
      if (roles.length * places.length > 12) throw new ActionError("JSearch permits at most 12 role and location combinations per scan. Narrow your discovery preferences.");
      const seen = new Set<string>();
      for (const role of roles) {
        for (const place of places) {
          signal.throwIfAborted();
          const page = await searchPostings("JSEARCH", credentials, { ...EMPTY_QUERY, keywords: role, place, country: config.country,
            remoteOnly: preferences.workArrangements.length === 1 && preferences.workArrangements[0].toLowerCase() === "remote", postedWithin: "month" }, null, context);
          for (const posting of page.postings) {
            const key = JSON.stringify([posting.externalId, posting.postedAt]);
            if (seen.has(key)) continue;
            seen.add(key);
            let description = posting.description; let complete = posting.complete;
            if (!complete) {
              try { const full = await postingDetails("JSEARCH", credentials, posting, context); if (full) { description = full; complete = true; } } catch { signal.throwIfAborted(); }
              if (!complete && posting.url) {
                const fetched = await fetchPosting(posting.url); signal.throwIfAborted();
                if (fetched.ok) { description = fetched.text; complete = true; }
              }
            }
            if (!matchesPreferences({ company: posting.company, role: posting.title, remote: posting.remote, location: posting.place, salary: posting.salary, jd: description }, { ...preferences, includeUnknownExperience: true })) continue;
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
    for (const startup of startups) {
      signal.throwIfAborted();
      const salary = startup.details.split("\n").find(line => /salary|compensation/i.test(line)) ?? "";
      if (!matchesPreferences({ company: startup.company, role: startup.roles.join(" / "), remote: startup.remote, location: startup.location, salary, jd: startup.details }, { ...preferences, includeUnknownExperience: true })) continue;
      result.push(await fromStartup(startup, signal));
    }
    return result;
  }));
  signal.throwIfAborted();
  return {
    postings: outcomes.flatMap(result => result.status === "fulfilled" ? result.value : []),
    sources: [...webSources, ...outcomes.map((result, index) => ({ source: sources[index], found: result.status === "fulfilled" ? result.value.length : 0,
      error: result.status === "fulfilled" ? null : result.reason instanceof ActionError ? result.reason.message : sources[index] === "JSEARCH" ? "JSearch failed. Check its source selection, credentials, country and discovery role preferences; retry the scan." : `${sources[index]} could not be reached or returned an invalid posting. Retry the scan.` })).filter(result => result.source !== "WEB" || result.error)],
  };
}
