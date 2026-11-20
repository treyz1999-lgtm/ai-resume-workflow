import { expect, test } from "@playwright/test";
import { resetData } from "./support";

test("previews reapplications, imports each once and exports both attempts", async ({ page, request }) => {
  await resetData();
  await page.goto("/applications/tracker");
  const file = {
    name: "fictional-tracker.csv", mimeType: "text/csv",
    buffer: Buffer.from("company,job_title,date_applied,application_status\nExample CSV,Analyst,2026-10-01,Applied\nExample CSV,Analyst,2026-11-01,Interview"),
  };
  const choose = page.getByLabel(/Choose CSV/);
  await choose.setInputFiles(file);
  await expect(page.getByText("2 new attempts · 0 existing IDs")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 attempts" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 2 application attempts" })).toBeVisible();
  await page.reload();
  await choose.setInputFiles(file);
  await expect(page.getByText("0 new attempts · 2 existing IDs")).toBeVisible();
  const response = await request.get("/api/tracker-csv");
  expect(response.ok()).toBe(true);
  expect((await response.text()).split(/\r?\n/).filter(row => row.includes("Example CSV"))).toHaveLength(2);
});
