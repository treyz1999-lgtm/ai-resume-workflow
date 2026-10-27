import "server-only";

import type { SettingsData } from "@/lib/settings";
import { loadSettings, saveSettings } from "@/lib/settings-data";

// Compatibility contracts for upstream settings/imports. This fork never sends
// telemetry, regardless of imported preferences or DOSSIER_TELEMETRY.
export const USAGE_PING_HOST = "telemetry.dossier.aien.me";
export const USAGE_PING_TEXT_VERSION = 1;
export type UsagePingChoice = { choice: "on" | "off"; source: "env" | "app" } | { choice: null; source: null };
type Preference = Pick<SettingsData, "usagePingChoice" | "usagePingChoiceText">;

export function usagePingChoice(...legacy: [Preference, ("on" | "off")?]): UsagePingChoice {
  void legacy;
  return { choice: "off", source: "app" };
}

export function usagePingEnabled(settings: Preference): boolean {
  void settings;
  return false;
}

export function askForUsagePing(settings: Preference): boolean {
  void settings;
  return false;
}

/** Old actions remain callable, but can only turn telemetry off and clear its ID. */
export async function saveUsagePingChoice(choice: "on" | "off", now = new Date()): Promise<void> {
  void choice;
  await saveSettings({
    usagePingChoice: "off",
    usagePingChoiceAt: now.toISOString(),
    usagePingChoiceText: USAGE_PING_TEXT_VERSION,
    usagePingId: null,
    usagePingDay: null,
  });
}

/** Normalize legacy opt-ins once at startup without rewriting the timestamp every time. */
export async function recordEnvChoice(fromEnv?: "on" | "off", now = new Date()): Promise<void> {
  void fromEnv;
  const settings = await loadSettings();
  if (settings.usagePingChoice !== "off" || settings.usagePingChoiceText !== USAGE_PING_TEXT_VERSION || settings.usagePingId || settings.usagePingDay) {
    await saveUsagePingChoice("off", now);
  }
}

export function usagePingNotice(settings: Preference): string | null {
  void settings;
  return null;
}

type PingOptions = { now?: Date; production?: boolean; fetchImpl?: typeof fetch };
export async function pingIfNewDay(...legacy: [PingOptions?]): Promise<"sent" | "failed" | "skipped"> {
  void legacy;
  return "skipped";
}

export async function sendPing(...legacy: [string, (typeof fetch)?, string?]): Promise<boolean> {
  void legacy;
  return false;
}

export async function notePageLoad(): Promise<void> {
  // Retained for the upstream layout; intentionally no network or database work.
}
