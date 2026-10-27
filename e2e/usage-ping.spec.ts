import { expect, test } from "@playwright/test";
import { answerUsagePing, fakePings, resetData } from "./support";

test.beforeAll(resetData);
test.afterAll(() => answerUsagePing("off"));
test("fork never prompts or pings with a legacy opt-in", async ({ page }) => {
  await answerUsagePing("on");
  const before = (await fakePings()).length;
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Send a daily usage ping?" })).toHaveCount(0);
  await page.goto("/settings?section=about");
  await expect(page.getByText(/Upstream usage telemetry and update checks are disabled/)).toBeVisible();
  await expect(page.getByRole("switch", { name: "Send the daily usage ping" })).toHaveCount(0);
  expect((await fakePings()).length).toBe(before);
});
