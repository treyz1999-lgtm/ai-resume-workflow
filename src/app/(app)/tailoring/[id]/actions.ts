"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { queueRevision } from "@/lib/tailoring/document-review";
import { revisionRequest } from "@/lib/tailoring/revision-edit";
import { markTailoringSubmitted } from "@/lib/tailoring/submission";

const id = z.string().min(1).max(200);
export const revise = action(z.object({ id, generation: z.number().int().positive(), request: revisionRequest }), async input => {
  await queueRevision(input.id, input.generation, input.request);
  revalidatePath("/tailoring");
  revalidatePath("/tailoring/" + input.id);
  return null;
});
export const submitDocuments = action(z.object({ id, resume: id, letter: id.nullable(), date: z.iso.date() }), async input => {
  await markTailoringSubmitted(input.id, input.resume, input.letter, input.date);
  for (const path of ["/", "/applications", "/tailoring", "/tailoring/" + input.id]) revalidatePath(path);
  return null;
});
