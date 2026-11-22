import "server-only";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { backupsDir, listBackups, writeBackup } from "@/lib/backups";
import { saveSettings } from "@/lib/settings-data";

const configSchema = z.object({ every: z.number().int().min(0).max(1000), retain: z.number().int().min(1).max(100) });
export async function loadPreparationBackupSettings() {
  const row = await prisma.setting.findUnique({ where: { key: "backup.preparations" } });
  try { return configSchema.parse(JSON.parse(row?.value ?? "{}")); }
  catch { return { every: 10, retain: 10 }; }
}
export async function savePreparationBackupSettings(every: number, retain: number) {
  const value = JSON.stringify(configSchema.parse({ every, retain }));
  await prisma.setting.upsert({ where: { key: "backup.preparations" }, create: { key: "backup.preparations", value }, update: { value } });
}
export async function runPreparationBackup(): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(7710001) AS acquired`;
    if (!lock.acquired) return false;
    const config = await loadPreparationBackupSettings();
    if (!config.every) return false;
    const count = await tx.backupPreparation.count();
    const previous = await tx.setting.findUnique({ where: { key: "backup.completedCount" } });
    const baseline = Number(previous?.value ?? 0);
    if (count - baseline < config.every) return false;
    await writeBackup("preparations");
    await tx.setting.upsert({ where: { key: "backup.completedCount" }, create: { key: "backup.completedCount", value: String(count) }, update: { value: String(count) } });
    const automatic = (await listBackups()).filter(file => /-(preparations|nightly)-/.test(file.name));
    for (const file of automatic.slice(config.retain)) await unlink(path.join(backupsDir(), file.name));
    await saveSettings({ backupProblem: null }, tx);
    return true;
  }, { timeout: 120_000 });
}
const state = globalThis as unknown as { preparationBackupTimer?: ReturnType<typeof setInterval> };
export function startPreparationBackups() {
  if (state.preparationBackupTimer) return;
  state.preparationBackupTimer = setInterval(() => {
    void runPreparationBackup().catch(() => saveSettings({ backupProblem: "Automatic backup failed. Check the local backups folder and retry." }));
  }, 30_000);
  state.preparationBackupTimer.unref();
}
