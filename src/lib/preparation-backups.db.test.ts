import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import type { createTestClient } from "@/test/db";
import { resetDatabase } from "@/test/db";
import { loadPreparationBackupSettings, runPreparationBackup, savePreparationBackupSettings } from "./preparation-backups";
import { listBackups, writeBackup } from "./backups";

const state = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined, directory: "" }));
vi.mock("@/lib/prisma", async () => {
  state.client = (await import("@/test/db")).createTestClient();
  return { prisma: state.client };
});
vi.mock("@/lib/env", () => ({ env: { get DOSSIER_DATA_DIR() { return state.directory; }, DOSSIER_SECRET: "s".repeat(32) } }));
const db = () => state.client!;
beforeEach(async () => {
  await resetDatabase(db());
  state.directory = await mkdtemp(path.join(tmpdir(), "workflow-backup-test-"));
});
afterEach(() => rm(state.directory, { recursive: true, force: true }));
afterAll(() => db().$disconnect());
async function ready(externalId: string) {
  const posting = await db().discoveryPosting.create({ data: { identityKey: externalId, occurrenceKey: externalId, externalId, source: "TEXT", jd: "Fictional role", postingEvidence: {} } });
  const run = await db().tailoringSelection.create({ data: { postingId: posting.id } });
  await db().tailoringSelection.update({ where: { id: run.id }, data: { status: "PENDING" } });
  return run;
}

it("defaults to ten preparations, counts retries once and claims automatic backup once", async () => {
  expect(await loadPreparationBackupSettings()).toEqual({ every: 10, retain: 10 });
  await savePreparationBackupSettings(2, 2);
  const first = await ready("first");
  expect(await runPreparationBackup()).toBe(false);
  await db().tailoringSelection.update({ where: { id: first.id }, data: { status: "RUNNING" } });
  await db().tailoringSelection.update({ where: { id: first.id }, data: { status: "PENDING" } });
  expect(await db().backupPreparation.count()).toBe(1);
  await ready("second");
  const results = await Promise.all([runPreparationBackup(), runPreparationBackup()]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await listBackups()).toHaveLength(1);
  expect(await runPreparationBackup()).toBe(false);
  expect((await db().setting.findUniqueOrThrow({ where: { key: "backup.completedCount" } })).value).toBe("2");
});

it("retains manual backups while pruning only excess automatic backups", async () => {
  await savePreparationBackupSettings(1, 1);
  const firstManual = await writeBackup("manual");
  const secondManual = await writeBackup("manual");
  expect(firstManual).not.toBe(secondManual);
  await ready("first");
  await runPreparationBackup();
  await ready("second");
  await runPreparationBackup();
  const files = (await listBackups()).map(file => file.name);
  expect(files).toContain(firstManual);
  expect(files).toContain(secondManual);
  expect(files.filter(name => name.includes("-preparations-"))).toHaveLength(1);
  expect((await readdir(path.join(state.directory, "backups"))).some(name => name.endsWith(".tmp"))).toBe(false);
  await savePreparationBackupSettings(0, 1);
  await ready("disabled");
  expect(await runPreparationBackup()).toBe(false);
});

it("does not advance the preparation baseline when writing fails, then retries successfully", async () => {
  await savePreparationBackupSettings(1, 1);
  await ready("first");
  await writeFile(path.join(state.directory, "backups"), "not a directory");
  await expect(runPreparationBackup()).rejects.toThrow();
  expect(await db().setting.findUnique({ where: { key: "backup.completedCount" } })).toBeNull();
  await rm(path.join(state.directory, "backups"));
  expect(await runPreparationBackup()).toBe(true);
  expect((await db().setting.findUniqueOrThrow({ where: { key: "backup.completedCount" } })).value).toBe("1");
});
