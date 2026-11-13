import { expect, test } from "@playwright/test";
import { resetData, sql } from "./support";

test.beforeEach(resetData);

test("the paused queue preserves manual order and removal across reloads", async ({ page }) => {
  await page.goto("/tailoring");
  await page.getByRole("button", { name: "Pause queue" }).click();
  await expect(page.getByRole("button", { name: "Resume queue" })).toBeVisible();
  for (const name of ["Alpha", "Beta"]) {
    await sql(`INSERT INTO "DiscoveryPosting"
      (id, "identityKey", "occurrenceKey", source, "externalId", role, company, jd, complete, "postingEvidence")
      VALUES ($1,$1,$1,'TEXT',$1,$1,'Fixture','Fictional description',true,'{}')`, [name]);
    await sql('INSERT INTO "TailoringSelection" (id, "postingId") VALUES ($1,$1)', [name]);
  }
  await page.reload();
  await expect(page.getByText("1. Alpha · Fixture")).toBeVisible();
  await page.getByRole("button", { name: "Move Beta · Fixture up" }).click();
  await expect(page.getByText("1. Beta · Fixture")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Remove Alpha · Fixture" }).click();
  await expect(page.getByRole("heading", { name: "Waiting (1)" })).toBeVisible();
  expect(await sql('SELECT id,status FROM "TailoringSelection"')).toEqual([{ id: "Beta", status: "QUEUED" }]);
});
