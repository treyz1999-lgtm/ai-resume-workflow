import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import { DEFAULT_DISCOVERY_CONFIG, discoveryConfigSchema, postingEvidenceSchema, type DiscoveryConfig, type DiscoveryInput, type IntakeInput } from "./contracts";
import { discoveryAllowed, followingTick } from "./timing";
import { occurrenceKey, postingIdentity, sameOccurrence } from "./identity";

export type Db = Prisma.TransactionClient;
export const LEASE_MS = 90_000;
const ACTIVE = ["QUEUED", "RUNNING"];
export const json = (value: unknown) => value as Prisma.InputJsonValue;
export const scanLock = async (tx: Db) => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(3112026)`; };
export function configFrom(value: unknown): DiscoveryConfig {
  const parsed = discoveryConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : structuredClone(DEFAULT_DISCOVERY_CONFIG);
}
export async function ensureControl(tx: Db) {
  return tx.discoveryControl.upsert({ where: { id: "discovery" }, create: { id: "discovery", config: json(DEFAULT_DISCOVERY_CONFIG) }, update: {} });
}
export async function recoverExpired(tx: Db, now: Date) {
  await tx.discoveryScan.updateMany({ where: { status: "RUNNING", OR: [{ leaseUntil: { lte: now } }, { leaseUntil: null }] },
    data: { status: "INTERRUPTED", owner: null, leaseUntil: null, finishedAt: now, error: "Discovery was interrupted. Retry to continue the saved scan." } });
}

/** The database serializes intake and scheduling; the partial unique index is a second guard. */
export async function enqueueScan(input?: IntakeInput, now = new Date()): Promise<void> {
  await prisma.$transaction(async tx => {
    await scanLock(tx); await recoverExpired(tx, now);
    const active = await tx.discoveryScan.findFirst({ where: { status: { in: ACTIVE } } });
    if (active) {
      if (input) throw new ActionError("Discovery is busy. Your text has not been submitted; wait for this scan to finish and try again.");
      return;
    }
    await tx.discoveryScan.create({ data: { manual: true, ...(input ? { input: json(input) } : {}) } });
  });
}

export async function retryScan(id: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async tx => {
    await scanLock(tx); await recoverExpired(tx, now);
    if (await tx.discoveryScan.findFirst({ where: { status: { in: ACTIVE } } })) throw new ActionError("A discovery scan is already waiting or running.");
    const row = await tx.discoveryScan.findUnique({ where: { id } });
    if (!row || !["FAILED", "INTERRUPTED"].includes(row.status)) throw new ActionError("Only failed or interrupted scans can be retried.");
    await tx.discoveryScan.update({ where: { id }, data: { status: "QUEUED", manual: true, owner: null, leaseUntil: null, error: null, finishedAt: null } });
  });
}

/** Enqueue at most one due scan and claim exactly one. Missed intervals are never replayed. */
export async function claimScan(now = new Date()) {
  return prisma.$transaction(async tx => {
    await scanLock(tx); await recoverExpired(tx, now);
    const control = await tx.discoveryControl.findUnique({ where: { id: "discovery" } });
    const config = configFrom(control?.config);
    const allowed = discoveryAllowed(config, control?.sessionUntil ?? null, now);
    if (control && allowed && (!control.nextTickAt || control.nextTickAt <= now)) {
      await tx.discoveryControl.update({ where: { id: control.id }, data: { nextTickAt: followingTick(config, now) } });
      if (!await tx.discoveryScan.findFirst({ where: { status: { in: ACTIVE } } })) await tx.discoveryScan.create({ data: { manual: false } });
    }
    if (await tx.discoveryScan.findFirst({ where: { status: "RUNNING" } })) return null;
    const queued = await tx.discoveryScan.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
    if (!queued) return null;
    if (!queued.manual && !allowed) {
      await tx.discoveryScan.update({ where: { id: queued.id }, data: { status: "INTERRUPTED", finishedAt: now, error: "The session or scheduled window ended before this scan started." } });
      return null;
    }
    return tx.discoveryScan.update({ where: { id: queued.id }, data: { status: "RUNNING", owner: randomUUID(), leaseUntil: new Date(now.getTime() + LEASE_MS), stage: "Preparing discovery" } });
  });
}

export async function renewLease(id: string, owner: string, now = new Date()): Promise<boolean> {
  const result = await prisma.discoveryScan.updateMany({ where: { id, owner, status: "RUNNING", leaseUntil: { gt: now } }, data: { leaseUntil: new Date(now.getTime() + LEASE_MS) } });
  return result.count === 1;
}

/** Every write by a scanner is fenced; an expired worker cannot publish stale results. */
export async function owned<T>(id: string, owner: string, work: (tx: Db) => Promise<T>, now = new Date()): Promise<T> {
  return prisma.$transaction(async tx => {
    await scanLock(tx);
    const active = await tx.discoveryScan.findFirst({ where: { id, owner, status: "RUNNING", leaseUntil: { gt: now } } });
    if (!active) throw new Error("Discovery lease lost.");
    return work(tx);
  }, { timeout: 20_000 });
}

export async function rememberPosting(tx: Db, posting: DiscoveryInput, now: Date) {
  const identityKey = postingIdentity(posting);
  const candidates = await tx.discoveryPosting.findMany({ where: { OR: [{ identityKey }, ...(posting.externalId ? [{ source: posting.source, externalId: posting.externalId }] : [])] }, orderBy: { firstSeenAt: "desc" } });
  const known = candidates.find(row => {
    const original = postingEvidenceSchema.parse(row.postingEvidence);
    // A later absolute date can identify an originally undated posting. Keep
    // the first raw label while using the confirmed date for future comparisons.
    const resolved = row.postedAt ? { ...original, kind: "absolute" as const, date: row.postedAt.toISOString() } : original;
    return sameOccurrence(resolved, posting.postingEvidence);
  });
  if (known) {
    // Preserve the original observation in its scan checkpoint. A complete JD can
    // replace a source snippet, but another sighting cannot overwrite a full JD.
    const upgrade = !known.complete && posting.complete;
    const row = await tx.discoveryPosting.update({ where: { id: known.id }, data: {
      lastSeenAt: now, sightings: { increment: 1 },
      ...(!known.postedAt && posting.postingEvidence.kind === "absolute" && posting.postingEvidence.date
        ? { postedAt: new Date(posting.postingEvidence.date) } : {}),
      ...(upgrade ? { jd: posting.jd, complete: true, coverage: Prisma.DbNull, extracted: Prisma.DbNull,
        kbSnapshotId: null, analysisError: null } : {}),
    } });
    return { row, fresh: false };
  }
  return { row: await tx.discoveryPosting.create({ data: {
    identityKey, occurrenceKey: occurrenceKey(identityKey, posting.postingEvidence), source: posting.source, externalId: posting.externalId,
    url: posting.url, company: posting.company, role: posting.role, jd: posting.jd, complete: posting.complete,
    postingEvidence: json(posting.postingEvidence), postedAt: posting.postingEvidence.date ? new Date(posting.postingEvidence.date) : null,
    firstSeenAt: now, lastSeenAt: now,
  } }), fresh: true };
}
