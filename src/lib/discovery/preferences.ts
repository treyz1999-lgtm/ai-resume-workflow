import type { DiscoveryPreferences } from "@/lib/knowledge-contracts";

const roleTerms = (value: string): string[] => value.toLowerCase()
  .replace(/\bswe\b/g, "software engineer")
  .replace(/\b(?:developers?|engineers?|programmers?)\b/g, "engineer")
  .replace(/\b(?:analytics|analysts?)\b/g, "analyst")
  .replace(/\b(?:back|front)[ -]end\b/g, part => part.replace(/[ -]/g, ""))
  .replace(/\b(?:senior|junior|sr|jr|i{1,3}|staff|entry|level|lead|principal|associate|a|of|and|the)\b/g, " ")
  .match(/[\p{L}\d]+/gu) ?? [];

function similarRole(desired: string, title: string): boolean {
  const wanted = roleTerms(desired);
  const actual = new Set(roleTerms(title));
  if (!actual.size || wanted.every(token => actual.has(token))) return true;
  // Specialties distinguish data, mechanical and sales engineers. Common software
  // specialties also match a general software engineering preference.
  return wanted.includes("software") && wanted.includes("engineer") && actual.has("engineer")
    && ["backend", "frontend", "fullstack", "full", "platform", "application", "web", "mobile"].some(token => actual.has(token));
}

function period(value: string) {
  const matches = [
    ["year", /\b(?:year(?:ly)?|annual(?:ly)?|annum|yr)\b/i],
    ["month", /\b(?:month(?:ly)?|mo)\b/i],
    ["week", /\bweek(?:ly)?\b/i],
    ["hour", /\b(?:hour(?:ly)?|hr)\b/i],
  ] as const;
  const found = matches.filter(([, expression]) => expression.test(value));
  return found.length === 1 ? found[0][0] : null;
}

// Only compare an explicit same-currency, same-period upper bound. An hourly
// offer and an annual preference need more context than a source search gives.
function belowSalary(salary: string, preferences: DiscoveryPreferences): boolean {
  if (preferences.minimumSalary === null || !salary) return false;
  const expectedPeriod = period(preferences.constraints);
  if (!expectedPeriod || period(salary) !== expectedPeriod) return false;
  if (!salary.toUpperCase().match(/\b[A-Z]{3}\b/g)?.includes(preferences.salaryCurrency)) return false;
  if (/\b(?:from|minimum|starting|at least)\b|\d\s*\+/.test(salary.toLowerCase())) return false;
  const values = [...salary.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/gi)]
    .map(match => Number(match[1].replaceAll(",", "")) * (match[2] ? 1000 : 1));
  return values.length > 0 && Math.max(...values) < preferences.minimumSalary;
}

export function matchesPreferences(job: { role: string; company: string; location: string; remote: boolean | null; salary: string }, preferences: DiscoveryPreferences) {
  const fold = (value: string) => value.trim().toLowerCase();
  if (preferences.excludedCompanies.some(company => fold(company) === fold(job.company))) return false;
  if (job.role && preferences.roles.length && !preferences.roles.some(role => similarRole(role, job.role))) return false;
  const location = fold(job.location);
  const mode = /\bhybrid\b/.test(location) ? "hybrid" : job.remote === true || /\bremote\b/.test(location) ? "remote"
    : /\bon[ -]?site\b/.test(location) ? "onsite" : "";
  if (mode && preferences.workArrangements.length && !preferences.workArrangements.some(value => fold(value).replace(/[ -]/g, "").includes(mode))) return false;
  const geographic = location.replace(/\b(?:fully|remote|hybrid|on[ -]?site|worldwide|global|anywhere)\b/g, "").replace(/[^\p{L}\d]+/gu, " ").trim();
  if (geographic && preferences.locations.length && !preferences.locations.some(value => {
    const desired = fold(value).replace(/[^\p{L}\d]+/gu, " ").trim();
    return (" " + geographic + " ").includes(" " + desired + " ") || (" " + desired + " ").includes(" " + geographic + " ");
  })) return false;
  return !belowSalary(job.salary, preferences);
}
