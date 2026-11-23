import { createHash } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createTestClient, resetDatabase } from "@/test/db";
import { seedBuiltIns } from "../../prisma/seed/built-ins";
import { seedDemo } from "../../prisma/seed/demo";
import { exportWorkflowArchive, restoreWorkflowArchive, validateWorkflowArchive, type WorkflowArchive } from "./workflow-archive";

vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "s".repeat(32) } }));
const db = createTestClient();
beforeEach(async () => {
  await resetDatabase(db);
  await seedBuiltIns(db);
  await seedDemo(db, { now: new Date("2026-11-01T12:00:00Z") });
});
afterAll(() => db.$disconnect());
function checksum(archive: WorkflowArchive) {
  archive.sha256 = createHash("sha256").update(JSON.stringify({ payload: archive.payload, templateSource: archive.templateSource })).digest("hex");
  return archive;
}
async function prepared() {
  const posting = await db.discoveryPosting.create({ data: {
    identityKey: "fictional", occurrenceKey: "fictional:1", source: "TEXT", externalId: "fixture",
    jd: "SQL engineer", postingEvidence: { date: "2026-11-01" },
  } });
  const snapshot = await db.knowledgeSnapshot.create({ data: { version: 7, digest: "fictional", payload: { projects: [{ name: "Example project" }] } } });
  const run = await db.tailoringSelection.create({ data: { postingId: posting.id, kbSnapshotId: snapshot.id, frozen: { jd: "SQL engineer" } } });
  const revision = await db.tailoringRevision.create({ data: {
    runId: run.id, kind: "resume", format: "latex", source: "\\documentclass{article}",
    pdf: new Uint8Array([37, 80, 68, 70, 0, 255]), preview: new Uint8Array([137, 80, 78, 71]), text: "Fictional PDF",
    verification: { passed: true }, evidence: [{ text: "Built SQL reports", quote: "Built SQL reports", sourceId: "project" }],
    matchReport: { verified: true, score: 73 },
  } });
  const application = await db.application.create({ data: { company: "Fictional Labs", role: "Engineer", status: "SENT", trackerCsv: { experience_band: "0-2" } } });
  await db.tailoringSelection.update({ where: { id: run.id }, data: { status: "SUBMITTED" } });
  await db.tailoringSubmission.create({ data: {
    applicationId: application.id, runId: run.id, resumeRevisionId: revision.id, submittedAt: new Date("2026-11-02"),
    score: 73, scoringMethod: "v5-evidence@1",
  } });
  await db.resumeAsset.create({ data: { name: "fictional.pdf", mimeType: "application/pdf", size: 6, sha256: "fixture", data: revision.pdf, preview: revision.preview } });
  await db.knowledgeDetail.create({ data: { kind: "project", entryId: "fictional-project", architecture: "graph TD; A-->B", architectureImage: "data:image/png;base64,aGVsbG8=" } });
  await db.emailStatusFinding.create({ data: { messageId: "fixture-mail", threadId: "fixture-thread", emailDate: new Date("2026-11-03"),
    company: "Fictional Labs", role: "Engineer", summary: "Interview", kind: "INTERVIEW", candidates: [], evidence: { quote: "Interview" }, applicationId: application.id } });
  return { run, revision, application };
}

it("restores binary documents, frozen submissions, KB architecture and tracker links into an empty database", async () => {
  const fixture = await prepared();
  const archive = await exportWorkflowArchive(db);
  await resetDatabase(db);
  await restoreWorkflowArchive(JSON.parse(JSON.stringify(archive)), db);
  expect(await db.tailoringRevision.findUniqueOrThrow({ where: { id: fixture.revision.id } })).toMatchObject({
    pdf: fixture.revision.pdf, preview: fixture.revision.preview, source: fixture.revision.source, evidence: fixture.revision.evidence,
  });
  expect(await db.tailoringSubmission.findUniqueOrThrow({ where: { runId: fixture.run.id } })).toMatchObject({
    applicationId: fixture.application.id, resumeRevisionId: fixture.revision.id, score: 73,
  });
  expect((await db.resumeAsset.findFirstOrThrow()).data).toEqual(fixture.revision.pdf);
  expect((await db.knowledgeDetail.findFirstOrThrow()).architecture).toContain("A-->B");
  expect((await db.emailStatusFinding.findFirstOrThrow()).applicationId).toBe(fixture.application.id);
  expect((await db.tailoringControl.findUniqueOrThrow({ where: { id: "queue" } })).paused).toBe(true);
  expect((await db.knowledgeSnapshot.create({ data: { digest: "next", payload: {} } })).version).toBeGreaterThan(7);
  expect((await db.tailoringSelection.findUniqueOrThrow({ where: { id: fixture.run.id } })).status).toBe("SUBMITTED");
});

