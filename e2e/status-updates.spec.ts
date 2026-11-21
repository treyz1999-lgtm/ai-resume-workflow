import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { connectFakeGoogle, fakeGoogle, forgetGoogle, resetData, sql } from "./support";
import { DEFAULT_DISCOVERY_CONFIG } from "../src/lib/discovery/contracts";

test.afterAll(forgetGoogle);
test("checks incoming status mail, asks which reapplication, and never sends mail", async ({ page }) => {
  await resetData();
  await connectFakeGoogle(page);
  await sql(`INSERT INTO "DiscoveryControl" (id,config,"updatedAt") VALUES ('discovery',$1,now())
    ON CONFLICT (id) DO UPDATE SET config=EXCLUDED.config`, [JSON.stringify({ ...DEFAULT_DISCOVERY_CONFIG, provider: "configured" })]);
  for (const [id, days] of [["status-earlier", 20], ["status-later", 10]] as const) {
    await sql(`INSERT INTO "Application" (id,company,role,status,"sentAt","updatedAt")
      VALUES ($1,'Fictional Harbor','Data Analyst','SENT',now()-($2 || ' days')::interval,now()-interval '9 days')`, [id, days]);
  }
  const before = await fakeGoogle();
  const delivered = await fetch("http://localhost:3997/test/mail", {
    method: "POST", body: JSON.stringify({
      id: "status-invitation", threadId: "status-thread", subject: "Fictional Harbor — Data Analyst",
      text: "Fictional Harbor is writing about your Data Analyst application. Please schedule an interview.",
    }),
  });
  expect(delivered.ok).toBe(true);
  await page.goto("/inbox/updates");
  await page.getByRole("button", { name: "Check updates" }).click();
  const finding = page.getByRole("row").filter({ hasText: "Fictional Harbor" });
  await expect(finding).toContainText("Needs review", { timeout: 60_000 });
  expect(await sql("SELECT id FROM \"Application\" WHERE id LIKE 'status-%' AND status <> 'SENT'")).toEqual([]);
  await page.getByLabel("Application for Fictional Harbor").selectOption("status-later");
  await finding.getByRole("button", { name: "Apply update" }).click();
  await expect(finding).toContainText("Updated");
  await page.getByRole("button", { name: "Check updates" }).click();
  await expect(page.getByRole("button", { name: "Check updates", exact: true })).toBeEnabled({ timeout: 60_000 });
  await expect(finding).toContainText("Updated");
  expect(await sql('SELECT id FROM "EmailStatusFinding" WHERE "messageId"=$1', ["status-invitation"])).toHaveLength(1);
  expect(await sql('SELECT status FROM "Application" WHERE id=$1', ["status-later"])).toEqual([{ status: "INTERVIEW" }]);
  expect((await fakeGoogle()).sent).toEqual(before.sent);
  expect((await fakeGoogle()).events).toEqual(before.events);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(issue => ["serious", "critical"].includes(issue.impact ?? "")).map(issue => issue.id)).toEqual([]);
  await page.screenshot({ path: "runtime/m6/status-report.png", fullPage: true });
});
