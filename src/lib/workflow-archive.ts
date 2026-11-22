import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { scanLock } from "@/lib/discovery/store";

// Dependency order. Runtime jobs and authentication tables belong to the install.
export const ARCHIVE_TABLES = [
  "Theme", "ProfileField", "Skill", "Language", "Experience", "Project", "Education",
  "Publication", "Reference", "Application", "ExperienceSkill", "ProjectSkill", "Fact",
  "KnowledgeDetail", "KnowledgeSnapshot", "ResumeAsset", "DiscoveryControl", "DiscoveryPosting",
  "TailoringControl", "TailoringSelection", "TailoringRevision", "TailoringSubmission",
  "BackupPreparation", "StatusEvent", "Document", "DocumentVersion", "ChatMessage", "Note", "Posting", "AgentCandidate",
  "PostingScore", "PostingSearch", "Startup", "StartupBlock", "EmailMessage", "EmailStatusFinding", "Setting",
] as const;
const tableRows = z.array(z.record(z.string(), z.unknown()));
const payloadSchema = z.record(z.string(), tableRows).superRefine((payload, ctx) => {
  if (Object.keys(payload).length !== ARCHIVE_TABLES.length ||
    ARCHIVE_TABLES.some(table => !Object.hasOwn(payload, table))) {
    ctx.addIssue({ code: "custom", message: "The archive has missing or unknown tables." });
  }
});
const archiveSchema = z.object({
  format: z.literal("ai-resume-workflow"), version: z.literal(1),
  createdAt: z.iso.datetime(), payload: payloadSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  templateSource: z.string().min(1),
}).strict();
export type WorkflowArchive = z.infer<typeof archiveSchema>;
const checksum = (payload: unknown) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const safeSetting = (key: unknown) => typeof key === "string" &&
  !/(api|key|token|secret|password|credential|cookie|oauth|connector|googleClient|baseUrl)/i.test(key);

export function validateWorkflowArchive(value: unknown): WorkflowArchive {
  const archive = archiveSchema.parse(value);
  if (checksum({ payload: archive.payload, templateSource: archive.templateSource }) !== archive.sha256) throw new Error("Archive checksum does not match.");
  if (archive.payload.Setting.some(row => !safeSetting(row.key))) throw new Error("Archive contains authentication settings.");
  return archive;
}

export async function exportWorkflowArchive(db: PrismaClient = prisma): Promise<WorkflowArchive> {
  const templateSource = await installedTemplate();
  return db.$transaction(async tx => {
    const payload: WorkflowArchive["payload"] = {};
    for (const table of ARCHIVE_TABLES) {
      const rows = await tx.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(`SELECT row_to_json(t) AS row FROM "${table}" t`);
      payload[table] = rows.map(entry => entry.row);
    }
    payload.Setting = payload.Setting.filter(row => safeSetting(row.key));
    return { format: "ai-resume-workflow", version: 1, createdAt: new Date().toISOString(), payload, templateSource, sha256: checksum({ payload, templateSource }) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000 });
}

async function installedTemplate() {
  return readFile(path.join(process.cwd(), "templates/v5/master.ts"), "utf8")
    .catch(() => readFile(path.join(process.cwd(), "src/lib/templates/v5.ts"), "utf8"));
}

export function archiveSummary(archive: WorkflowArchive) {
  return { applications: archive.payload.Application.length, roles: archive.payload.Experience.length,
    skills: archive.payload.Skill.length, themes: archive.payload.Theme.length, notes: archive.payload.Note.length };
}

export async function restoreWorkflowArchive(value: unknown, db: PrismaClient = prisma) {
  const archive = validateWorkflowArchive(value);
  if (archive.templateSource.replace(/\r\n/g, "\n") !== (await installedTemplate()).replace(/\r\n/g, "\n")) {
    throw new Error("This archive uses different template masters. Restore with its compatible application version.");
  }
  return db.$transaction(async tx => {
    await scanLock(tx);
    const [jobs, runs, scans, executions] = await Promise.all([
      tx.job.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
      tx.tailoringSelection.count({ where: { status: "RUNNING" } }),
      tx.discoveryScan.count({ where: { status: "RUNNING" } }),
      tx.executionRun.count({ where: { status: "RUNNING" } }),
    ]);
    if (jobs + runs + scans + executions) throw new Error("Pause or cancel active work before restoring.");
    // Reject unknown columns before modifying data. PostgreSQL validates field types and references atomically.
    for (const table of ARCHIVE_TABLES) {
      const columns = await tx.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${table}`;
      const allowed = new Set(columns.map(column => column.column_name));
      if (archive.payload[table].some(row => Object.keys(row).some(key => !allowed.has(key)))) throw new Error("Archive contains an unknown field in " + table);
    }
    await tx.job.deleteMany();
    await tx.executionRun.deleteMany();
    await tx.discoveryScan.deleteMany();
    await tx.claudePaste.deleteMany();
    await tx.googleAccount.deleteMany();
    for (const table of [...ARCHIVE_TABLES].reverse()) await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
    for (const table of ARCHIVE_TABLES) {
      if (!archive.payload[table].length) continue;
      await tx.$executeRawUnsafe(
        `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`,
        JSON.stringify(archive.payload[table]),
      );
    }
    await tx.tailoringSelection.updateMany({ where: { status: "RUNNING" }, data: { status: "QUEUED", owner: null, leaseUntil: null } });
    await tx.tailoringControl.upsert({ where: { id: "queue" }, create: { paused: true }, update: { paused: true } });
    await tx.discoveryControl.updateMany({ data: { sessionUntil: null, nextTickAt: null } });
    await tx.setting.deleteMany({ where: { key: { in: ["nightlyBackup", "gmailRead", "calendarEnabled"] } } });
    // Restored schedules require an explicit restart after reconnection.
    const control = await tx.discoveryControl.findUnique({ where: { id: "discovery" } });
    if (control && typeof control.config === "object" && control.config !== null && !Array.isArray(control.config)) {
      await tx.discoveryControl.update({ where: { id: "discovery" }, data: { config: { ...control.config, enabled: false } } });
    }
    await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"TailoringSelection"','position'), COALESCE((SELECT MAX(position) FROM "TailoringSelection"), 0) + 1, false)`);
    const count = await tx.backupPreparation.count();
    await tx.setting.upsert({ where: { key: "backup.completedCount" }, create: { key: "backup.completedCount", value: String(count) }, update: { value: String(count) } });
    await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"BackupPreparation"','id'), COALESCE((SELECT MAX(id) FROM "BackupPreparation"), 0) + 1, false)`);
    return archiveSummary(archive);
  }, { timeout: 120_000 });
}
