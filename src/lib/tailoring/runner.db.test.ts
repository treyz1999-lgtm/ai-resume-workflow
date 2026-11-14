import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { createTestClient } from "@/test/db";
import { resetDatabase } from "@/test/db";
import { fictionalResume } from "@/lib/templates/v5";
import { cancelRun, claimRun, loadQueue, retryRun } from "./queue";
import { executeTailoring } from "./runner";
import { planProjects, editResume, reviewResume } from "./workflow";
import { renderTailoring } from "./render";
import type { RenderedDocument } from "./contracts";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("./workflow", () => ({ planProjects: vi.fn(), editResume: vi.fn(), reviewResume: vi.fn() }));
vi.mock("./render", () => ({ renderTailoring: vi.fn() }));
const prisma = () => db.client!;
const projectIds = ["aurora", "beacon", "cedar", "delta", "ember", "flint"];
const plan = { reviewed: projectIds.map(id => ({ id, reason: "Reviewed the validated project evidence." })), selected: projectIds.slice(0, 5), rationale: "Best match for the role." };
const content = { track: "swe" as const, resume: fictionalResume, letter: null, evidence: [] };
const doc: RenderedDocument = { kind: "resume", format: "latex", source: "fictional-source", text: "fictional-text",
  pdf: new Uint8Array([1, 2]), preview: new Uint8Array([3, 4]), verification: { pages: 1 } };
const report = { verified: true, problems: [], score: 75, report: { basis: "fixture" } };
const row = (id: string) => prisma().tailoringSelection.findUniqueOrThrow({ where: { id } });
const revisions = (id: string) => prisma().tailoringRevision.findMany({ where: { runId: id }, orderBy: { generation: "asc" } });
async function claim() {
  const selected = await claimRun();
  if (!selected) throw new Error("Expected the fixture role to be claimable");
  return selected;
}
async function retry(id: string) {
  await retryRun(id);
  await executeTailoring(await claim());
  return row(id);
}
beforeEach(async () => {
  vi.resetAllMocks();
  await resetDatabase(prisma());
  await prisma().project.createMany({ data: projectIds.map(id => ({ id, name: "Example " + id })) });
  const posting = await prisma().discoveryPosting.create({ data: { identityKey: "role", occurrenceKey: "role-1", source: "TEXT", externalId: "fixture", jd: "SQL is required.", postingEvidence: {}, complete: true } });
  await prisma().tailoringSelection.create({ data: { postingId: posting.id } });
  vi.mocked(planProjects).mockResolvedValue(plan);
  vi.mocked(editResume).mockResolvedValue(content);
  vi.mocked(renderTailoring).mockResolvedValue([doc]);
  vi.mocked(reviewResume).mockResolvedValue(report);
});
afterAll(() => prisma().$disconnect());

it("reuses the actual stored PDF and source on reviewer transport retry even after the posting changes", async () => {
  const run = await claim();
  vi.mocked(reviewResume).mockRejectedValueOnce(new Error("Reviewer disconnected."));
  await executeTailoring(run);
  const [first] = await revisions(run.id);
  expect(first.matchReport).toBeNull();
  expect((await loadQueue()).rows[0].documents).toEqual([]);
  await prisma().discoveryPosting.update({ where: { id: run.postingId }, data: { jd: "Another job description." } });
  expect(await retry(run.id)).toMatchObject({ status: "PENDING", generation: 1, kbSnapshotId: run.kbSnapshotId, score: 75 });
  const [input, , , documents] = vi.mocked(reviewResume).mock.lastCall!;
  expect(input.jd).toBe("SQL is required.");
  expect(documents[0]).toMatchObject({ source: first.source, text: first.text, pdf: first.pdf });
  expect((await revisions(run.id)).map(d => d.id)).toEqual([first.id]);
  expect(editResume).toHaveBeenCalledTimes(1);
  expect(renderTailoring).toHaveBeenCalledTimes(1);
});

