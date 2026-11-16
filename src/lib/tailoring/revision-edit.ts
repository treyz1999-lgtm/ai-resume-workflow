import { z } from "zod";
import type { TailoredContent } from "./contracts";

export const revisionRequest = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("manual"), index: z.number().int().nonnegative(), text: z.string().trim().min(1).max(3000) }),
  z.object({ mode: z.literal("chat"), instruction: z.string().trim().min(1).max(3000) }),
  z.object({ mode: z.literal("restore"), generation: z.number().int().positive() }),
]);
export type RevisionRequest = z.infer<typeof revisionRequest>;

// buildContent emits one evidence mapping for each experience bullet, project
// bullet and letter paragraph, in that order. Keep repeated text in other
// entries independent, even when both snippets have identical wording.
export function editClaim(base: TailoredContent, index: number, text: string) {
  const next = structuredClone(base);
  const groups = [
    ...next.resume.experience.map(role => role.bullets),
    ...next.resume.projects.map(project => project.bullets),
    next.letter?.paragraphs ?? [],
  ];
  const claim = next.evidence[index];
  let offset = index;
  for (const group of groups) {
    if (offset >= group.length) { offset -= group.length; continue; }
    if (!claim || group[offset] !== claim.text) break;
    const metrics = (s: string) => s.match(/\d+(?:[.,]\d+)*(?:%|\+)?/g) ?? [];
    if (metrics(text).some(n => !metrics(claim.quote).includes(n))) throw new Error("A metric in the edit is missing from its KB quote.");
    if (group.some((line, i) => i !== offset && line.trim().toLowerCase() === text.toLowerCase())) throw new Error("The edit duplicates another statement in this section.");
    group[offset] = text;
    claim.text = text;
    return next;
  }
  throw new Error("The selected statement does not match this revision.");
}
