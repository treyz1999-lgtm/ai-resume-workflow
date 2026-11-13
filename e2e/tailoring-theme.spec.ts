import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fictionalResume } from "../src/lib/templates/v5";
import { BUILT_IN_THEMES } from "../src/lib/themes";

test("prints the frozen selected theme, fields and project links", async ({ page }) => {
  const theme = BUILT_IN_THEMES[0];
  const resume = { ...fictionalResume, projects: fictionalResume.projects.slice(0, 4).map(p => ({ ...p, bullets: p.bullets.slice(0, 1) })) };
  const snapshot = { version: 1, track: "swe", resume, theme };
  const dir = await mkdtemp(join(tmpdir(), "tailoring-print-"));
  try {
    await writeFile(join(dir, "snapshot.json"), JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
    await page.goto("/print/tailoring/" + dir.slice(-6));
    await expect(page.getByRole("article", { name: "Resume" })).toContainText("Morgan Example");
    await expect(page.getByText("Example Research")).toHaveCount(0);
    for (const project of resume.projects) await expect(page.getByRole("link", { name: project.url })).toHaveAttribute("href", project.url);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.M4_REVIEW_ARTIFACTS === "1") {
      await mkdir("runtime/m4", { recursive: true });
      await writeFile("runtime/m4/theme.pdf", pdf);
      await writeFile("runtime/m4/theme.json", JSON.stringify(snapshot));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

