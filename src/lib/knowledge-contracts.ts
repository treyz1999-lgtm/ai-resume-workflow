import { z } from "zod";

/** Keep the entire action below Next's default 1 MB request bound. */
export const ARCHITECTURE_IMAGE_MAX_BYTES = 512 * 1024;
const imageLimit = 4 * Math.ceil(ARCHITECTURE_IMAGE_MAX_BYTES / 3) + 30;

export function isArchitectureImage(value: string): boolean {
  if (value === "") return true;
  if (value.length > imageLimit) return false;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const bytes = atob(match[2]);
    if (bytes.length > ARCHITECTURE_IMAGE_MAX_BYTES) return false;
    const expected = match[1] === "png" ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
    return expected.every((byte, i) => bytes.charCodeAt(i) === byte);
  } catch { return false; }
}

export const knowledgeDetailSchema = z.object({
  kind: z.enum(["project", "experience"]),
  entryId: z.string().min(1).max(200),
  context: z.string().max(100_000),
  architecture: z.string().max(50_000),
  architectureImage: z.string().max(imageLimit).refine(isArchitectureImage, "Use a PNG or JPEG image up to 512 KB."),
  includeSwe: z.boolean(),
  includeData: z.boolean(),
}).strict();
export type KnowledgeDetailInput = z.infer<typeof knowledgeDetailSchema>;

const list = z.array(z.string().trim().min(1).max(200)).max(100);
export const discoveryPreferencesSchema = z.object({
  roles: list,
  locations: list,
  workArrangements: list,
  excludedCompanies: list,
  minimumSalary: z.number().finite().nonnegative().max(1_000_000_000).nullable(),
  salaryCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code.").transform(value => value.toUpperCase()),
  constraints: z.string().max(10_000),
}).strict();
export const tailoringPreferencesSchema = z.object({
  track: z.enum(["auto", "swe", "data"]),
  themeId: z.string().min(1).max(200).nullable(),
  coverLetter: z.boolean(),
}).strict();
export const workflowPreferencesSchema = z.object({ discovery: discoveryPreferencesSchema, tailoring: tailoringPreferencesSchema }).strict();
export type DiscoveryPreferences = z.infer<typeof discoveryPreferencesSchema>;
export type TailoringPreferences = z.infer<typeof tailoringPreferencesSchema>;
export type WorkflowPreferences = z.infer<typeof workflowPreferencesSchema>;
export const DEFAULT_DISCOVERY_PREFERENCES: DiscoveryPreferences = {
  roles: [], locations: [], workArrangements: [], excludedCompanies: [], minimumSalary: null, salaryCurrency: "USD", constraints: "",
};
export const DEFAULT_TAILORING_PREFERENCES: TailoringPreferences = { track: "auto", themeId: null, coverLetter: false };
