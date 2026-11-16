import { expect, test } from "@playwright/test";
import { DEFAULT_DISCOVERY_CONFIG } from "../src/lib/discovery/contracts";
import { resetData, sql } from "./support";

// The AI server supplies repeatable plans, edits and reviews. The application
// claims the run normally, renders with the worker tools and serves real bytes.
const names = ["Aurora", "Beacon", "Cedar", "Delta", "Ember", "Flint"];
const projectIds = names.map((_, i) => "fixture-project-" + i);
const jd = "SQL is required.\nPrepare reproducible reports for the fictional product team.";
const proof = { raw: "", kind: "unknown", date: null, observedAt: "2026-11-01T12:00:00.000Z", earliest: null, latest: null, reposted: false };
const coverage = { method: "v5-evidence@1", score: 50, keywordCoverage: 50, strengths: ["SQL"], gaps: [], requirements: [], keywords: [] };

async function seedPortfolio() {
  // sql() refuses database names outside the dedicated _e2e database.
  await sql('TRUNCATE "ProfileField", "Skill", "Experience", "Project", "Education", "Fact", "KnowledgeDetail" CASCADE');
  for (const [key, value] of [["name", "Morgan Example"], ["email", "morgan@example.com"]]) {
    await sql('INSERT INTO "ProfileField" (key,value,"updatedAt") VALUES ($1,$2,now())', [key, value]);
  }
  for (const [index, name] of names.entries()) {
    const bullets = ["Built SQL reports for " + name + ".", "Tested " + name + " against fixtures.", "Documented " + name + " results."].join("\n");
    await sql('INSERT INTO "Project" (id,name,link,bullets,"updatedAt") VALUES ($1,$2,$3,$4,now())',
      [projectIds[index], name, "https://example.com/" + name.toLowerCase(), bullets]);
  }
  await sql(`INSERT INTO "Experience" (id,role,company,location,"startYear","endYear",bullets,"updatedAt")
    VALUES ('fixture-role','Reporting Analyst','Example Systems','Example City',2023,2025,$1,now())`,
    ["Built SQL reports for quarterly reviews.\nChecked outputs against expected totals.\nDocumented each metric definition."]);
  await sql(`INSERT INTO "Education" (id,degree,school,"endYear","updatedAt")
    VALUES ('fixture-degree','B.S. Computer Science','Example University',2022,now())`);
  await sql('INSERT INTO "DiscoveryControl" (id,config,"updatedAt") VALUES ($1,$2,now())',
    ["discovery", JSON.stringify({ ...DEFAULT_DISCOVERY_CONFIG, provider: "configured" })]);
}

