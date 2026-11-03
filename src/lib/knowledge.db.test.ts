import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { createTestClient } from "@/test/db";
import { resetDatabase } from "@/test/db";
import { captureKnowledgeSnapshot, loadKnowledgeEditor, loadWorkflowPreferences, saveKnowledgeDetail, saveWorkflowPreferences } from "./knowledge";
import { DEFAULT_DISCOVERY_PREFERENCES, DEFAULT_TAILORING_PREFERENCES } from "./knowledge-contracts";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;
beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());
const detail = { kind: "project" as const, entryId: "aurora", context: "Owned the worker; paired on deployment.", architecture: "flowchart LR\nAPI-->Worker", architectureImage: "", includeSwe: true, includeData: true };

it("captures complete profile data and evidence, preserving old versions after edits", async () => {
  await prisma().profileField.create({ data: { key: "name", value: "Taylor Example" } });
  await prisma().skill.create({ data: { id: "sql", name: "SQL" } });
  await prisma().project.create({ data: { id: "aurora", name: "Aurora", bullets: "Implemented ingestion", skills: { create: { skillId: "sql" } } } });
  await prisma().experience.create({ data: { id: "role", role: "Engineer", company: "Fictional Labs", skills: { create: { skillId: "sql" } } } });
  await prisma().language.create({ data: { name: "English", level: "NATIVE" } });
  await prisma().education.create({ data: { degree: "BSc", school: "Example University" } });
  await prisma().publication.create({ data: { citation: "Example paper" } });
  await prisma().reference.create({ data: { name: "Example Reference" } });
  await prisma().fact.create({ data: { text: "Built the parser independently" } });
  const first = await saveKnowledgeDetail(detail);
  const saved = JSON.stringify(first.payload);
  expect(saved).toContain("Taylor Example");
  for (const evidence of ["SQL", "Aurora", "Engineer", "English", "BSc", "Example paper", "Example Reference", "Built the parser independently", "Owned the worker"]) expect(saved).toContain(evidence);
  expect(saved).not.toContain("updatedAt");
  await prisma().project.update({ where: { id: "aurora" }, data: { bullets: "Revised validated evidence" } });
  const second = await captureKnowledgeSnapshot();
  expect(second.version).toBeGreaterThan(first.version);
  expect(JSON.stringify(second.payload)).toContain("Revised validated evidence");
  expect(JSON.stringify((await prisma().knowledgeSnapshot.findUniqueOrThrow({ where: { id: first.id } })).payload)).toBe(saved);
  expect((await loadKnowledgeEditor()).snapshots.map(row => row.id)).toEqual([second.id, first.id]);
});

it("concurrent identical captures reuse one version and ignore timestamp-only changes", async () => {
  await prisma().project.create({ data: { id: "aurora", name: "Aurora" } });
  const results = await Promise.all([captureKnowledgeSnapshot(), captureKnowledgeSnapshot(), captureKnowledgeSnapshot()]);
  expect(new Set(results.map(row => row.id)).size).toBe(1);
  await prisma().project.update({ where: { id: "aurora" }, data: { name: "Aurora", updatedAt: new Date("2030-01-01") } });
  expect((await captureKnowledgeSnapshot()).id).toBe(results[0].id);
});

it("does not promote application facts or uploaded resumes and omits deleted-entry context", async () => {
  await prisma().project.create({ data: { id: "aurora", name: "Aurora" } });
  await saveKnowledgeDetail(detail);
  await prisma().project.delete({ where: { id: "aurora" } });
  await prisma().resumeAsset.create({ data: { name: "Old resume.pdf", mimeType: "application/pdf", size: 7, sha256: "fixture", data: Buffer.from("private"), preview: Buffer.from("preview") } });
  // A non-null applicationId is the boundary; only global facts belong in the KB.
  const app = await prisma().application.create({ data: { company: "Example", role: "Analyst" } });
  await prisma().fact.create({ data: { applicationId: app.id, text: "Application-specific speculation" } });
  const snapshot = await captureKnowledgeSnapshot();
  const text = JSON.stringify(snapshot.payload);
  expect(text).not.toContain("Owned the worker");
  expect(text).not.toContain("Old resume.pdf");
  expect(text).not.toContain("Application-specific speculation");
  expect((await loadKnowledgeEditor()).details).toEqual([]);
  await expect(saveKnowledgeDetail(detail)).rejects.toThrow("no longer exists");
});

it("persists per-variant inclusion and validates preference themes without changing KB", async () => {
  await prisma().experience.create({ data: { id: "role", role: "Data Analyst" } });
  await saveKnowledgeDetail({ ...detail, kind: "experience", entryId: "role", includeSwe: false });
  expect((await loadKnowledgeEditor()).details[0]).toMatchObject({ includeSwe: false, includeData: true });
  const before = await captureKnowledgeSnapshot();
  const preferences = { discovery: { ...DEFAULT_DISCOVERY_PREFERENCES, roles: ["Analyst"] }, tailoring: { ...DEFAULT_TAILORING_PREFERENCES, track: "data" as const, coverLetter: true } };
  expect(await saveWorkflowPreferences(preferences)).toEqual(preferences);
  expect(await loadWorkflowPreferences()).toEqual(preferences);
  expect((await captureKnowledgeSnapshot()).id).toBe(before.id);
  await expect(saveWorkflowPreferences({ ...preferences, tailoring: { ...preferences.tailoring, themeId: "missing" } })).rejects.toThrow("existing theme");
  await prisma().setting.update({ where: { key: "workflow.discovery" }, data: { value: "invalid json" } });
  expect((await loadWorkflowPreferences()).discovery).toEqual(DEFAULT_DISCOVERY_PREFERENCES);
});
