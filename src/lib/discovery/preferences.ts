import type { DiscoveryPreferences } from "@/lib/knowledge-contracts";

const roleTerms = (value: string): string[] => value.toLowerCase()
  .replace(/\bswe\b/g, "software engineer")
  .replace(/\b(?:developers?|engineers?|programmers?)\b/g, "engineer")
  .replace(/\b(?:analytics|analysts?)\b/g, "analyst")
  .replace(/\b(?:back|front)[ -]end\b/g, part => part.replace(/[ -]/g, ""))
  .replace(/\b(?:senior|junior|sr|jr|i{1,3}|staff|entry|level|early|career|lead|principal|associate|a|of|and|the)\b/g, " ")
  .match(/[\p{L}\d]+/gu) ?? [];

function similarRole(desired: string, title: string): boolean {
  const wanted = roleTerms(desired);
  const actual = new Set(roleTerms(title));
  if (!actual.size || wanted.every(token => actual.has(token))) return true;
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

/** Only years attached to experience; benefits, company age and education are not experience. */
export function requiredExperienceYears(description: string): number | null {
  const requirements: number[] = [];
  let preferredSection = false;
  for (const line of description.split(/\n|[.;](?:\s|$)/)) {
    const text = line.trim();
    if (/^(?:preferred|desired|nice[- ]to[- ]have|bonus)(?:\s+(?:qualifications|requirements|skills))?\s*:?$/i.test(text)) { preferredSection = true; continue; }
    if (/^(?:required|minimum|basic)(?:\s+(?:qualifications|requirements|skills))?\s*:?$/i.test(text) || /^(?:requirements|qualifications|responsibilities)\s*:?$/i.test(text)) preferredSection = false;
    if (preferredSection || /\b(?:preferred|nice[- ]to[- ]have|bonus|ideally|desired)\b/i.test(text)) continue;
    const values = [...text.matchAll(/\b(\d{1,2})(?:\s*(?:-|–|to)\s*\d{1,2})?\s*\+?\s*years?\s+(?:of\s+)?(?:[a-z-]+\s+){0,5}experience\b/gi)].map(match => Number(match[1]));
    if (values.length) requirements.push(/\bor\s+(?:(?:a|an)\s+)?(?:\d|master|bachelor|ph\.?d)/i.test(text) ? Math.min(...values) : Math.max(...values));
    else if (/\bno\s+(?:prior\s+|previous\s+)?experience\s+(?:is\s+)?(?:required|necessary)\b/i.test(text)) requirements.push(0);
  }
  return requirements.length ? Math.max(...requirements) : null;
}

function matchesExperience(job: { role: string; jd?: string }, preferences: DiscoveryPreferences): boolean {
  const early = preferences.experienceLevel === "early-career";
  if (early && /\b(?:senior|sr\.?|staff|principal|lead|manager|director|architect|head|vp)\b/i.test(job.role)) return false;
  const maximum = preferences.maximumExperienceYears ?? (early ? 2 : null);
  const years = requiredExperienceYears(job.jd ?? "");
  if (years !== null) return maximum === null || years <= maximum;
  const explicitEarlyTitle = /\b(?:entry[- ]level|early[- ]career|junior|jr\.?|new grad(?:uate)?|graduate|associate)\b|\b(?:engineer|developer)\s+(?:i|1)\b/i.test(job.role);
  return preferences.includeUnknownExperience !== false || explicitEarlyTitle;
}

const STATES = "Alabama:AL|Alaska:AK|Arizona:AZ|Arkansas:AR|California:CA|Colorado:CO|Connecticut:CT|Delaware:DE|Florida:FL|Georgia:GA|Hawaii:HI|Idaho:ID|Illinois:IL|Indiana:IN|Iowa:IA|Kansas:KS|Kentucky:KY|Louisiana:LA|Maine:ME|Maryland:MD|Massachusetts:MA|Michigan:MI|Minnesota:MN|Mississippi:MS|Missouri:MO|Montana:MT|Nebraska:NE|Nevada:NV|New Hampshire:NH|New Jersey:NJ|New Mexico:NM|New York:NY|North Carolina:NC|North Dakota:ND|Ohio:OH|Oklahoma:OK|Oregon:OR|Pennsylvania:PA|Rhode Island:RI|South Carolina:SC|South Dakota:SD|Tennessee:TN|Texas:TX|Utah:UT|Vermont:VT|Virginia:VA|Washington:WA|West Virginia:WV|Wisconsin:WI|Wyoming:WY|District of Columbia:DC".split("|").map(item => item.split(":"));
function geography(value: string): string {
  let normalized = value.toLowerCase().replace(/\bu\.?s\.?a?\.?\b|\bunited states(?: of america)?\b/g, "us")
    .replace(/\b(?:fully|remote|hybrid|on[ -]?site|worldwide|global|anywhere)\b/g, " ").replace(/[^\p{L}\d]+/gu, " ").trim();
  for (const [name, code] of STATES) normalized = normalized.replace(new RegExp(`\\b${name.toLowerCase()}\\b`, "g"), code.toLowerCase());
  return normalized.replace(/\s+/g, " ");
}
const contains = (value: string, phrase: string) => Boolean(phrase) && (` ${value} `).includes(` ${phrase} `);
function isUnitedStates(value: string) {
  return contains(value, "us") || (!/\b(?:canada|australia|united kingdom|uk|india|germany)\b/.test(value) && STATES.some(([, code]) => contains(value, code.toLowerCase())));
}
function excludedLocation(location: string, exclusions: string[]): boolean {
  return exclusions.some(value => {
    const excluded = geography(value);
    if (contains(location, excluded)) return true;
    // Tucson metro includes these adjacent Arizona communities. Vail is also a Colorado town.
    return contains(excluded, "tucson") && (/\b(?:oro valley|marana|sahuarita|south tucson|catalina foothills)\b/.test(location)
      || (contains(location, "vail") && contains(location, "az")));
  });
}

export function matchesPreferences(job: { role: string; company: string; location: string; remote: boolean | null; salary: string; jd?: string }, preferences: DiscoveryPreferences) {
  const fold = (value: string) => value.trim().toLowerCase();
  if (preferences.excludedCompanies.some(company => fold(company) === fold(job.company))) return false;
  if (job.role && preferences.roles.length && !preferences.roles.some(role => similarRole(role, job.role))) return false;
  if (!matchesExperience(job, preferences)) return false;
  const location = fold(job.location);
  const mode = /\bhybrid\b/.test(location) ? "hybrid" : job.remote === true || /\bremote\b/.test(location) ? "remote"
    : /\bon[ -]?site\b/.test(location) ? "onsite" : "";
  if (mode && preferences.workArrangements.length && !preferences.workArrangements.some(value => fold(value).replace(/[ -]/g, "").includes(mode))) return false;
  const geographic = geography(location);
  if (excludedLocation(geographic, preferences.excludedLocations ?? [])) return false;
  if (geographic && preferences.locations.length && !preferences.locations.some(value => {
    const desired = geography(value);
    return desired === "us" && isUnitedStates(geographic) || contains(geographic, desired) || contains(desired, geographic);
  })) return false;
  return !belowSalary(job.salary, preferences);
}
