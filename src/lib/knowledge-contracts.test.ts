import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_IMAGE_MAX_BYTES, DEFAULT_DISCOVERY_PREFERENCES, DEFAULT_TAILORING_PREFERENCES,
  discoveryPreferencesSchema, isArchitectureImage, knowledgeDetailSchema, tailoringPreferencesSchema,
} from "./knowledge-contracts";

describe("knowledge inputs", () => {
  it("accepts only bounded embedded PNG/JPEG images, not links or active formats", () => {
    expect(isArchitectureImage("")).toBe(true);
    expect(isArchitectureImage("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isArchitectureImage("data:image/jpeg;base64,/9j/AA==")).toBe(true);
    for (const image of ["https://example.com/image.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,bm90LWFuLWltYWdl", "data:image/jpeg;base64,iVBORw0KGgo=", "data:image/png;base64,%%%%"])
      expect(isArchitectureImage(image)).toBe(false);
    expect(isArchitectureImage(`data:image/png;base64,${Buffer.alloc(ARCHITECTURE_IMAGE_MAX_BYTES + 1).toString("base64")}`)).toBe(false);
  });
  it("retains detailed evidence and rejects unsupported source kinds", () => {
    const detail = { kind: "project", entryId: "aurora", context: "I owned the ingestion worker.", architecture: "flowchart LR\nA-->B", architectureImage: "", includeSwe: true, includeData: false };
    expect(knowledgeDetailSchema.parse(detail)).toEqual(detail);
    expect(knowledgeDetailSchema.safeParse({ ...detail, kind: "application" }).success).toBe(false);
    expect(knowledgeDetailSchema.safeParse({ ...detail, context: "a".repeat(100_001) }).success).toBe(false);
  });
  it("normalizes preference currency but keeps explicit constraints and flexible titles", () => {
    const value = discoveryPreferencesSchema.parse({ ...DEFAULT_DISCOVERY_PREFERENCES, roles: [" Software Engineer "], salaryCurrency: "cad", constraints: "No relocation" });
    expect(value).toMatchObject({ roles: ["Software Engineer"], salaryCurrency: "CAD", constraints: "No relocation" });
    expect(discoveryPreferencesSchema.safeParse({ ...value, minimumSalary: -1 }).success).toBe(false);
    expect(discoveryPreferencesSchema.safeParse({ ...value, salaryCurrency: "dollars" }).success).toBe(false);
    expect(tailoringPreferencesSchema.parse(DEFAULT_TAILORING_PREFERENCES)).toEqual({ track: "auto", themeId: null, coverLetter: false });
    expect(tailoringPreferencesSchema.safeParse({ ...DEFAULT_TAILORING_PREFERENCES, track: "anything" }).success).toBe(false);
  });
});
