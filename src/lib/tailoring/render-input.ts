import { z } from "zod";
import { latexWebUrl } from "../templates/v5";
import { themeFieldsSchema } from "../theme-file";

const text = z.string().max(8000);
const list = z.array(text).max(150);
const web = z.string().max(2048).refine(value => {
  try { latexWebUrl(value); return true; } catch { return false; }
}, "A project or contact link is invalid.");
const optionalWeb = z.union([web, z.literal("")]).optional();
const contact = z.object({ name: text.min(1), email: z.union([z.email(), z.literal("")]).optional(), phone: text.optional(), location: text.optional(), website: optionalWeb, linkedin: optionalWeb, github: optionalWeb }).strict();
export const resumeRenderSchema = z.object({
  contact,
  skills: z.array(z.object({ category: text, items: list })).max(100),
  experience: z.array(z.object({ role: text, company: text, location: text, dates: text, bullets: list, includeSwe: z.boolean(), includeData: z.boolean() })).max(100),
  projects: z.array(z.object({ name: text.min(1), url: web, stack: list, bullets: list })).min(1).max(5)
    .refine(rows => new Set(rows.map(x => x.name.trim().toLowerCase())).size === rows.length, "Duplicate displayed project."),
  education: z.array(z.object({ school: text, degree: text, location: text.optional(), dates: text, details: list.optional() })).max(100),
}).strict();
export const letterRenderSchema = z.object({ contact, date: text, company: text, role: text, salutation: text, paragraphs: list.min(1), closing: text }).strict();
export const themeSnapshotSchema = themeFieldsSchema.extend({ id: z.string().min(1), builtIn: z.boolean() });
export const printSnapshotSchema = z.object({ version: z.literal(1), track: z.enum(["swe","data"]), resume: resumeRenderSchema, theme: themeSnapshotSchema });
export type PrintSnapshot = z.infer<typeof printSnapshotSchema>;

