"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { checkStatusUpdates, resolveStatusFinding } from "@/lib/google/status-report";

export const checkUpdates = action(z.object({}), async () => {
  const result = await checkStatusUpdates();
  revalidatePath("/", "layout");
  return result;
});

export const resolveFinding = action(z.object({
  id: z.string().min(1),
  applicationId: z.string().min(1).nullable(),
}), async ({ id, applicationId }) => {
  await resolveStatusFinding(id, applicationId);
  revalidatePath("/", "layout");
  return null;
});