it("rejects checksum damage and rolls back the entire restore when a rechecksummed reference is invalid", async () => {
  await prepared();
  const archive = await exportWorkflowArchive(db);
  const count = await db.application.count();
  const broken = structuredClone(archive);
  broken.payload.Application[0].company = "Tampered";
  expect(() => validateWorkflowArchive(broken)).toThrow("checksum");
  broken.payload.TailoringSubmission[0].resumeRevisionId = "missing-revision";
  await expect(restoreWorkflowArchive(checksum(broken), db)).rejects.toThrow();
  expect(await db.application.count()).toBe(count);
  expect((await db.tailoringSubmission.findFirstOrThrow()).resumeRevisionId).not.toBe("missing-revision");
  const unknown = structuredClone(archive);
  unknown.payload.Application[0].inventedColumn = true;
  await expect(restoreWorkflowArchive(checksum(unknown), db)).rejects.toThrow("unknown field");
});

it("rolls back sequence restarts if the restore transaction fails before commit", async () => {
  await prepared();
  const archive = await exportWorkflowArchive(db);
  await db.$executeRaw`ALTER SEQUENCE "KnowledgeSnapshot_version_seq" RESTART WITH 100`;
  await db.knowledgeSnapshot.create({ data: { digest: "newer", payload: {} } });
  const failingDb = new Proxy(db, {
    get(target, key, receiver) {
      if (key === "$transaction") return (callback: (tx: unknown) => Promise<unknown>) => target.$transaction(async tx => {
        await callback(tx);
        throw new Error("Simulated failure before commit");
      }, { timeout: 120_000 });
      return Reflect.get(target, key, receiver);
    },
  });
  await expect(restoreWorkflowArchive(archive, failingDb)).rejects.toThrow("Simulated failure");
  expect((await db.knowledgeSnapshot.create({ data: { digest: "after-rollback", payload: {} } })).version).toBe(101);
  expect(await db.knowledgeSnapshot.count({ where: { digest: "newer" } })).toBe(1);
  await restoreWorkflowArchive(archive, db);
  expect(await db.backupPreparation.count()).toBe(archive.payload.BackupPreparation.length);
  expect(await db.tailoringSubmission.count()).toBe(1);
});

it("excludes connection secrets and runtime prompts while retaining non-secret settings", async () => {
  await db.setting.createMany({ data: [
    { key: "apiKeyEnc", value: "secret-api" }, { key: "googleClientSecretEnc", value: "secret-google" },
    { key: "baseUrl", value: "https://user:password@example.com" }, { key: "model", value: "local-example" },
  ] });
  await db.googleAccount.create({ data: { email: "fictional@example.com", refreshTokenEnc: "secret-oauth" } });
  await db.executionRun.create({ data: { id: "fixture-execution", prompt: "private-runtime-prompt" } });
  const archive = await exportWorkflowArchive(db);
  const serialized = JSON.stringify(archive);
  for (const secret of ["secret-api", "secret-google", "secret-oauth", "private-runtime-prompt", "user:password"]) expect(serialized).not.toContain(secret);
  expect(archive.payload.Setting).toContainEqual(expect.objectContaining({ key: "model", value: "local-example" }));
  const unsafe = structuredClone(archive);
  unsafe.payload.Setting.push({ key: "apiKeyEnc", value: "injected" });
  expect(() => validateWorkflowArchive(checksum(unsafe))).toThrow("authentication");
  await restoreWorkflowArchive(archive, db);
  expect(await db.googleAccount.count()).toBe(0);
  expect(await db.executionRun.count()).toBe(0);
});
