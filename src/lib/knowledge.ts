import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_DISCOVERY_PREFERENCES, DEFAULT_TAILORING_PREFERENCES,
  discoveryPreferencesSchema, knowledgeDetailSchema, tailoringPreferencesSchema, workflowPreferencesSchema,
  type KnowledgeDetailInput, type WorkflowPreferences,
} from "./knowledge-contracts";

type Db = Prisma.TransactionClient;
/** Stable content only: saving an unchanged form must not create a new revision. */
function content(value: unknown): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map(item => content(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "createdAt" && key !== "updatedAt")
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, item === null ? null : content(item)]));
  }
  return value as string | number | boolean;
}

async function lockSources(tx: Db) {
  // READ COMMITTED takes a fresh snapshot after this lock has been acquired.
  // The advisory lock serializes snapshot writers; SHARE locks keep all source
  // tables stable for the short capture, including edits through upstream actions.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2802026)`;
  await tx.$executeRaw`LOCK TABLE "ProfileField", "Skill", "Language", "Experience", "ExperienceSkill", "Project", "ProjectSkill", "Education", "Publication", "Reference", "Fact", "KnowledgeDetail" IN SHARE MODE`;
}

async function capture(tx: Db) {
  const order = { id: "asc" as const };
  const [fields, skills, languages, experience, projects, education, publications, references, facts, details] = await Promise.all([
    tx.profileField.findMany({ orderBy: { key: "asc" } }),
    tx.skill.findMany({ orderBy: order }), tx.language.findMany({ orderBy: order }),
    tx.experience.findMany({ orderBy: order, include: { skills: { orderBy: { skillId: "asc" } } } }),
    tx.project.findMany({ orderBy: order, include: { skills: { orderBy: { skillId: "asc" } } } }),
    tx.education.findMany({ orderBy: order }), tx.publication.findMany({ orderBy: order }),
    tx.reference.findMany({ orderBy: order }), tx.fact.findMany({ where: { applicationId: null }, orderBy: order }),
    tx.knowledgeDetail.findMany({ orderBy: [{ kind: "asc" }, { entryId: "asc" }] }),
  ]);
  const projectIds = new Set(projects.map(entry => entry.id));
  const experienceIds = new Set(experience.map(entry => entry.id));
  const payload = content({ schemaVersion: 1, fields, skills, languages, experience, projects, education, publications, references, facts,
    details: details.filter(detail => detail.kind === "project" ? projectIds.has(detail.entryId) : detail.kind === "experience" && experienceIds.has(detail.entryId)),
  });
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const previous = await tx.knowledgeSnapshot.findFirst({ orderBy: { version: "desc" } });
  if (previous?.digest === digest) return previous;
  return tx.knowledgeSnapshot.create({ data: { schemaVersion: 1, digest, payload } });
}

/** Captures complete validated profile knowledge, never application facts or uploads. */
export async function captureKnowledgeSnapshot(tx?: Db) {
  if (tx) { await lockSources(tx); return capture(tx); }
  return prisma.$transaction(async transaction => { await lockSources(transaction); return capture(transaction); }, { timeout: 20_000 });
}

export async function saveKnowledgeDetail(input: KnowledgeDetailInput) {
  const data = knowledgeDetailSchema.parse(input);
  return prisma.$transaction(async tx => {
    await lockSources(tx);
    const exists = data.kind === "project"
      ? await tx.project.findUnique({ where: { id: data.entryId }, select: { id: true } })
      : await tx.experience.findUnique({ where: { id: data.entryId }, select: { id: true } });
    if (!exists) throw new Error("The profile entry no longer exists. Refresh and select an existing entry.");
    await tx.knowledgeDetail.upsert({ where: { kind_entryId: { kind: data.kind, entryId: data.entryId } }, create: data, update: data });
    return capture(tx);
  }, { timeout: 20_000 });
}

export async function loadKnowledgeEditor() {
  const [projects, experience, details, snapshots] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: [{ sort: "asc" }, { id: "asc" }] }),
    prisma.experience.findMany({ select: { id: true, role: true, company: true }, orderBy: [{ sort: "asc" }, { id: "asc" }] }),
    prisma.knowledgeDetail.findMany({ orderBy: [{ kind: "asc" }, { entryId: "asc" }] }),
    prisma.knowledgeSnapshot.findMany({ select: { id: true, version: true, digest: true, createdAt: true }, orderBy: { version: "desc" } }),
  ]);
  return { projects, experience, details: details.filter(detail => detail.kind === "project"
    ? projects.some(entry => entry.id === detail.entryId) : detail.kind === "experience" && experience.some(entry => entry.id === detail.entryId)), snapshots };
}

function decoded(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

export async function loadWorkflowPreferences(): Promise<WorkflowPreferences> {
  const rows = await prisma.setting.findMany({ where: { key: { in: ["workflow.discovery", "workflow.tailoring"] } } });
  const values = new Map(rows.map(row => [row.key, row.value]));
  const discovery = discoveryPreferencesSchema.safeParse(decoded(values.get("workflow.discovery")));
  const tailoring = tailoringPreferencesSchema.safeParse(decoded(values.get("workflow.tailoring")));
  const result = { discovery: discovery.success ? discovery.data : structuredClone(DEFAULT_DISCOVERY_PREFERENCES),
    tailoring: tailoring.success ? tailoring.data : { ...DEFAULT_TAILORING_PREFERENCES } };
  if (result.tailoring.themeId && !await prisma.theme.findUnique({ where: { id: result.tailoring.themeId }, select: { id: true } })) result.tailoring.themeId = null;
  return result;
}

export async function saveWorkflowPreferences(input: WorkflowPreferences): Promise<WorkflowPreferences> {
  const values = workflowPreferencesSchema.parse(input);
  return prisma.$transaction(async tx => {
    if (values.tailoring.themeId && !await tx.theme.findUnique({ where: { id: values.tailoring.themeId }, select: { id: true } })) {
      throw new Error("Select an existing theme or the default LaTeX presentation.");
    }
    for (const [part, value] of Object.entries(values)) {
      const key = `workflow.${part}`;
      await tx.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
    }
    return values;
  });
}
