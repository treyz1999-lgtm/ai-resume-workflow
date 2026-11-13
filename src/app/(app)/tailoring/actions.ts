"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { cancelRun, moveRun, pauseQueue, removeRun, retryRun } from "@/lib/tailoring/queue";

const runId = z.string().min(1).max(200);
const target = z.object({ id: runId }).strict();

function refresh() {
  revalidatePath("/tailoring");
  revalidatePath("/discovery");
  return null;
}

export const setPaused = action(z.object({ paused: z.boolean() }).strict(), async ({ paused }) => {
  await pauseQueue(paused);
  return refresh();
});
export const move = action(target.extend({ direction: z.union([z.literal(-1), z.literal(1)]) }), async ({ id, direction }) => {
  await moveRun(id, direction);
  return refresh();
});
export const remove = action(target, async ({ id }) => {
  await removeRun(id);
  return refresh();
});
export const cancel = action(target, async ({ id }) => {
  await cancelRun(id);
  return refresh();
});
export const retry = action(target, async ({ id }) => {
  await retryRun(id);
  return refresh();
});
