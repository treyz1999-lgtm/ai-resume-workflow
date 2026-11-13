import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildContent, checkPlan } from "./grounding";
import { assessReview, editResume, planProjects, reviewResume } from "./workflow";
import type { FrozenInput, RenderedDocument } from "./contracts";

const complete=vi.hoisted(()=>vi.fn());
vi.mock("../ai",()=>({getAiProvider:async()=>({complete})}));
const projects=Array.from({length:6},(_,i)=>({id:"project-"+i,name:"Example "+i,link:"https://example.com/p"+i,
  bullets:"Built SQL reports.\nTested the reports.\nDocumented the queries."}));
const kb={fields:[{key:"name",value:"Morgan Example"}],skills:[],projects,experience:[],education:[],details:[],facts:[]};
const input:FrozenInput={kb,jd:"SQL required. Python preferred.",company:"Example",role:"Analyst",preparedAt:"2026-11-12",provider:"configured",model:"",options:{track:"auto",themeId:null,coverLetter:false}};
const plan={reviewed:projects.map(p=>({id:p.id,reason:"Evidence reviewed."})),selected:projects.slice(0,5).map(p=>p.id),rationale:"Five supported projects."};
const draft={track:"data",compositionReason:"Two projects fit.",skills:[],experience:[],letter:[],projects:projects.slice(0,2).map(p=>({id:p.id,stack:[],bullets:p.bullets.split("\n").map(text=>({text,quote:text}))}))};
const report={problems:[],requirements:[{jdQuote:"SQL required.",importance:"core",alignment:"direct",pdfQuote:"Built SQL reports.",kbQuote:"Built SQL reports.",sourceId:"project-0",explanation:"Demonstrated."},
  {jdQuote:"Python preferred.",importance:"preference",alignment:"absent",pdfQuote:"",kbQuote:"",sourceId:"",explanation:"No evidence."}],keywords:["SQL","Python"]};
const doc=(text:string):RenderedDocument=>({kind:"resume",format:"latex",source:"",pdf:new Uint8Array(),preview:new Uint8Array(),text,verification:{}});
const pdf=[doc(["Morgan Example",...projects.slice(0,2).flatMap(p=>[p.name,p.bullets])].join("\n"))];
beforeEach(()=>complete.mockReset());
describe("V5 tailoring",()=>{
  it("blocks fewer than five eligible projects before provider or template access",async()=>{
    await expect(planProjects({...input,kb:{...kb,projects:projects.slice(0,4)}},new AbortController().signal)).rejects.toThrow("Found 4");
    expect(complete).not.toHaveBeenCalled();
  });
  it("requires complete portfolio review and five distinct valid IDs",()=>{
    expect(()=>checkPlan(input,{...plan,reviewed:plan.reviewed.slice(0,5)})).toThrow("every project");
    expect(()=>checkPlan(input,{...plan,selected:Array(5).fill("project-0")})).toThrow("distinct");
  });
  it("reads the complete KB before templates and computes PDF-based score, keyword coverage separately",async()=>{
    complete.mockResolvedValueOnce(plan).mockResolvedValueOnce(draft).mockResolvedValueOnce(report);
    const signal=new AbortController().signal;
    const frozen=await planProjects(input,signal);
    const prompt=JSON.parse(complete.mock.calls[0][0].messages[0].content.split("\n\n")[1]);
    expect(prompt).toMatchObject({kb,jd:input.jd});expect(prompt.options).toBeUndefined();
    const content=await editResume(input,frozen,signal);
    expect(content.resume.projects.map(p=>p.name)).toEqual(["Example 0","Example 1"]);
    expect(await reviewResume(input,frozen,content,pdf,signal)).toMatchObject({verified:true,score:67,report:{keywordCoverage:50}});
  });
  it("blocks transfers, changed metrics, duplicate bullets and unselected projects",()=>{
    for(const mutate of [
      (v:typeof draft)=>{v.projects[0].bullets[0].quote="Unverified system."},
      (v:typeof draft)=>{v.projects[0].bullets[0].text="Raised revenue by 10%."},
      (v:typeof draft)=>{v.projects[0].bullets[1]=v.projects[0].bullets[0]},
      (v:typeof draft)=>{v.projects[0].id="project-5"},
    ]){ const copy=structuredClone(draft);mutate(copy);expect(()=>buildContent(input,plan,copy)).toThrow(); }
  });
  it("rejects incorrect track, cover letter setting, invented skills and missing roles",()=>{
    expect(()=>buildContent({...input,options:{...input.options,track:"swe"}},plan,draft)).toThrow("explicit track");
    expect(()=>buildContent({...input,options:{...input.options,coverLetter:true}},plan,draft)).toThrow("Cover letter");
    expect(()=>buildContent(input,plan,{...draft,skills:[{category:"Tools",skillIds:["invented"]}]})).toThrow("Unknown profile skill");
    expect(()=>buildContent({...input,kb:{...kb,experience:[{id:"r",role:"Tester"}]}},plan,draft)).toThrow("work history");
  });
  it("refuses unsupported PDF credit and records reviewer findings without a readiness score",()=>{
    const content=buildContent(input,plan,draft);
    expect(assessReview(input,content,[doc("Incomplete resume")],report)).toMatchObject({verified:false,score:null});
    expect(assessReview(input,content,pdf,{...report,problems:["Overstates team ownership."]})).toMatchObject({verified:false,score:null});
  });
});
