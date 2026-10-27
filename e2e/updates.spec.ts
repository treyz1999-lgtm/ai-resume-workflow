import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resetData, sql } from "./support";

test.beforeAll(resetData);
test.afterAll(() => sql(`DELETE FROM "Setting" WHERE key IN ('latestVersion', 'latestVersionUrl', 'updateDismissed')`));
test("cached upstream releases cannot show update prompts", async ({ page }) => {
  for (const [key, value] of [
    ["latestVersion", "99.0.0"],
    ["latestVersionUrl", "https://github.com/AienTech/dossier/releases/tag/v99.0.0"],
  ]) {
    await sql(`INSERT INTO "Setting" (key, value, "updatedAt") VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = $2`, [key, value]);
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Dossier 99.0.0 is out" })).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).include("aside").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.goto("/settings?section=about");
  await expect(page.getByText(/Upstream usage telemetry and update checks are disabled/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check for updates" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Check for updates daily" })).toHaveCount(0);
});
