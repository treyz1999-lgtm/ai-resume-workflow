import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createTestClient, resetDatabase } from "@/test/db";
import { encodeTracker, parseTracker } from "./format";
import { exportAttempts, importAttempts, previewAttempts } from "./store";

const state = vi.hoisted(() => ({client:undefined as ReturnType<typeof createTestClient> | undefined}));
vi.mock("@/lib/prisma", async () => {
  const {createTestClient} = await import("@/test/db");
  state.client = createTestClient();
  return {prisma:state.client};
});
beforeEach(() => resetDatabase(state.client!));
afterAll(() => state.client!.$disconnect());

it("previews without changes, imports duplicate roles, and skips reimports without overwriting edits", async () => {
  const row = {company:"Fictional Co",job_title:"Analyst",application_status:"Applied",job_track:"Data",
    experience_requirement:"3–5 years",salary_min:"50,000",date_applied:"11/1/2026"};
  const attempts = parseTracker(encodeTracker([{...row,application_id:"1"},{...row,application_id:"2"}]));
  expect((await previewAttempts(attempts)).map(a => a.exists)).toEqual([false,false]);
  expect(await state.client!.application.count()).toBe(0);
  const results = await Promise.all([importAttempts(attempts),importAttempts(attempts)]);
  expect(results.reduce((n,r) => n+r.count,0)).toBe(2);
  expect((await previewAttempts(attempts)).every(a => a.exists)).toBe(true);
  await state.client!.application.update({where:{id:attempts[0].id},data:{status:"INTERVIEW"}});
  expect((await importAttempts(attempts)).count).toBe(0);
  const rows = parseTracker(await exportAttempts());
  const edited = rows.find(a => a.id === attempts[0].id);
  expect(edited?.fields).toMatchObject({application_id:"1",experience_requirement:"3–5 years",salary_min:"50,000",application_status:"INTERVIEW"});
  expect(rows.find(a => a.id === attempts[1].id)?.fields.application_status).toBe("Applied");
  expect((await importAttempts(rows)).count).toBe(0);
});

it("keeps agency drafts private and discovery scores out of exported submitted scores", async () => {
  await state.client!.application.createMany({data:[
    {company:"Hidden", role:"Draft",awaitingReview:true},
    {company:"Example",role:"Engineer",agentScore:88},
  ]});
  const exported = parseTracker(await exportAttempts());
  expect(exported).toHaveLength(1);
  expect(exported[0].fields.submitted_score).toBe("");
});
