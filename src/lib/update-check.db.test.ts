import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";
import { availableUpdate, checkForUpdate, checkIfNewDay, dailyCheckRuns, latestRelease, updateNotice } from "./update-check";
const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/env", () => ({ env: {} }));
beforeEach(async () => { await resetDatabase(db.client!); });
afterAll(() => db.client!.$disconnect());
it("never requests upstream releases through either manual or scheduled checks", async () => {
  await saveSettings({ updateCheck: true });
  const fetchImpl = vi.fn<typeof fetch>();
  expect(dailyCheckRuns()).toBe(false);
  expect(await latestRelease(fetchImpl)).toBeNull();
  expect(await checkForUpdate(fetchImpl)).toEqual({ status: "unknown" });
  expect(await checkIfNewDay({ runs: true, fetchImpl })).toBe("skipped");
  expect(fetchImpl).not.toHaveBeenCalled();
  expect((await loadSettings()).latestVersion).toBeNull();
});
it("hides previously cached upstream releases", async () => {
  await saveSettings({ latestVersion: "99.0.0", latestVersionUrl: "https://github.com/AienTech/dossier/releases/tag/v99.0.0" });
  const settings = await loadSettings();
  expect(availableUpdate(settings)).toBeNull();
  expect(updateNotice(settings)).toBeNull();
});
