import { expect, it } from "vitest";
import type { TailoredContent } from "./contracts";
import { editClaim } from "./revision-edit";

const make = (): TailoredContent => ({
  track:"swe", resume:{ contact:{name:"Fictional Author"},education:[],skills:[],
    experience:[{ role:"Analyst",company:"Fictional Co",dates:"2021",location:"",bullets:["Reviewed 10 reports."],includeSwe:true,includeData:true }],
    projects:[{name:"Example",url:"https://example.com",stack:[],bullets:["Reviewed 10 reports."]}],
  }, letter:null, evidence:[
    {text:"Reviewed 10 reports.",sourceId:"role",quote:"Reviewed 10 reports."},
    {text:"Reviewed 10 reports.",sourceId:"project",quote:"Reviewed 10 reports."},
  ],
});

it("edits only the chosen occurrence and its evidence mapping", () => {
  const base=make();
  const edited=editClaim(base,1,"Reviewed the 10 reports.");
  expect(edited.resume.projects[0].bullets[0]).toBe("Reviewed the 10 reports.");
  expect(edited.evidence[1]).toEqual({...base.evidence[1],text:"Reviewed the 10 reports."});
  expect(edited.resume.experience).toEqual(base.resume.experience);
  expect(base).toEqual(make());
});
it("keeps the source quote and rejects changed metrics or stale evidence positions", () => {
  expect(() => editClaim(make(),0,"Reviewed 11 reports.")).toThrow(/metric/);
  expect(() => editClaim(make(),4,"Reviewed reports.")).toThrow(/does not match/);
  const base=make();
  base.evidence[0].text="Another statement.";
  expect(() => editClaim(base,0,"Reviewed reports.")).toThrow(/does not match/);
});
it("handles letter paragraphs and rejects duplicate statements in the same section", () => {
  const base=make();
  base.letter={contact:{name:"Example"},company:"Example",role:"Engineer",date:"2026-11-01",salutation:"Hello",paragraphs:["Built reports."],closing:"Regards"};
  base.evidence.push({text:"Built reports.",quote:"Built reports.",sourceId:"project"});
  expect(editClaim(base,2,"Built reliable reports.").letter?.paragraphs).toEqual(["Built reliable reports."]);
  base.resume.experience[0].bullets.push("Checked outputs.");
  base.evidence.splice(1,0,{text:"Checked outputs.",quote:"Checked outputs.",sourceId:"role"});
  expect(() => editClaim(base,0,"Checked outputs.")).toThrow("duplicates");
});
