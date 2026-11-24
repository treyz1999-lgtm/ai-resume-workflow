"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { discoveryConfigSchema, intakeSchema, postingStateSchema } from "@/lib/discovery/contracts";
import { pauseDiscovery, resumeDiscovery, stopDiscovery, cancelDiscoveryScan, saveDiscoveryConfig, startDiscoverySession, stopDiscoverySession, requestDiscoveryScan, intakePosting, setDiscoveryState, selectForTailoring, removeTailoringSelection, retryDiscoveryScan } from "@/lib/discovery/service";

const ids = z.array(z.string().min(1).max(200)).min(1).max(100);
const empty = z.object({}).strict();
function refresh() { revalidatePath("/discovery"); revalidatePath("/jobs"); revalidatePath("/new"); }
export const pause = action(empty, async () => { await pauseDiscovery(); refresh(); return null; });
export const resume = action(empty, async () => { await resumeDiscovery(); refresh(); return null; });
export const stop = action(empty, async () => { await stopDiscovery(); refresh(); return null; });
export const cancelScan = action(z.object({ id: z.string().min(1).max(200) }).strict(), async ({ id }) => { await cancelDiscoveryScan(id); refresh(); return null; });
export const saveConfig = action(discoveryConfigSchema, async input => { await saveDiscoveryConfig(input); refresh(); return null; });
export const startSession = action(z.object({ hours: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(), async ({ hours }) => { await startDiscoverySession(hours); refresh(); return null; });
export const stopSession = action(empty, async () => { await stopDiscoverySession(); refresh(); return null; });
export const scanNow = action(empty, async () => { await requestDiscoveryScan(); refresh(); return null; });
export const addPosting = action(intakeSchema, async input => { await intakePosting(input); refresh(); return null; });
export const changeState = action(z.object({ ids, state: postingStateSchema }).strict(), async input => { await setDiscoveryState(input.ids, input.state); refresh(); return null; });
export const selectPostings = action(z.object({ ids }).strict(), async input => { await selectForTailoring(input.ids); refresh(); return null; });
export const removeSelection = action(z.object({ id: z.string().min(1).max(200) }).strict(), async ({ id }) => { await removeTailoringSelection(id); refresh(); return null; });
export const retryScan = action(z.object({ id: z.string().min(1).max(200) }).strict(), async ({ id }) => { await retryDiscoveryScan(id); refresh(); return null; });
