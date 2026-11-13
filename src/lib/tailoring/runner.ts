import "server-only";
import type { TailoringSelection } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { asJson, claimRun, LEASE_MS, ownedWrite } from "./queue";
import { planProjects, editResume, reviewResume } from "./workflow";
import { renderTailoring } from "./render";
import type { FrozenInput, RenderedDocument, SelectionPlan, TailoredContent } from "./contracts";

export async function executeTailoring(run: TailoringSelection) {
  const owner = run.owner!;
  const signal = new AbortController();
  let checking = false;
  const heartbeat = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const now = new Date();
      const renewed = await prisma.tailoringSelection.updateMany({ where: { id: run.id, status: "RUNNING", owner, cancelRequested: false, leaseUntil: { gt: now } }, data: { leaseUntil: new Date(now.getTime() + LEASE_MS) } });
      if (!renewed.count) signal.abort();
    } catch { signal.abort(); } finally { checking = false; }
  }, 3_000);
  heartbeat.unref?.();
  const save = (data: Parameters<typeof prisma.tailoringSelection.update>[0]["data"]) =>
    ownedWrite(run.id, owner, tx => tx.tailoringSelection.update({ where: { id: run.id }, data }));
  try {
    const snapshot = await prisma.knowledgeSnapshot.findUniqueOrThrow({ where: { id: run.kbSnapshotId! } });
    const input: FrozenInput = { ...(run.frozen as unknown as Omit<FrozenInput, "kb">), kb: snapshot.payload };
    let plan = run.plan as unknown as SelectionPlan | null;
    if (!plan) {
      await save({ stage: "Comparing all projects" });
      plan = await planProjects(input, signal.signal);
      const projects = (input.kb as { projects: { id: string }[] }).projects;
      const portfolio = new Set(projects.map(project => project.id));
      if (plan.reviewed.length !== portfolio.size || new Set(plan.reviewed.map(p => p.id)).size !== portfolio.size || plan.reviewed.some(p => !portfolio.has(p.id))
        || plan.selected.length !== 5 || new Set(plan.selected).size !== 5 || plan.selected.some(id => !portfolio.has(id))) throw new Error("The planner must review the complete portfolio and select five distinct supported projects.");
      await save({ plan: asJson(plan) });
    }
    let theme = run.themeSnapshot as Record<string, unknown> | null;
    if (input.options.themeId && !theme) {
      theme = await prisma.theme.findUnique({ where: { id: input.options.themeId } });
      if (!theme) throw new Error("The selected presentation theme is unavailable.");
      theme = JSON.parse(JSON.stringify(theme)) as Record<string, unknown>;
      await save({ themeSnapshot: asJson(theme) });
    }
    let content = run.content as unknown as TailoredContent | null;
    if (!content) {
      await save({ stage: "Editing from frozen evidence" });
      content = await editResume(input, plan, signal.signal);
      await save({ content: asJson(content) });
    }
    const revisions = await prisma.tailoringRevision.findMany({ where: { runId: run.id } });
    let documents: RenderedDocument[] = revisions.map(doc => ({ ...doc, kind: doc.kind as RenderedDocument["kind"], format: doc.format as RenderedDocument["format"], verification: doc.verification as Record<string, unknown> }));
    if (!documents.length) {
      await save({ stage: "Rendering and inspecting documents" });
      documents = await renderTailoring(content, theme, signal.signal);
      if (documents.length !== (input.options.coverLetter ? 2 : 1) || documents.filter(doc => doc.kind === "resume").length !== 1 ||
        documents.filter(doc => doc.kind === "letter").length !== Number(input.options.coverLetter)) throw new Error("The renderer did not return the requested documents.");
      await ownedWrite(run.id, owner, tx => tx.tailoringRevision.createMany({ data: documents.map(doc => ({
        ...doc, runId: run.id, pdf: new Uint8Array(doc.pdf), preview: new Uint8Array(doc.preview), verification: asJson(doc.verification), evidence: asJson(content!.evidence),
      })) }));
    }
    await save({ stage: "Reviewing PDF evidence and match" });
    const review = await reviewResume(input, plan, content, documents, signal.signal);
    await ownedWrite(run.id, owner, async tx => {
      await tx.tailoringRevision.updateMany({ where: { runId: run.id }, data: { matchReport: asJson(review) } });
      const ready = review.verified && review.problems.length === 0;
      await tx.tailoringSelection.update({ where: { id: run.id }, data: {
        status: ready ? "PENDING" : "FAILED", stage: ready ? "Pending submission" : "Verification failed",
        score: ready ? review.score : null, error: ready ? null : review.problems.join(" ").slice(0, 2000) || "The reviewer could not verify this revision.",
        matchReport: asJson(review), owner: null, leaseUntil: null,
      } });
    });
  } catch (error) {
    const active = { id: run.id, owner, status: "RUNNING", leaseUntil: { gt: new Date() } };
    await prisma.tailoringSelection.updateMany({ where: { ...active, cancelRequested: true }, data: { status: "CANCELLED", stage: "Cancelled", owner: null, leaseUntil: null } });
    await prisma.tailoringSelection.updateMany({ where: { ...active, cancelRequested: false }, data: { status: "FAILED", stage: "Preparation blocked", error: error instanceof Error ? error.message.slice(0, 1000) : "Preparation failed.", owner: null, leaseUntil: null } });
  } finally { clearInterval(heartbeat); signal.abort(); }
}

const timers = globalThis as unknown as { tailoringTimer?: ReturnType<typeof setInterval>; tailoringBusy?: boolean };
export function startTailoringQueue() {
  if (timers.tailoringTimer) return;
  const tick = async () => {
    if (timers.tailoringBusy) return;
    timers.tailoringBusy = true;
    try { const run = await claimRun(); if (run) await executeTailoring(run); }
    catch { console.error("[tailoring] Queue check failed. The next poll will retry."); }
    finally { timers.tailoringBusy = false; }
  };
  timers.tailoringTimer = setInterval(() => void tick(), 5000);
  timers.tailoringTimer.unref?.();
}
