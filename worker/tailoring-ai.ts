import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CodexAdapter } from "./codex";
import { ExecutionError } from "./rpc";
import { schemas, taskPrompt, type Task } from "../src/lib/tailoring/tasks";

const adapter = new CodexAdapter(undefined,undefined,180000,value=>value);
const bodySchema=z.object({model:z.string().max(160),data:z.record(z.string(),z.unknown())}).strict();
export async function handleTailoringAI(request:IncomingMessage,response:ServerResponse):Promise<boolean>{
  const match=/^\/tailoring\/ai\/(plan|edit|review)$/.exec(request.url??"");
  if(!match||request.method!=="POST")return false;
  const task=match[1] as Task;
  const send=(status:number,value:unknown)=>{response.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});response.end(JSON.stringify(value));};
  const controller=new AbortController();
  const abort=()=>{if(!response.writableEnded)controller.abort();};
  response.on("close",abort);
  try{
    const chunks:Buffer[]=[];let bytes=0;
    for await(const chunk of request){const b=Buffer.from(chunk);bytes+=b.length;if(bytes>8*1024*1024){send(413,{code:"context"});return true;}chunks.push(b);}
    const {data,model}=bodySchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result=await adapter.execute({id:randomUUID(),prompt:taskPrompt(task,data),model:model||undefined,outputSchema:z.toJSONSchema(schemas[task])},controller.signal,()=>{});
    send(200,schemas[task].parse(result.structured));
  } catch(error){send(503,{code:error instanceof ExecutionError?error.code:"invalid-result"});}
  finally{response.off("close",abort);}
  return true;
}
