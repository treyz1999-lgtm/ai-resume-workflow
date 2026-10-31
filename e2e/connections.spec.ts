import { expect, test } from "@playwright/test";

test("connects with a device code and shows a verified structured check", async ({ page }) => {
  let connected = false;
  let created = false;
  await page.route("**/api/execution/**", async route => {
    const path = new URL(route.request().url()).pathname.split("/api/execution/")[1];
    if (path === "connection") return route.fulfill({ json: { connected, authType: connected ? "chatgpt" : null, plan: connected ? "plus" : null,
      models: connected ? [{ id: "fixture-model", name: "Fixture model", isDefault: true }] : [], limits: [] } });
    if (path === "login") return route.fulfill({ json: { loginId: "fixture-login", verificationUrl: "https://auth.openai.com/codex/device", userCode: "DEMO-1234" } });
    const run = { id: "fixture-run", status: "COMPLETED", model: "fixture-model", stage: "COMPLETED", output: '{"status":"ok","message":"Aurora received"}',
      result: { status: "ok", message: "Aurora received" }, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (path === "runs" && route.request().method() === "POST") { created = true; return route.fulfill({ json: run }); }
    if (path === "runs") return route.fulfill({ json: created ? [run] : [] });
    return route.fulfill({ status: 404, json: { error: "Unexpected fixture request" } });
  });
  await page.goto("/settings?section=connections");
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with ChatGPT" }).click();
  await expect(page.getByLabel("Sign-in code")).toHaveText("DEMO-1234");
  connected = true;
  await page.getByRole("button", { name: "Refresh connection" }).click();
  await expect(page.getByText("Connected · plus", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run connection test" }).click();
  await expect(page.getByText("Structured response verified.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Test output")).toContainText("Aurora received");
});
