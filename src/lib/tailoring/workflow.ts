import "server-only";
import { z } from "zod";
import { getAiProvider } from "../ai";
import type { FrozenInput, RenderedDocument, ReviewResult, SelectionPlan, TailoredContent } from "./contracts";
import { buildContent, checkPlan, fold, inventory, quoted } from "./grounding";
import { instructions, reviewSchema, schemas, taskPrompt, type Task } from "./tasks";

async function execute(task: Task, input: FrozenInput, data: unknown, signal: AbortSignal):Promise<unknown> {
  signal.throwIfAborted();
  const prompt=taskPrompt(task,data);
  if(input.provider==="configured"){
    const provider=await getAiProvider();
    return provider.complete({system:instructions[task],messages:[{role:"user",content:prompt}],schema:schemas[task] as z.ZodType<unknown>,schemaName:"tailoring_"+task,maxTokens:16000,signal});
  }
  const token=process.env.DOSSIER_SECRET;
  if(!token)throw new Error("The execution worker is not configured.");
  const response=await fetch((process.env.WORKER_URL??"http://worker:4310").replace(/\/$/,"")+"/tailoring/ai/"+task,{
    method:"POST",redirect:"error",headers:{"content-type":"application/json","x-worker-token":token},
    body:JSON.stringify({data,model:input.model}),signal:AbortSignal.any([signal,AbortSignal.timeout(240000)])});
  const reader=response.body?.getReader();
  if(!reader)throw new Error("The tailoring worker returned no response.");
  const chunks:Uint8Array[]=[];let size=0;
  try {
    for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>2*1024*1024){await reader.cancel();throw new Error("Tailoring response exceeded its limit.");}chunks.push(value);}
  } finally {reader.releaseLock();}
  const result=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!response.ok) {
    const messages:Record<string,string>={auth:"Reconnect ChatGPT in Connections and retry this preparation.",quota:"The Codex usage limit was reached. Retry this preparation after reset.",cancelled:"Tailoring was cancelled.","invalid-result":"Codex returned an invalid structured tailoring result."};
    throw new Error(messages[result.code]??"Codex could not complete this tailoring stage. Retry after checking Connections.");
  }
  return schemas[task].parse(result);
}
export async function planProjects(input:FrozenInput,signal:AbortSignal):Promise<SelectionPlan>{
  const {eligible}=inventory(input.kb);
  if(eligible.length<5)throw new Error("Preparation needs five projects with validated evidence, names and public project links. Found "+eligible.length+".");
  // No theme or track is supplied before the plan is frozen.
  return checkPlan(input,await execute("plan",input,{kb:input.kb,jd:input.jd,eligible},signal));
}
export async function editResume(input:FrozenInput,plan:SelectionPlan,signal:AbortSignal):Promise<TailoredContent>{
  checkPlan(input,plan);
  return buildContent(input,plan,await execute("edit",input,{kb:input.kb,jd:input.jd,company:input.company,role:input.role,options:input.options,plan,revisionFeedback:input.revisionFeedback,priorContent:input.priorContent},signal));
}
/** Poppler can omit a space between positioned HTML words (e.g. ReportingAnalyst).
 * Only spaces present in the expected phrase may disappear. Match whole words
 * at its edges so SQL cannot receive credit from NoSQL. */
function pdfMatcher(extracted: string) {
  const text = fold(extracted.replaceAll("\u00ad", ""));
  return (value: string) => {
    const phrase = fold(value.replaceAll("\u00ad", ""));
    if (!phrase) return false;
    const literal = phrase.split(" ").map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(" ?");
    const start = /^[\p{L}\p{N}_]/u.test(phrase) ? "(?<![\\p{L}\\p{N}_])" : "";
    const end = /[\p{L}\p{N}_]$/u.test(phrase) ? "(?![\\p{L}\\p{N}_])" : "";
    return new RegExp(start + literal + end, "u").test(text);
  };
}

export function assessReview(input:FrozenInput, content:TailoredContent, documents:RenderedDocument[], value:unknown):ReviewResult{
  const result=reviewSchema.parse(value);
  const {sources}=inventory(input.kb);
  const problems=[...result.problems];
  const resume=documents.find(d=>d.kind==="resume");
  const shown=pdfMatcher(resume?.text??"");
  const letterShows=pdfMatcher(documents.find(d=>d.kind==="letter")?.text??"");
  if(documents.filter(d=>d.kind==="resume").length!==1 || documents.filter(d=>d.kind==="letter").length!==(content.letter?1:0))problems.push("Rendered document inventory does not match the run options.");
  for(const expected of [content.resume.contact.name,...content.resume.projects.flatMap(p=>[p.name,...p.bullets]),...content.resume.experience.flatMap(e=>[e.role,e.company,...e.bullets]),...content.resume.education.flatMap(e=>[e.school,e.degree])]){
    if(!shown(expected))problems.push("Expected resume content is missing from PDF text: "+expected);
  }
  if(content.letter?.paragraphs.some(p=>!letterShows(p)))problems.push("Expected cover letter content is missing from its PDF.");
  const seen=new Set<string>(); let earned=0,possible=0;
  const jd=fold(input.jd);
  for(const match of result.requirements){
    const key=fold(match.jdQuote);
    if(seen.has(key)||!jd.includes(key))problems.push("Repeated or unsupported JD requirement in the match report.");
    seen.add(key);
    const weight=match.importance==="core"?2:1;possible+=weight;
    if(match.alignment==="absent"){
      if(match.pdfQuote||match.kbQuote||match.sourceId)problems.push("Absent requirement incorrectly cites evidence.");
    }else if(!match.pdfQuote.trim()||!shown(match.pdfQuote)||!quoted(sources,match.sourceId,match.kbQuote)){
      problems.push("Requirement credit lacks demonstrated PDF and KB evidence.");
    }else earned+=weight*(match.alignment==="direct"?1:0.5);
  }
  const keywords=[...new Set(result.keywords.map(fold))];
  if(keywords.some(k=>!jd.includes(k)))problems.push("A reported keyword is absent from the JD.");
  const verified=problems.length===0;
  return {verified,problems,score:verified?Math.round(100*earned/possible):null,report:{method:"v5-evidence@1",basis:"final resume PDF",requirements:result.requirements,
    keywords:keywords.map(keyword=>({keyword,covered:shown(keyword)})),keywordCoverage:keywords.length?Math.round(100*keywords.filter(shown).length/keywords.length):null}};
}
export async function reviewResume(input:FrozenInput,plan:SelectionPlan,content:TailoredContent,documents:RenderedDocument[],signal:AbortSignal):Promise<ReviewResult>{
  const data={kb:input.kb,jd:input.jd,options:input.options,plan,content,documents:documents.map(d=>({kind:d.kind,text:d.text,verification:d.verification}))};
  return assessReview(input,content,documents,await execute("review",input,data,signal));
}
