import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createTestClient, resetDatabase } from "@/test/db";
import { removeTailoringSelection, setDiscoveryState } from "@/lib/discovery/service";
import { loadDocumentReview, queueRevision } from "./document-review";
import { asJson, removeRun } from "./queue";
import { fictionalResume } from "../templates/v5";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => { const { createTestClient } = await import("@/test/db"); db.client = createTestClient(); return { prisma: db.client }; });
const prisma = () => db.client!;
beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

async function prepared() {
  const posting = await prisma().discoveryPosting.create({data:{ identityKey:"fixture",occurrenceKey:"fixture",source:"TEXT",externalId:"fixture",role:"Engineer",jd:"Build and maintain software.",complete:true,postingEvidence:{} }});
  const content = {track:"swe",resume:fictionalResume,letter:null,evidence:[]};
  const run = await prisma().tailoringSelection.create({data:{postingId:posting.id,status:"PENDING",score:72,plan:{reviewed:[],selected:[],rationale:"Example rationale"},content:asJson(content)}});
  return {run,posting,content};
}

it("queues a single revision for concurrent edits, clears readiness, and restores the previous content", async () => {
  const {run,content}=await prepared();
  const requests=await Promise.allSettled([1,2].map(() => queueRevision(run.id,1,{mode:"chat",instruction:"Shorten a bullet."})));
  expect(requests.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  const review=await loadDocumentReview(run.id);
  expect(review).toMatchObject({generation:2,status:"QUEUED",history:[{generation:1,canRestore:true,reason:"Shorten a bullet."}]});
  await removeRun(run.id);
  await queueRevision(run.id,2,{mode:"restore",generation:1});
  expect(await prisma().tailoringSelection.findUniqueOrThrow({where:{id:run.id}})).toMatchObject({generation:3,score:null,status:"QUEUED",content});
});
it.each(["remove","dismiss"])("preserves the run after discovery %s",async action=>{
  const {run,posting}=await prepared();
  await queueRevision(run.id,1,{mode:"chat",instruction:"Clarify ownership."});
  if(action==="remove") await removeTailoringSelection(run.id);
  else await setDiscoveryState([posting.id],"DISMISSED");
  expect(await loadDocumentReview(run.id)).toMatchObject({status:"CANCELLED",generation:2,history:[{generation:1,canRestore:true}]});
});

it("rejects stale edits, missing work and absent source content without changing readiness", async () => {
  const { run } = await prepared();
  await expect(queueRevision("missing", 1, { mode:"chat", instruction:"Shorten" })).rejects.toThrow("changed");
  await expect(queueRevision(run.id, 9, { mode:"chat", instruction:"Shorten" })).rejects.toThrow("changed");
  await expect(queueRevision(run.id, 1, { mode:"restore", generation:5 })).rejects.toThrow("no saved");
  await expect(queueRevision(run.id, 1, { mode:"manual", index:0, text:"New claim" })).rejects.toThrow("does not match");
  await prisma().tailoringSelection.update({where:{id:run.id},data:{content:asJson(null)}});
  await expect(queueRevision(run.id, 1, { mode:"manual", index:0, text:"New claim" })).rejects.toThrow("no editable");
  expect(await loadDocumentReview("missing")).toBeNull();
  expect(await prisma().tailoringSelection.findUniqueOrThrow({where:{id:run.id}})).toMatchObject({status:"PENDING",generation:1,score:72});
});

it("loads frozen project names and saved revision evidence while editing only the requested claim", async () => {
  const { run, content } = await prepared();
  const text = content.resume.experience[0].bullets[0];
  const editable = {...content,evidence:[{text,quote:text,sourceId:"role"}]};
  const kb = await prisma().knowledgeSnapshot.create({data:{digest:"fictional",payload:{projects:[{id:"project",name:"Archived project"}]}}});
  await prisma().tailoringSelection.update({where:{id:run.id},data:{content:asJson(editable),kbSnapshotId:kb.id}});
  await prisma().tailoringRevision.create({data:{runId:run.id,kind:"resume",format:"latex",source:"fictional",pdf:new Uint8Array([1]),preview:new Uint8Array(),text,verification:{pages:1},evidence:asJson(editable.evidence)}});
  const review = await loadDocumentReview(run.id);
  expect(review?.projectNames).toEqual({project:"Archived project"});
  expect(review?.revisions[0].evidence).toEqual(editable.evidence);
  await queueRevision(run.id,1,{mode:"manual",index:0,text:text+" Carefully."});
  const changed=await prisma().tailoringSelection.findUniqueOrThrow({where:{id:run.id}});
  expect(changed).toMatchObject({status:"QUEUED",generation:2,score:null});
  expect(await prisma().tailoringRevision.count({where:{runId:run.id}})).toBe(1);
});
