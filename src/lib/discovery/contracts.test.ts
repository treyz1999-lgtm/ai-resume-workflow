import { describe, expect, it } from "vitest";
import { DEFAULT_DISCOVERY_CONFIG, discoveryConfigSchema, intakeSchema, postingEvidenceSchema } from "./contracts";

describe("discovery input boundaries", () => {
  it("starts off with a ten minute interval and subscription execution", () => {
    expect(discoveryConfigSchema.parse(DEFAULT_DISCOVERY_CONFIG)).toMatchObject({ enabled: false, intervalMinutes: 10, provider: "codex" });
  });
  it("accepts the full interval range but rejects zero and excessive frequency values", () => {
    for (const intervalMinutes of [1, 60]) expect(discoveryConfigSchema.safeParse({ ...DEFAULT_DISCOVERY_CONFIG, intervalMinutes }).success).toBe(true);
    for (const intervalMinutes of [0, 61, 1.5]) expect(discoveryConfigSchema.safeParse({ ...DEFAULT_DISCOVERY_CONFIG, intervalMinutes }).success).toBe(false);
  });
  it("requires real timezone and valid local clock values", () => {
    expect(discoveryConfigSchema.safeParse({ ...DEFAULT_DISCOVERY_CONFIG, timeZone: "America/Phoenix" }).success).toBe(true);
    expect(discoveryConfigSchema.safeParse({ ...DEFAULT_DISCOVERY_CONFIG, timeZone: "imaginary/time" }).success).toBe(false);
    for (const startTime of ["24:00", "9:00", "12:60"]) expect(discoveryConfigSchema.safeParse({ ...DEFAULT_DISCOVERY_CONFIG, startTime }).success).toBe(false);
  });
  it("cannot re-enable removed sources or automatic tailoring through configuration", () => {
    expect(discoveryConfigSchema.safeParse({ ...DEFAULT_DISCOVERY_CONFIG, sources: ["ADZUNA"] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ ...DEFAULT_DISCOVERY_CONFIG, sources: ["ARBEITSAGENTUR"] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ ...DEFAULT_DISCOVERY_CONFIG, autoDraft: true }).success).toBe(false);
  });
  it("accepts either intake mode and rejects empty input", () => {
    const base = { url: "", jd: "", company: "", role: "" };
    expect(intakeSchema.safeParse(base).success).toBe(false);
    expect(intakeSchema.safeParse({ ...base, url: "https://example.com/jobs/1" }).success).toBe(true);
    expect(intakeSchema.safeParse({ ...base, jd: "A fictional role requiring SQL." }).success).toBe(true);
    expect(intakeSchema.safeParse({ ...base, url: "file:///private" }).success).toBe(false);
  });
  it("keeps unknown date evidence explicit instead of inventing a posting date", () => {
    const evidence = { raw: "", kind: "unknown", observedAt: "2026-11-03T12:00:00.000Z", date: null, earliest: null, latest: null, reposted: false };
    expect(postingEvidenceSchema.parse(evidence)).toEqual(evidence);
  });
});
