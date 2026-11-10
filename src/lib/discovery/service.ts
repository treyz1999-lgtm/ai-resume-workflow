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

const idsSchema = z.array(z.string().min(1).max(200)).min(1).max(100);

export async function loadDiscovery(now = new Date()): Promise<DiscoveryView> {
  const [control, scans, postings, selections] = await Promise.all([
    prisma.discoveryControl.findUnique({ where: { id: "discovery" } }),
    prisma.discoveryScan.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: {
      id: true, status: true, stage: true, sourceResults: true, error: true, createdAt: true, finishedAt: true,
    } }),
    prisma.discoveryPosting.findMany({ orderBy: { lastSeenAt: "desc" }, include: { selection: { select: { id: true } } } }),
    prisma.tailoringSelection.findMany({ orderBy: { createdAt: "asc" }, include: { posting: { select: { company: true, role: true } } } }),
  ]);
  const config = configFrom(control?.config);
  const sessionUntil = control?.sessionUntil && control.sessionUntil > now ? control.sessionUntil : null;
  const nextTick = control?.nextTickAt;
  const nextTickAt = nextTick && nextTick > now && discoveryAllowed(config, sessionUntil, now)
    && discoveryAllowed(config, sessionUntil, nextTick) ? nextTick.toISOString() : null;
  return {
    config, configured: Boolean(control), sessionUntil: sessionUntil?.toISOString() ?? null, nextTickAt,
    scans: scans.map(row => ({ id: row.id, status: row.status, stage: row.stage, sourceResults: (row.sourceResults ?? []) as SourceResult[], error: row.error, createdAt: row.createdAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null })),
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
    await tx.discoveryControl.upsert({ where: { id: "discovery" }, create: { id: "discovery", config: json(config), nextTickAt: new Date() }, update: { config: json(config), nextTickAt: new Date() } });
  });
}

export async function startDiscoverySession(hours: 1 | 2 | 3): Promise<void> {
  z.union([z.literal(1), z.literal(2), z.literal(3)]).parse(hours);
  const now = new Date();
  await prisma.$transaction(async tx => {
    await scanLock(tx); await ensureControl(tx);
    await tx.discoveryControl.update({ where: { id: "discovery" }, data: { sessionUntil: new Date(now.getTime() + hours * 3_600_000), nextTickAt: now } });
  });
}
export async function stopDiscoverySession(): Promise<void> {
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    await tx.discoveryControl.updateMany({ where: { id: "discovery" }, data: { sessionUntil: null } });
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
    if (state === "DISMISSED") await tx.tailoringSelection.deleteMany({ where: { postingId: { in: selected } } });
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
  await prisma.tailoringSelection.deleteMany({ where: { id: z.string().min(1).max(200).parse(id) } });
}
