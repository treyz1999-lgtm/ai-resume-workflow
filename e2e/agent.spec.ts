import { expect, test } from "@playwright/test";
import { resetData } from "./support";

test.beforeEach(resetData);

test("the former Agent page opens Discovery with scheduling initially off", async ({ page }) => {
  await page.goto("/agent");
  await expect(page).toHaveURL(/\/discovery$/);
  await expect(page.getByLabel("Enable weekly schedule")).not.toBeChecked();
  await expect(page.getByText("No scans yet.")).toBeVisible();
});
