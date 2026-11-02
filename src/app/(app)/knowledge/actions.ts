"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { saveKnowledgeDetail, saveWorkflowPreferences } from "@/lib/knowledge";
import { discoveryPreferencesSchema, knowledgeDetailSchema, tailoringPreferencesSchema } from "@/lib/knowledge-contracts";

export const saveDetail = action(knowledgeDetailSchema, async input => {
  await saveKnowledgeDetail(input);
  revalidatePath("/knowledge");
  return null;
});

export const savePreferences = action(z.object({ discovery: discoveryPreferencesSchema, tailoring: tailoringPreferencesSchema }), async input => {
  await saveWorkflowPreferences(input);
  revalidatePath("/knowledge");
  return null;
});
