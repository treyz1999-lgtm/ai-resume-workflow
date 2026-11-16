import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action";
import { scanLock } from "@/lib/discovery/store";
import { prisma } from "@/lib/prisma";
import type { ReviewResult, SelectionPlan, TailoredContent } from "./contracts";
import { asJson } from "./queue";
import { editClaim, type RevisionRequest } from "./revision-edit";

type HistoryEntry = { generation: number; content?: TailoredContent; reason?: string; report?: ReviewResult };
function historyEntries(history: unknown): HistoryEntry[] {
  return Array.isArray(history) ? history.filter(entry => entry && typeof entry.generation === "number") : [];
}

export async function queueRevision(id: string, generation: number, request: RevisionRequest) {
  await prisma.$transaction(async tx => {
    await scanLock(tx);
    const run = await tx.tailoringSelection.findUnique({ where: { id } });
    if (!run || run.generation !== generation || !["PENDING", "SUBMITTED", "FAILED", "CANCELLED"].includes(run.status) || !run.plan)
      throw new ActionError("This preparation has changed. Refresh the review before starting a revision.");
    const history = historyEntries(run.history);
    const current = run.content as unknown as TailoredContent | null;
    let content: TailoredContent | null = null;
    let reason: string;
    if (request.mode === "restore") {
      const archived = history.find(entry => entry.generation === request.generation);
      if (!archived?.content) throw new ActionError("That version has no saved editable content.");
      content = archived.content;
      reason = "Restored version " + request.generation;
    } else if (request.mode === "manual") {
      if (!current) throw new ActionError("This version has no editable statements.");
      try { content = editClaim(current, request.index, request.text); }
      catch (error) { throw new ActionError(error instanceof Error ? error.message : "Invalid statement edit."); }
      reason = "Edited statement " + (request.index + 1);
    } else {
      reason = request.instruction;
    }
    await tx.$executeRaw`UPDATE "TailoringSelection" SET "position" = DEFAULT WHERE "id" = ${id}`;
    await tx.tailoringSelection.update({ where: { id }, data: {
      generation: { increment: 1 }, status: "QUEUED", stage: "Waiting for revision",
      score: null, error: null, matchReport: Prisma.DbNull,
      content: content ? asJson(content) : Prisma.DbNull, cancelRequested: false,
      history: asJson([...history, { generation, content: current, plan: run.plan, frozen: run.frozen, kbSnapshotId: run.kbSnapshotId, report: run.matchReport, reason }]),
    } });
  });
}

export async function loadDocumentReview(id: string) {
  const run = await prisma.tailoringSelection.findUnique({ where: { id }, select: {
    id: true, generation: true, status: true, stage: true, error: true, content: true, plan: true, history: true, kbSnapshotId: true,
    posting: { select: { company: true, role: true } }, submission: { select: { applicationId: true } },
    revisions: { orderBy: [{ generation: "desc" }, { kind: "desc" }], select: {
      id: true, generation: true, kind: true, format: true, verification: true, matchReport: true, evidence: true,
    } },
  } });
  if (!run) return null;
  const snapshot = run.kbSnapshotId && await prisma.knowledgeSnapshot.findUnique({ where: { id: run.kbSnapshotId }, select: { payload: true } });
  const kb = snapshot ? snapshot.payload as unknown as { projects?: {id: string; name: string}[] } : null;
  const projectNames = Object.fromEntries((kb?.projects ?? []).map(p => [p.id, p.name]));
  const plan = run.plan as unknown as SelectionPlan | null;
  const current = run.content as unknown as TailoredContent | null;
  const history = historyEntries(run.history);
  return {
    id, generation: run.generation, status: run.status, stage: run.stage, error: run.error,
    applicationId: run.submission?.applicationId, ...run.posting, projectNames, plan,
    composition: current?.compositionReason, claims: current?.evidence ?? [],
    history: history.map(h => ({ generation: h.generation, reason: h.reason, canRestore: !!h.content })),
    revisions: run.revisions.map(d => ({
      ...d, matchReport: d.matchReport as unknown as ReviewResult | null,
      evidence: d.evidence as unknown as TailoredContent["evidence"],
    })),
  };
}
export type DocumentReview = NonNullable<Awaited<ReturnType<typeof loadDocumentReview>>>;
