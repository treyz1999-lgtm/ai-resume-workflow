import { expect, test } from "@playwright/test";
import { resetData, sql } from "./support";

test.beforeEach(async () => { await resetData(); });
test("profile and context changes create complete snapshots without rewriting history", async ({ page }) => {
  await sql(`INSERT INTO "Project" (id,name,link,bullets,"updatedAt") VALUES ('m2-project','M2 Aurora','https://example.com/aurora','Built a fictional dashboard.',now())`);
  await page.goto("/knowledge");
  const first = (await sql<{ id: string; payload: object }>('SELECT id,payload FROM "KnowledgeSnapshot" ORDER BY version DESC LIMIT 1'))[0];
  await page.getByText("M2 Aurora", { exact: true }).click();
  const form = page.getByRole("form", { name: "Knowledge for M2 Aurora" });
  await form.getByLabel("Validated context and evidence").fill("Implemented verified SQL reports for fictional data.");
  await form.getByLabel("Architecture diagram — Mermaid source").fill("graph LR; UI-->Database;");
  await form.getByRole("button", { name: "Save context" }).click();
  await expect(form.getByText("Context saved to your KB.")).toBeVisible();
  await page.reload();
  await page.getByText("M2 Aurora", { exact: true }).click();
  await form.getByLabel("Validated context and evidence").fill("Updated validated evidence.");
  await form.getByRole("button", { name: "Save context" }).click();
  await expect(form.getByText("Context saved to your KB.")).toBeVisible();
  const original = (await sql<{ payload: object }>('SELECT payload FROM "KnowledgeSnapshot" WHERE id=$1', [first.id]))[0];
  expect(original.payload).toEqual(first.payload);
  const latest = (await sql<{ payload: object }>('SELECT payload FROM "KnowledgeSnapshot" ORDER BY version DESC LIMIT 1'))[0];
  expect(JSON.stringify(latest.payload)).toContain("Updated validated evidence.");
  await sql(`UPDATE "Project" SET bullets='Changed profile evidence.' WHERE id='m2-project'`);
  await page.reload();
  expect(JSON.stringify((await sql<{ payload: object }>('SELECT payload FROM "KnowledgeSnapshot" ORDER BY version DESC LIMIT 1'))[0].payload)).toContain("Changed profile evidence.");
  await page.goto(`/knowledge?snapshot=${first.id}`);
  await expect(page.getByText(/Viewing version.*historical/)).toBeVisible();
});
