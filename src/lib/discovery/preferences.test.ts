import { describe, expect, it } from "vitest";
import { DEFAULT_DISCOVERY_PREFERENCES } from "@/lib/knowledge-contracts";
import { matchesPreferences, requiredExperienceYears } from "./preferences";
const job = { role: "Software Engineer", company: "Example", location: "Phoenix, AZ", remote: false, salary: "", jd: "" };
const preferences = { ...DEFAULT_DISCOVERY_PREFERENCES, roles: ["Software Engineer"], locations: ["United States"] };
describe("experience discovery filters", () => {
  it("uses the lower bound of a range and ignores unrelated years", () => {
    expect(requiredExperienceYears("Founded 20 years ago. 3-5 years of software development experience required.")).toBe(3);
    expect(requiredExperienceYears("Four-year degree. 5 years of paid leave benefits.")).toBeNull();
  });
  it("does not turn preferred experience into a requirement", () => {
    expect(requiredExperienceYears("Required qualifications:\n1 year of experience\nPreferred qualifications:\n5 years of cloud experience")).toBe(1);
    expect(requiredExperienceYears("5 years of experience preferred.")).toBeNull();
  });
  it("does not treat technology alternatives as experience alternatives", () => {
    expect(requiredExperienceYears("5 years of backend experience with Java or Python and 1 year of leadership experience")).toBe(5);
  });
  it("allows a lower experience alternative", () => {
    expect(requiredExperienceYears("5 years of experience or 2 years of experience with a graduate degree")).toBe(2);
  });
  it("filters senior titles and higher required years for early career", () => {
    const early = { ...preferences, experienceLevel: "early-career" as const };
    expect(matchesPreferences({ ...job, role: "Senior Software Engineer" }, early)).toBe(false);
    expect(matchesPreferences({ ...job, jd: "3+ years of relevant experience required" }, early)).toBe(false);
    expect(matchesPreferences({ ...job, jd: "0-2 years of experience" }, early)).toBe(true);
    expect(matchesPreferences({ ...job, jd: "3 years of experience" }, { ...early, maximumExperienceYears: 3 })).toBe(true);
  });
  it("preserves unknowns by default and honors the explicit unknown toggle", () => {
    expect(matchesPreferences(job, preferences)).toBe(true);
    expect(matchesPreferences(job, { ...preferences, includeUnknownExperience: false })).toBe(false);
    expect(matchesPreferences({ ...job, role: "Junior Software Engineer" }, { ...preferences, includeUnknownExperience: false })).toBe(true);
    expect(matchesPreferences({ ...job, jd: "No previous experience required" }, { ...preferences, includeUnknownExperience: false })).toBe(true);
  });
  it("matches early career search wording without requiring those words in the title", () => {
    expect(matchesPreferences(job, { ...preferences, roles: ["Early career software engineer"] })).toBe(true);
  });
});
describe("discovery geography", () => {
  it.each(["Phoenix, AZ", "Phoenix, Arizona", "San Francisco, CA", "New York, NY", "United States", "USA", "U.S."])("includes %s for nationwide US", location => {
    expect(matchesPreferences({ ...job, location }, preferences)).toBe(true);
  });
  it("matches state aliases and keeps foreign locations outside a US search", () => {
    expect(matchesPreferences(job, { ...preferences, locations: ["Arizona"] })).toBe(true);
    expect(matchesPreferences({ ...job, location: "Toronto, Canada" }, preferences)).toBe(false);
    expect(matchesPreferences({ ...job, location: "London, UK" }, preferences)).toBe(false);
  });
  it.each(["Tucson, AZ", "Oro Valley, AZ", "Marana, Arizona", "Sahuarita, AZ", "Vail, AZ"])("excludes Tucson metro %s", location => {
    expect(matchesPreferences({ ...job, location }, { ...preferences, excludedLocations: ["Tucson"] })).toBe(false);
  });
  it("keeps Phoenix and Vail Colorado while excluding Tucson", () => {
    const excluded = { ...preferences, excludedLocations: ["Tucson"] };
    expect(matchesPreferences(job, excluded)).toBe(true);
    expect(matchesPreferences({ ...job, location: "Vail, CO" }, excluded)).toBe(true);
  });
});
