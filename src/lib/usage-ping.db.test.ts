import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";
import { askForUsagePing, pingIfNewDay, recordEnvChoice, saveUsagePingChoice, sendPing, usagePingChoice, usagePingEnabled, usagePingNotice, USAGE_PING_TEXT_VERSION } from "./usage-ping";
const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/env", () => ({ env: { DOSSIER_TELEMETRY: "on" } }));
beforeEach(async () => { await resetDatabase(db.client!); });
afterAll(() => db.client!.$disconnect());
it("never prompts or transmits despite production overrides and legacy opt-in", async () => {
  await saveSettings({ usagePingChoice: "on", usagePingChoiceText: USAGE_PING_TEXT_VERSION, usagePingId: "old-id" });
  const settings = await loadSettings();
  expect(usagePingChoice(settings, "on").choice).toBe("off");
  expect(usagePingEnabled(settings)).toBe(false);
  expect(askForUsagePing(settings)).toBe(false);
  expect(usagePingNotice(settings)).toBeNull();
  const fetchImpl = vi.fn<typeof fetch>();
  expect(await pingIfNewDay({ production: true, fetchImpl })).toBe("skipped");
  expect(await sendPing("old-id", fetchImpl)).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("legacy preference writes cannot opt in and discard the install identifier", async () => {
  await saveSettings({ usagePingId: "old-id", usagePingDay: "2026-10-20" });
  await saveUsagePingChoice("on");
  expect(await loadSettings()).toMatchObject({ usagePingChoice: "off", usagePingId: null, usagePingDay: null });
  await recordEnvChoice("on");
  expect((await loadSettings()).usagePingChoice).toBe("off");
});
