import { z } from "zod";
import { formatDateRange } from "../profile";
import type { FrozenInput, SelectionPlan, TailoredContent } from "./contracts";
import { editSchema, planSchema } from "./tasks";

const str = z.string().default("");
const dates = { startYear:z.number().nullable().default(null), startMonth:z.number().nullable().default(null), endYear:z.number().nullable().default(null), endMonth:z.number().nullable().default(null), current:z.boolean().default(false) };
const sourceRow = { id: z.string().min(1), sort:z.number().default(0), bullets:str, skills:z.array(z.object({skillId:z.string()})).default([]) };
const schema = z.object({
  fields:z.array(z.object({key:z.string(),value:z.string()})), skills:z.array(z.object({id:z.string(),name:z.string()})),
  experience:z.array(z.object({...sourceRow,...dates,role:str,company:str,location:str})),
  projects:z.array(z.object({...sourceRow,name:str,link:str})),
  education:z.array(z.object({id:z.string(),sort:z.number().default(0),...dates,school:str,degree:str,notes:str})),
  details:z.array(z.object({entryId:z.string(),kind:z.string(),context:str,architecture:str,includeSwe:z.boolean(),includeData:z.boolean()})),
  facts:z.array(z.object({id:z.string(),text:z.string()})),
});
export const fold = (s:string) => s.normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase();
export function validLink(link:string) {
  try { const u=new URL(link); return ["http:","https:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export function inventory(raw:unknown) {
  const kb = schema.parse(raw);
  const skills = new Map(kb.skills.map(s => [s.id,s.name]));
  const sources = new Map<string,string[]>();
  for (const [kind,rows] of [["project",kb.projects],["experience",kb.experience]] as const) {
    for (const row of rows) {
      const detail = kb.details.find(d=>d.kind===kind && d.entryId===row.id);
      sources.set(row.id,[row.bullets,detail?.context ?? "",detail?.architecture ?? "",...row.skills.map(s=>skills.get(s.skillId) ?? "")].filter(Boolean));
    }
  }
  for (const row of kb.facts) sources.set(row.id,[row.text]);
  for (const row of kb.skills) sources.set(row.id,[row.name]);
  for (const row of kb.education) sources.set(row.id,[row.degree,row.school,row.notes]);
  const eligible=kb.projects.filter(p=>p.name.trim() && validLink(p.link) && sources.get(p.id)?.some(s=>s.trim())).map(p=>p.id);
  return {kb,sources,eligible,skills};
}
function allDistinct<T>(values:T[]) { return new Set(values).size===values.length; }
export function checkPlan(input: FrozenInput, value: unknown): SelectionPlan {
  const plan=planSchema.parse(value);
  const {kb,eligible}=inventory(input.kb);
  const reviewed=plan.reviewed.map(p=>p.id);
  if (!allDistinct(reviewed) || reviewed.length!==kb.projects.length || kb.projects.some(p=>!reviewed.includes(p.id))) throw new Error("The planner must consider every project exactly once.");
  if (!allDistinct(plan.selected) || plan.selected.some(id=>!eligible.includes(id))) throw new Error("Exactly five distinct eligible projects must be frozen.");
  return plan;
}
export function quoted(sources:Map<string,string[]>,id:string,quote:string) {
  return Boolean(fold(quote)) && Boolean(sources.get(id)?.some(value=>fold(value).includes(fold(quote))));
}
export function buildContent(input: FrozenInput, plan:SelectionPlan, value:unknown):TailoredContent & { compositionReason: string } {
  checkPlan(input,plan);
  const edit=editSchema.parse(value);
  const {kb,skills,sources}=inventory(input.kb);
  if (input.options.track!=="auto" && edit.track!==input.options.track) throw new Error("Editor changed the explicit track.");
  const ids=edit.projects.map(p=>p.id);
  if (!allDistinct(ids) || ids.some(id=>!plan.selected.includes(id)) || ids.join()!==plan.selected.filter(id=>ids.includes(id)).join()) throw new Error("Edited project inventory differs from the frozen ranked plan.");
  const details=(id:string)=>kb.details.find(d=>d.kind==="experience" && d.entryId===id);
  const roles=kb.experience.filter(role=>(edit.track==="swe"?details(role.id)?.includeSwe:details(role.id)?.includeData)??true).sort((a,b)=>a.sort-b.sort);
  if (roles.length!==edit.experience.length || roles.some(r=>!edit.experience.some(e=>e.id===r.id))) throw new Error("Editor changed the configured work history.");
  const evidence:TailoredContent["evidence"]=[];
  const grounded=(id:string,b:{text:string;quote:string})=>{
    if(!quoted(sources,id,b.quote)) throw new Error("A claim references unsupported source evidence.");
    const numbers=(s:string):string[]=>s.match(/\d+(?:[.,]\d+)*(?:%|\+)?/g)??[];
    if(numbers(b.text).some(n=>!numbers(b.quote).includes(n))) throw new Error("Claim contains a metric absent from its cited evidence.");
    evidence.push({sourceId:id,...b});
    return b.text;
  };
  const bullets=(id:string,items:{text:string;quote:string}[])=>{
    if (!allDistinct(items.map(b=>fold(b.text)))) throw new Error("Duplicate bullets in an entry.");
    return items.map(b=>grounded(id,b));
  };
  const fields=Object.fromEntries(kb.fields.map(f=>[f.key,f.value]));
  if (!fields.name?.trim()) throw new Error("Add a name to the validated profile before preparing a resume.");
  const contact={name:fields.name,email:fields.email,phone:fields.phone,location:[fields.city,fields.country].filter(Boolean).join(", "),website:fields.website,linkedin:fields.linkedin,github:fields.github};
  const resume={
    contact, skills:edit.skills.map(group=>({ category:group.category,items:group.skillIds.map(id=>{const name=skills.get(id); if(!name)throw new Error("Unknown profile skill.");return name;}) })),
    experience:roles.map(row=>{const b=edit.experience.find(e=>e.id===row.id)!.bullets;
      if(edit.track==="data" && (b.length<2||b.length>3))throw new Error("Data work history needs two or three substantive bullets per included role.");
      return {role:row.role,company:row.company,location:row.location,dates:formatDateRange(row),bullets:bullets(row.id,b),includeSwe:details(row.id)?.includeSwe??true,includeData:details(row.id)?.includeData??true};}),
    projects:edit.projects.map(project=>{const row=kb.projects.find(p=>p.id===project.id)!;
      if(project.stack.some(tech=>!quoted(sources,row.id,tech)))throw new Error("Project stack cites an unverified technology.");
      return {name:row.name,url:row.link,stack:project.stack,bullets:bullets(row.id,project.bullets)};}),
    education:kb.education.toSorted((a,b)=>a.sort-b.sort).map(row=>({school:row.school,degree:row.degree,dates:formatDateRange(row),details:row.notes.split("\n").filter(Boolean)})),
  };
  if(Boolean(edit.letter.length)!==input.options.coverLetter) throw new Error("Cover letter does not match the run options.");
  const letter=input.options.coverLetter?{contact,date:input.preparedAt.slice(0,10),company:input.company,role:input.role,salutation:"Dear Hiring Team,",paragraphs:edit.letter.map(p=>grounded(p.sourceId,{text:p.text,quote:p.quote})),closing:"Sincerely,"}:null;
  return {track:edit.track,resume,letter,evidence,compositionReason:edit.compositionReason};
}
