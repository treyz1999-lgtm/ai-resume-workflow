import "server-only";

import type { SettingsData } from "@/lib/settings";
import type { Release } from "@/lib/releases";

// Preserve the settings/action contracts without contacting upstream releases
// or showing cached upstream notices. Fork updates are installed manually.
export type UpdateCheck =
  | { status: "latest"; version: string }
  | { status: "newer"; version: string; url: string }
  | { status: "unknown" };

export async function latestRelease(...legacy: [(typeof fetch)?, string?]): Promise<Release | null> {
  void legacy;
  return null;
}

export async function checkForUpdate(...legacy: [(typeof fetch)?, string?]): Promise<UpdateCheck> {
  void legacy;
  return { status: "unknown" };
}

export function availableUpdate(...legacy: [Pick<SettingsData, "latestVersion" | "latestVersionUrl">, string?]): Release | null {
  void legacy;
  return null;
}

export function updateNotice(...legacy: [Pick<SettingsData, "latestVersion" | "latestVersionUrl" | "updateDismissed">, string?]): Release | null {
  void legacy;
  return null;
}

export function dailyCheckRuns(): boolean {
  return false;
}

type DailyOptions = { now?: Date; runs?: boolean; fetchImpl?: typeof fetch };
export async function checkIfNewDay(...legacy: [DailyOptions?]): Promise<"checked" | "skipped"> {
  void legacy;
  return "skipped";
}

export async function checkForUpdatesDaily(): Promise<void> {
  // Retained for the upstream layout; intentionally no network or database work.
}