it("keeps rejected revision bytes and supplies the review findings to a new edit on retry", async () => {
  const run = await claim();
  vi.mocked(reviewResume).mockResolvedValueOnce({ verified: false, problems: ["Unsupported ownership claim."], score: null, report: {} });
  await executeTailoring(run);
  expect(await row(run.id)).toMatchObject({ status: "FAILED", stage: "Verification failed", score: null });
  const [rejected] = await revisions(run.id);
  vi.mocked(renderTailoring).mockResolvedValueOnce([{ ...doc, source: "corrected-source" }]);
  expect(await retry(run.id)).toMatchObject({ status: "PENDING", generation: 2, plan, kbSnapshotId: run.kbSnapshotId });
  expect(vi.mocked(editResume).mock.lastCall![0].revisionFeedback).toContain("Unsupported ownership claim");
  expect(planProjects).toHaveBeenCalledTimes(1);
  const [old, current] = await revisions(run.id);
  expect(old).toEqual(rejected);
  expect(current).toMatchObject({ source: "corrected-source", generation: 2 });
  expect((await loadQueue()).rows[0].documents.map(d => d.id)).toEqual([current.id]);
});

it("regenerates content after a page overflow without releasing a partial document", async () => {
  vi.mocked(renderTailoring).mockRejectedValueOnce(new Error("The rendered document must fit one page."));
  const run = await claim();
  await executeTailoring(run);
  expect(await revisions(run.id)).toHaveLength(0);
  expect(await row(run.id)).toMatchObject({ status: "FAILED", stage: "Revise document" });
  expect(await retry(run.id)).toMatchObject({ status: "PENDING", generation: 2 });
  expect(vi.mocked(editResume).mock.lastCall![0].revisionFeedback).toContain("one page");
  expect(reviewResume).toHaveBeenCalledTimes(1);
});

it("recaptures the KB on explicit retry of a project library blocker", async () => {
  vi.mocked(planProjects).mockRejectedValueOnce(new Error("Preparation needs five projects with verified evidence."));
  const run = await claim();
  await executeTailoring(run);
  await prisma().project.update({ where: { id: "ember" }, data: { bullets: "Added validated SQL evidence." } });
  const prepared = await retry(run.id);
  expect(prepared.status).toBe("PENDING");
  expect(prepared.kbSnapshotId).not.toBe(run.kbSnapshotId);
  expect(prepared.history).toEqual([expect.objectContaining({ kbSnapshotId: run.kbSnapshotId, generation: 1 })]);
});

it("stops at planning when a complete portfolio is not reviewed", async () => {
  const run = await claim();
  vi.mocked(planProjects).mockResolvedValueOnce({ ...plan, reviewed: plan.reviewed.slice(0, 5) });
  await executeTailoring(run);
  expect(await row(run.id)).toMatchObject({ status: "FAILED", plan: null });
  expect(editResume).not.toHaveBeenCalled();
  expect(await revisions(run.id)).toEqual([]);
});

it("rejects render results with an unrequested letter before storing any document", async () => {
  const run = await claim();
  vi.mocked(renderTailoring).mockResolvedValueOnce([doc, { ...doc, kind: "letter" }]);
  await executeTailoring(run);
  expect(await row(run.id)).toMatchObject({ status: "FAILED", error: expect.stringContaining("requested documents") });
  expect(await revisions(run.id)).toEqual([]);
  expect(reviewResume).not.toHaveBeenCalled();
});

it("honors cancellation during inference and rejects its late result", async () => {
  const run = await claim();
  vi.mocked(editResume).mockImplementationOnce(async () => { await cancelRun(run.id); return content; });
  await executeTailoring(run);
  expect(await row(run.id)).toMatchObject({ status: "CANCELLED", plan, content: null, owner: null });
  expect(renderTailoring).not.toHaveBeenCalled();
  expect(await revisions(run.id)).toEqual([]);
});

it("enforces ownership if an expired reviewer returns after the replacement claim", async () => {
  const original = await claim();
  vi.mocked(reviewResume).mockImplementationOnce(async () => {
    await prisma().tailoringSelection.update({ where: { id: original.id }, data: { leaseUntil: new Date(0) } });
    const replacement = await claim();
    expect(replacement.owner).not.toBe(original.owner);
    return report;
  });
  await executeTailoring(original);
  expect(await row(original.id)).toMatchObject({ status: "RUNNING", score: null });
  expect((await revisions(original.id))[0].matchReport).toBeNull();
  await executeTailoring(await row(original.id));
  expect(await row(original.id)).toMatchObject({ status: "PENDING", score: 75 });
  expect(renderTailoring).toHaveBeenCalledTimes(1);
});
