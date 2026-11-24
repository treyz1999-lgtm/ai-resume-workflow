import "server-only";
import { z } from "zod";
import { ActionError } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import {
  discoveryConfigSchema, intakeSchema, postingEvidenceSchema, postingStateSchema,
  type CoverageReport, type DiscoveryAnalysis, type DiscoveryConfig, type DiscoveryView, type IntakeInput, type PostingState, type SourceResult,
} from "./contracts";
import { configFrom, enqueueScan, ensureControl, json, retryScan, scanLock } from "./store";
import { discoveryAllowed } from "./timing";
import { removeWaiting } from "../tailoring/queue";

const idsSchema = z.array(z.string().min(1).max(200)).min(1).max(100);

export async function loadDiscovery(now = new Date()): Promise<DiscoveryView> {
  const [control, scans, postings, selections] = await Promise.all([
    prisma.discoveryControl.findUnique({ where: { id: "discovery" } }),
    prisma.discoveryScan.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: {
      id: true, input: true, status: true, stage: true, sourceResults: true, error: true, createdAt: true, finishedAt: true,
    } }),
    prisma.discoveryPosting.findMany({ orderBy: { lastSeenAt: "desc" }, include: { selection: { select: { id: true } } } }),
    prisma.tailoringSelection.findMany({ where: { status: "QUEUED" }, orderBy: { position: "asc" }, select: { id: true, postingId: true, createdAt: true, posting: { select: { company: true, role: true } } } }),
  ]);
  const config = configFrom(control?.config);
  const sessionUntil = control?.sessionUntil && control.sessionUntil > now ? control.sessionUntil : null;
  const nextTick = control?.nextTickAt;
  const nextTickAt = !config.paused && nextTick && nextTick > now && discoveryAllowed(config, sessionUntil, now)
    && discoveryAllowed(config, sessionUntil, nextTick) ? nextTick.toISOString() : null;
  return {
    config, configured: Boolean(control), sessionUntil: sessionUntil?.toISOString() ?? null, nextTickAt,
    scans: scans.map(row => ({ id: row.id, manualInput: Boolean(row.input), status: row.status, stage: row.stage, sourceResults: (row.sourceResults ?? []) as SourceResult[], error: row.error, createdAt: row.createdAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null })),
    postings: postings.map(row => ({ id: row.id, source: row.source, url: row.url, company: row.company, role: row.role, jd: row.jd, complete: row.complete,
      postingEvidence: postingEvidenceSchema.parse(row.postingEvidence), postedAt: row.postedAt?.toISOString() ?? null, firstSeenAt: row.firstSeenAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(), sightings: row.sightings,
      extracted: row.extracted as DiscoveryAnalysis["extracted"] | null, coverage: row.coverage as CoverageReport | null, kbSnapshotId: row.kbSnapshotId, state: postingStateSchema.parse(row.state), analysisError: row.analysisError, selected: Boolean(row.selection) })),
    selections: selections.map(row => ({ id: row.id, postingId: row.postingId, company: row.posting.company, role: row.posting.role, createdAt: row.createdAt.toISOString() })),
  };
}

export async function saveDiscoveryConfig(input: DiscoveryConfig): Promise<void> {
  const config = discoveryConfigSchema.parse(input);
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    const existing = await tx.discoveryControl.findUnique({ where: { id: "discovery" } });
    // A stale settings form cannot undo a concurrent pause or resume.
    config.paused = configFrom(existing?.config).paused;
    await tx.discoveryControl.upsert({ where: { id: "discovery" }, create: { id: "discovery", config: json(config), nextTickAt: new Date() }, update: { config: json(config), nextTickAt: new Date() } });
  });
}

export async function startDiscoverySession(hours: 1 | 2 | 3): Promise<void> {
  z.union([z.literal(1), z.literal(2), z.literal(3)]).parse(hours);
  const now = new Date();
  await prisma.$transaction(async tx => {
    await scanLock(tx); const control = await ensureControl(tx);
    await tx.discoveryControl.update({ where: { id: "discovery" }, data: { config: json({ ...configFrom(control.config), paused: false }), sessionUntil: new Date(now.getTime() + hours * 3_600_000), nextTickAt: now } });
  });
}
export async function stopDiscoverySession(): Promise<void> {
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    await tx.discoveryControl.updateMany({ where: { id: "discovery" }, data: { sessionUntil: null } });
  });
}

/** Pause preserves pending work and the schedule; any active scan may finish. */
export async function pauseDiscovery(): Promise<void> {
  await setDiscoveryPaused(true);
}
export async function resumeDiscovery(): Promise<void> {
  await setDiscoveryPaused(false);
}
async function setDiscoveryPaused(paused: boolean): Promise<void> {
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    const control = await ensureControl(tx);
    await tx.discoveryControl.update({ where: { id: control.id }, data: {
      config: json({ ...configFrom(control.config), paused }), nextTickAt: paused ? null : new Date(),
    } });
  });
}

/** Revoking ownership fences writes immediately; the worker aborts its request on its next heartbeat. */
export async function cancelDiscoveryScan(id: string): Promise<void> {
  const scanId = z.string().min(1).max(200).parse(id);
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    const result = await tx.discoveryScan.updateMany({ where: { id: scanId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", stage: "Cancelled by user", owner: null, leaseUntil: null, finishedAt: new Date(), error: null } });
    if (!result.count) throw new ActionError("This scan is no longer queued or running.");
  });
}

/** Stop everything now while retaining findings, checkpoints, and schedule configuration. */
export async function stopDiscovery(): Promise<void> {
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    const control = await ensureControl(tx);
    await tx.discoveryControl.update({ where: { id: control.id }, data: {
      config: json({ ...configFrom(control.config), paused: true }), sessionUntil: null, nextTickAt: null,
    } });
    await tx.discoveryScan.updateMany({ where: { status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", stage: "Stopped by user", owner: null, leaseUntil: null, finishedAt: new Date(), error: null } });
  });
}
export const requestDiscoveryScan = (): Promise<void> => enqueueScan();
export const intakePosting = (input: IntakeInput): Promise<void> => enqueueScan(intakeSchema.parse(input));
export const retryDiscoveryScan = (id: string): Promise<void> => retryScan(z.string().min(1).max(200).parse(id));

export async function setDiscoveryState(ids: string[], input: PostingState): Promise<void> {
  const selected = idsSchema.parse(ids), state = postingStateSchema.parse(input);
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    await tx.discoveryPosting.updateMany({ where: { id: { in: selected } }, data: { state } });
    if (state === "DISMISSED") await removeWaiting(tx, { postingId: { in: selected } });
  });
}
export async function selectForTailoring(ids: string[]): Promise<void> {
  const selected = [...new Set(idsSchema.parse(ids))];
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    const rows = await tx.discoveryPosting.findMany({ where: { id: { in: selected } } });
    if (rows.length !== selected.length || rows.some(row => !row.complete || !row.coverage || row.analysisError || row.state === "DISMISSED")) {
      throw new ActionError("Select postings with a complete description and successful coverage analysis. Restore dismissed postings first.");
    }
    for (const postingId of selected) await tx.tailoringSelection.upsert({ where: { postingId }, create: { postingId }, update: {} });
  });
}
export async function removeTailoringSelection(id: string): Promise<void> {
  const selectionId = z.string().min(1).max(200).parse(id);
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    await removeWaiting(tx, { id: selectionId });
  });
}
