import { expect, test } from "@playwright/test";
import { resetData, sql } from "./support";

test.beforeEach(resetData);

test("a pasted role can be reviewed, saved and explicitly selected for tailoring", async ({ page }) => {
  await sql(`INSERT INTO "Project" (id,name,bullets,"updatedAt") VALUES ('discovery-fixture','Aurora reports','Built SQL reports for fictional data.',now())`);
  const counts = () => sql<{ applications: number; documents: number }>(`SELECT (SELECT count(*)::int FROM "Application") AS applications, (SELECT count(*)::int FROM "Document") AS documents`);
  const before = await counts();
  await page.goto("/discovery");
  await page.getByLabel("Discovery model connection").selectOption("configured");
  await page.getByRole("button", { name: "Save discovery settings" }).click();
  await expect(page.getByText("Discovery settings saved.")).toBeVisible();
  await page.getByLabel("Company (optional)").fill("Aurora Labs");
  await page.getByLabel("Role (optional)").fill("Data Engineer");
  await page.getByLabel("Full job description").fill("Aurora Labs — Data Engineer. Remote, US. SQL is required. Python is preferred. 0–2 years of experience. $90,000–$110,000 USD per year. Requisition AUR-101.");
  await page.getByRole("button", { name: "Analyze posting" }).click();
  await expect(page.getByText("67%", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  await expect(page.getByText("No roles selected yet.")).toBeVisible();
  await page.getByRole("button", { name: "Save role" }).click();
  await page.getByLabel("Show roles").selectOption("SAVED");
  await page.getByRole("button", { name: "Select for tailoring", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove Data Engineer" })).toBeVisible();
  expect(await counts()).toEqual(before);
  await page.getByRole("button", { name: "Remove Data Engineer" }).click();
  await expect(page.getByText("No roles selected yet.")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByLabel("Show roles").selectOption("DISMISSED");
  await expect(page.getByRole("button", { name: "Restore role" })).toBeVisible();
});