test.beforeEach(async () => { await resetData(); await seedPortfolio(); });
test("an undersized portfolio stops before planning and can be retried after updating the KB", async ({ page }) => {
  test.setTimeout(150_000);
  await sql('DELETE FROM "Project" WHERE id IN ($1,$2)', projectIds.slice(-2));
  await sql(`INSERT INTO "DiscoveryPosting" (id,"identityKey","occurrenceKey",source,"externalId",company,role,jd,complete,"postingEvidence",coverage)
    VALUES ('blocked-role','blocked','blocked:1','TEXT','blocked','Example Systems','Engineer',$1,true,$2,$3)`,
    [jd, JSON.stringify(proof), JSON.stringify(coverage)]);
  await page.goto("/discovery");
  await page.getByRole("button", { name: "Select for tailoring", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Role added" })).toBeVisible();
  await page.goto("/tailoring");
  await expect(page.getByText(/preparation needs five projects/i)).toBeVisible({ timeout: 30_000 });
  const [blocked] = await sql<{ id: string; kbSnapshotId: string; plan: unknown }>('SELECT id,"kbSnapshotId",plan FROM "TailoringSelection"');
  expect(blocked.plan).toBeNull();
  expect(await sql('SELECT id FROM "TailoringRevision"')).toEqual([]);
  await sql('INSERT INTO "Project" (id,name,link,bullets,"updatedAt") VALUES ($1,$2,$3,$4,now())',
    [projectIds[4], "Ember", "https://example.com/ember", "Built SQL reports for Ember.\nTested Ember against fixtures.\nDocumented Ember results."]);
  await page.getByRole("button", { name: "Retry preparation" }).click();
  await expect(page.getByRole("heading", { name: "Pending submission (1)" })).toBeVisible({ timeout: 100_000 });
  const [ready] = await sql<{ id: string; kbSnapshotId: string; plan: { selected: string[] } }>('SELECT id,"kbSnapshotId",plan FROM "TailoringSelection"');
  expect(ready.id).toBe(blocked.id);
  expect(ready.kbSnapshotId).not.toBe(blocked.kbSnapshotId);
  expect(new Set(ready.plan.selected).size).toBe(5);
});
for (const variant of [
  { track: "swe", letter: false, themed: false },
  { track: "data", letter: true, themed: false },
  { track: "swe", letter: false, themed: true },
] as const) {
  test(`verified ${variant.track} preparation with ${variant.themed ? "theme" : "LaTeX"} and letter ${variant.letter ? "on" : "off"}`, async ({ page, request }, info) => {
    test.setTimeout(150_000);
    const themeId = variant.themed ? (await sql<{ id: string }>('SELECT id FROM "Theme" WHERE "builtIn"=true AND layout=\'SINGLE\' ORDER BY id LIMIT 1'))[0].id : null;
    await sql(`INSERT INTO "Setting" (key,value,"updatedAt") VALUES ('workflow.tailoring',$1,now())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [JSON.stringify({ track: variant.track, themeId, coverLetter: variant.letter })]);
    await sql(`INSERT INTO "DiscoveryPosting" (id,"identityKey","occurrenceKey",source,"externalId",company,role,jd,complete,"postingEvidence",coverage)
      VALUES ('fictional-role','fixture','fixture:1','TEXT','fixture','Example Systems','Engineer',$1,true,$2,$3)`,
      [jd, JSON.stringify(proof), JSON.stringify(coverage)]);
    await page.goto("/discovery");
    await page.getByRole("button", { name: "Select for tailoring", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Role added" })).toBeVisible();
    await page.goto("/tailoring");
    // Stop immediately on a terminal failure and include its recorded reason.
    await expect.poll(async () => {
      const [row] = await sql<{ status: string; error: string | null }>('SELECT status,error FROM "TailoringSelection" WHERE "postingId"=\'fictional-role\'');
      return row?.status === "FAILED" || row?.status === "PENDING" ? row.status : "waiting";
    }, { timeout: 110_000 }).toMatch(/^(FAILED|PENDING)$/);
    const [run] = await sql<{ status: string; error: string | null; score: number; plan: { reviewed: { id: string }[]; selected: string[] }; content: { track: string } }>(
      'SELECT status,error,score,plan,content FROM "TailoringSelection" WHERE "postingId"=\'fictional-role\'');
    expect(run.status, run.error ?? undefined).toBe("PENDING");
    expect(run.plan.reviewed.map(project => project.id).sort()).toEqual(projectIds);
    expect(new Set(run.plan.selected).size).toBe(5);
    expect(run.plan.selected.every(id => projectIds.includes(id))).toBe(true);
    expect(run.content.track).toBe(variant.track);
    expect(run.score).toBe(100);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Pending submission (1)" })).toBeVisible();
    const documents = await sql<{ id: string; kind: string; format: string; text: string }>('SELECT id,kind,format,text FROM "TailoringRevision" ORDER BY kind DESC');
    expect(documents.map(doc => doc.kind)).toEqual(variant.letter ? ["resume", "letter"] : ["resume"]);
    for (const doc of documents) {
      expect(doc.text).toContain("Morgan Example");
      const path = "/api/tailoring/revisions/" + doc.id;
      const pdf = await request.get(path + "?file=pdf");
      expect(pdf.ok()).toBe(true);
      expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
      await info.attach(doc.kind + ".pdf", { body: await pdf.body(), contentType: "application/pdf" });
      const source = await request.get(path + "?file=source");
      expect(source.ok()).toBe(true);
      if (doc.kind === "resume" && variant.themed) {
        expect(doc.format).toBe("html");
        expect(JSON.stringify(await source.json())).toContain(themeId!);
      } else {
        expect(doc.format).toBe("latex");
        expect(await source.text()).toContain("\\documentclass");
      }
      const report = await request.get(path + "?file=report");
      expect((await report.json()).report).toMatchObject({ verified: true, score: 100 });
      const verification = await request.get(path + "?file=verification");
      expect(verification.ok()).toBe(true);
      expect(Object.keys(await verification.json()).length).toBeGreaterThan(0);
    }
    if (process.env.M4_REVIEW_ARTIFACTS === "1") {
      await page.getByRole("heading", { name: "Pending submission (1)" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: "runtime/m4/queue-" + variant.track + (variant.themed ? "-theme" : "") + ".png" });
    }
    if (variant.track === "data") {
      await page.getByRole("link", { name: "Review documents" }).click();
      const preview = page.getByRole("img", { name: "Resume rendered PDF page" });
      await expect(preview).toBeVisible();
      await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.getByText("Evidence mappings", { exact: true }).click();
      await expect(page.getByRole("definition").first()).toBeVisible();
      await page.getByLabel("Submission date").fill("2026-11-04");
      await page.getByRole("button", { name: "Mark submitted" }).click();
      await expect(page.getByRole("link", { name: "View submitted application" })).toBeVisible();
      const frozen = await sql('SELECT "applicationId","resumeRevisionId","letterRevisionId",score,"scoringMethod","submittedAt" FROM "TailoringSubmission"');
      expect(frozen).toHaveLength(1);
      expect(frozen[0]).toMatchObject({ resumeRevisionId: documents[0].id, letterRevisionId: documents[1].id, score: 100 });
      if (process.env.M5_REVIEW_ARTIFACTS === "1") await page.screenshot({ path: "runtime/m5/document-review.png" });

      // Editing queues a fresh generation; the recorded version stays downloadable.
      await page.getByText("Edit a statement", { exact: true }).click();
      const wording = page.getByLabel("Wording");
      const before = await wording.inputValue();
      const replacement = before.replace(/\.$/, "") + " for review.";
      await wording.fill(replacement);
      await page.getByRole("button", { name: "Save and verify" }).click();
      const current = async (generation: number) => {
        await expect.poll(async () => {
          const [r] = await sql<{generation:number;status:string;error:string|null}>('SELECT generation,status,error FROM "TailoringSelection" WHERE "postingId"=\'fictional-role\'');
          return r.generation === generation ? r.error ?? r.status : "waiting";
        }, { timeout: 45_000 }).toBe("SUBMITTED");
        await page.reload();
      };
      await current(2);
      const [edited] = await sql<{text:string}>('SELECT text FROM "TailoringRevision" WHERE generation=2 AND kind=\'resume\'');
      expect(edited.text.replace(/\s+/g," ")).toContain(replacement);
      await page.getByLabel("Document version").selectOption("1");
      await page.getByRole("button", { name: "Restore version 1 and verify" }).click();
      await current(3);
      const [restored] = await sql<{text:string}>('SELECT text FROM "TailoringRevision" WHERE generation=3 AND kind=\'resume\'');
      expect(restored.text).toBe(documents[0].text);
      await page.getByLabel("Refinement request").fill("Retain this documented evidence and its ownership.");
      await page.getByRole("button",{name:"Request revision"}).click();
      await current(4);
      expect(await sql('SELECT "applicationId","resumeRevisionId","letterRevisionId",score,"scoringMethod","submittedAt" FROM "TailoringSubmission"')).toEqual(frozen);
      expect((await request.get("/api/tailoring/revisions/" + documents[0].id + "?file=pdf")).ok()).toBe(true);
    }
  });
}
