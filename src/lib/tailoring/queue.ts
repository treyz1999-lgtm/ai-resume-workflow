import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action";
import { captureKnowledgeSnapshot } from "@/lib/knowledge";
import { DEFAULT_TAILORING_PREFERENCES, tailoringPreferencesSchema } from "@/lib/knowledge-contracts";
import { configFrom, scanLock } from "@/lib/discovery/store";
import type { FrozenInput, QueueStatus, QueueView } from "./contracts";

export const LEASE_MS = 90_000;
export const asJson = (value: unknown) => value as Prisma.InputJsonValue;
type Tx = Prisma.TransactionClient;
// Discovery and queue changes share this short lock so selection, removal,
// reordering and claiming cannot interleave. No inference occurs under lock.
const transaction = <T>(fn: (tx: Tx) => Promise<T>) => prisma.$transaction(async tx => {
  await scanLock(tx);
  return fn(tx);
}, { timeout: 25_000 });

export async function loadQueue(): Promise<QueueView> {
  const [control, rows] = await Promise.all([
    prisma.tailoringControl.findUnique({ where: { id: "queue" } }),
    prisma.tailoringSelection.findMany({ orderBy: { position: "asc" }, select: {
      id: true, position: true, status: true, stage: true, error: true, score: true, generation: true,
      posting: { select: { company: true, role: true } }, revisions: { select: { id: true, kind: true, format: true, generation: true } },
    } }),
  ]);
  return { paused: control?.paused ?? false, rows: rows.map(row => ({ id: row.id, ...row.posting, position: row.position,
    status: row.status as QueueStatus, stage: row.stage, error: row.error, score: row.score,
    documents: row.status === "PENDING" ? row.revisions.filter(doc => doc.generation === row.generation) : [] })) };
}
export async function pauseQueue(paused: boolean) {
  await transaction(tx => tx.tailoringControl.upsert({ where: { id: "queue" }, create: { paused }, update: { paused } }));
}
export async function moveRun(id: string, direction: -1 | 1) {
  await transaction(async tx => {
    const row = await tx.tailoringSelection.findFirst({ where: { id, status: "QUEUED" } });
    if (!row) throw new ActionError("Only waiting roles can be reordered.");
    const neighbor = await tx.tailoringSelection.findFirst({ where: { status: "QUEUED", position: direction < 0 ? { lt: row.position } : { gt: row.position } }, orderBy: { position: direction < 0 ? "desc" : "asc" } });
    if (!neighbor) return;
    await tx.tailoringSelection.update({ where: { id }, data: { position: -1 } });
    await tx.tailoringSelection.update({ where: { id: neighbor.id }, data: { position: row.position } });
    await tx.tailoringSelection.update({ where: { id }, data: { position: neighbor.position } });
  });
}
export async function removeRun(id: string) {
  const result = await transaction(tx => tx.tailoringSelection.deleteMany({ where: { id, status: "QUEUED" } }));
  if (!result.count) throw new ActionError("This role is no longer waiting.");
}
export async function cancelRun(id: string) {
  await transaction(async tx => {
    const queued = await tx.tailoringSelection.updateMany({ where: { id, status: "QUEUED" }, data: { status: "CANCELLED", stage: "Cancelled" } });
    if (queued.count) return;
    const active = await tx.tailoringSelection.updateMany({ where: { id, status: "RUNNING" }, data: { cancelRequested: true, stage: "Cancelling" } });
    if (!active.count) throw new ActionError("Only waiting or running preparations can be cancelled.");
  });
}
export async function retryRun(id: string) {
  await transaction(async tx => {
    const row = await tx.tailoringSelection.findFirst({ where: { id, status: { in: ["FAILED", "CANCELLED"] } } });
    if (!row) throw new ActionError("Only failed or cancelled preparations can be retried.");
    const restartPlan = row.stage === "Update project library";
    const rewrite = row.stage === "Verification failed" || row.stage === "Revise document";
    const data: Prisma.TailoringSelectionUpdateInput = { status: "QUEUED", stage: "Waiting to retry", owner: null, leaseUntil: null, error: null, cancelRequested: false };
    if (restartPlan || rewrite) {
      const prior = Array.isArray(row.history) ? row.history : [];
      data.history = asJson([...prior, { generation: row.generation, kbSnapshotId: row.kbSnapshotId, frozen: row.frozen, plan: row.plan, content: row.content, reason: row.error, report: row.matchReport }]);
      data.generation = { increment: 1 };
      data.content = Prisma.DbNull;
      data.matchReport = Prisma.DbNull;
      if (restartPlan) {
        data.kbSnapshotId = null;
        data.frozen = Prisma.DbNull;
        data.plan = Prisma.DbNull;
      }
    }
    await tx.tailoringSelection.update({ where: { id }, data });
  });
}
export async function claimRun(now = new Date()) {
  return transaction(async tx => {
    const stale = { status: "RUNNING", leaseUntil: { lte: now } };
    await tx.tailoringSelection.updateMany({ where: { ...stale, cancelRequested: true }, data: { status: "CANCELLED", stage: "Cancelled", owner: null, leaseUntil: null } });
    await tx.tailoringSelection.updateMany({ where: stale, data: { status: "QUEUED", stage: "Recovering preparation", owner: null, leaseUntil: null } });
    if ((await tx.tailoringControl.findUnique({ where: { id: "queue" } }))?.paused) return null;
    if (await tx.tailoringSelection.count({ where: { status: "RUNNING" } })) return null;
    const row = await tx.tailoringSelection.findFirst({ where: { status: "QUEUED" }, orderBy: { position: "asc" }, include: { posting: true } });
    if (!row) return null;
    const owner = randomUUID();
    const state = { status: "RUNNING", stage: "Preparing", owner, leaseUntil: new Date(now.getTime() + LEASE_MS) };
    if (row.kbSnapshotId && row.frozen) return tx.tailoringSelection.update({ where: { id: row.id }, data: state });
    const snapshot = await captureKnowledgeSnapshot(tx);
    const preference = await tx.setting.findUnique({ where: { key: "workflow.tailoring" } });
    let options = DEFAULT_TAILORING_PREFERENCES;
    if (preference) {
      try { options = tailoringPreferencesSchema.safeParse(JSON.parse(preference.value)).data ?? options; } catch { /* Same default as the Knowledge editor for malformed legacy settings. */ }
    }
    const config = configFrom((await tx.discoveryControl.findUnique({ where: { id: "discovery" } }))?.config);
    const frozen: Omit<FrozenInput,"kb"> = { jd: row.posting.jd, role: row.posting.role, company: row.posting.company, preparedAt: now.toISOString(), provider: config.provider, model: config.model, options };
    return tx.tailoringSelection.update({ where: { id: row.id }, data: { ...state, frozen: asJson(frozen), kbSnapshotId: snapshot.id } });
  });
}
export async function ownedWrite<T>(id: string, owner: string, fn: (tx: Tx) => Promise<T>) {
  return transaction(async tx => {
    const row = await tx.tailoringSelection.findFirst({ where: { id, status: "RUNNING", owner, leaseUntil: { gt: new Date() }, cancelRequested: false }, select: { id: true } });
    if (!row) throw new Error("The preparation was cancelled or its lease expired.");
    return fn(tx);
  });
}
