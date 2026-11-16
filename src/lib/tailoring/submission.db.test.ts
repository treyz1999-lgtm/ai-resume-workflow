import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createTestClient, resetDatabase } from "@/test/db";
import { markTailoringSubmitted } from "./submission";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("@/test/db")).createTestClient() }));
const db = createTestClient();
beforeEach(() => resetDatabase(db));
afterAll(() => db.$disconnect());

async function attempt(occurrenceKey: string) {
  const run = await db.tailoringSelection.create({ data: {
    posting: { create: { identityKey: "same-role", occurrenceKey, source: "TEXT", externalId: "fixture",
      jd: "Updated listing", postingEvidence: {}, extracted: { location: "Phoenix" }, coverage: { score: 99 } } },
    frozen: { jd: "Original job description", company: "Fictional Labs", role: "Analyst" }, status: "PENDING",
  } });
  const base = { runId: run.id, format: "latex", source: "fictional", pdf: new Uint8Array([1]),
    preview: new Uint8Array(), text: "fictional", verification: {}, evidence: [],
    matchReport: { verified: true, problems: [], score: 74, report: { method: "v5-evidence@1" } } };
  const resume = await db.tailoringRevision.create({ data: { ...base, kind: "resume" } });
  const letter = await db.tailoringRevision.create({ data: { ...base, kind: "letter" } });
  return { run, resume, letter, base };
}

it("records concurrent confirmations once and freezes the selected PDF score across later edits", async () => {
  const { run, resume, letter, base } = await attempt("original");
  const submit = () => markTailoringSubmitted(run.id, resume.id, letter.id, "2026-11-01");
  const [id, duplicate] = await Promise.all([submit(), submit()]);
  expect(duplicate).toBe(id);
  await db.tailoringRevision.create({ data: { ...base, generation: 2, kind: "resume", matchReport: {} } });
  const app = await db.application.findUniqueOrThrow({ where: { id }, include: { events: true, submission: true } });
  expect(app).toMatchObject({ status: "SENT", location: "Phoenix", postingText: "Original job description",
    submission: { score: 74, scoringMethod: "v5-evidence@1", resumeRevisionId: resume.id, letterRevisionId: letter.id } });
  expect(app.events).toHaveLength(1);
  await expect(markTailoringSubmitted(run.id, resume.id, null, "2026-11-01")).rejects.toThrow("already");
  await db.application.delete({ where: { id } });
  expect((await db.tailoringSelection.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("PENDING");
  expect(await submit()).not.toBe(id);
});

it("rejects mismatched and unverified documents while keeping reapplications distinct", async () => {
  const first = await attempt("first");
  const later = await attempt("repost");
  const submit = (resume: string, letter: string | null) => markTailoringSubmitted(first.run.id, resume, letter, "2026-11-01");
  await expect(submit(later.resume.id, null)).rejects.toThrow("verified resume");
  await expect(submit(first.resume.id, later.letter.id)).rejects.toThrow("verified letter");
  const bad = await db.tailoringRevision.create({ data: { ...first.base, kind: "resume", generation: 2, matchReport: {} } });
  await expect(submit(bad.id, null)).rejects.toThrow("verified resume");
  await db.tailoringSelection.update({ where: { id: first.run.id }, data: { status: "RUNNING" } });
  await expect(submit(first.resume.id, null)).rejects.toThrow("Finish verification");
  expect(await db.application.count()).toBe(0);
  await db.tailoringSelection.update({ where: { id: first.run.id }, data: { status: "PENDING" } });
  await submit(first.resume.id, null);
  await markTailoringSubmitted(later.run.id, later.resume.id, null, "2026-11-15");
  expect(await db.application.count()).toBe(2);
});
