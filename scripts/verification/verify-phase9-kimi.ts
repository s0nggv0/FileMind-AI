// Explicit, persistent six-request cap, including failed attempts. No retries.
import { loadEnvConfig } from "@next/env";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../../src/lib/ai/models";
import { buildRAGContext } from "../../src/lib/retrieval/rag";
import { verifyAnswerContext } from "../../src/lib/retrieval/answer-context";
import type { Evidence } from "../../src/lib/retrieval/types";
async function main() {
if (!process.argv.includes("--live")) throw new Error("Explicit --live is required.");
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const destination=join(process.cwd(),"docs/evaluation/phase9-kimi-samples.json");
const budgetFile=join(process.cwd(),"artifacts/phase9-kimi-budget.json");
await mkdir(join(process.cwd(),"artifacts"),{recursive:true});
const recorded=await readFile(destination,"utf8").then(s=>JSON.parse(s).callsUsed as number,()=>0);
let used=Math.max(recorded,await readFile(budgetFile,"utf8").then(s=>JSON.parse(s).used as number,()=>0));
if(!Number.isInteger(used)||used<0||used>=6){console.error("Phase 9 Kimi budget exhausted. No provider request was sent; retained receipts are unchanged.");process.exitCode=1;return;}
const calls:{number:number;ok:boolean;durationMs:number}[]=[];
const provider=createKimiProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL,models:readModelConfig(process.env),fetch:async(input,init)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  if(!["api.moonshot.cn","api.moonshot.ai"].includes(url.hostname))throw new Error("Unapproved synthetic-test endpoint");
  if(used>=6)throw new Error("PHASE9_KIMI_BUDGET_EXHAUSTED");
  used++;await writeFile(budgetFile,JSON.stringify({limit:6,used,updatedAt:new Date().toISOString()}));
  const start=performance.now();
  try {const r=await fetch(input,init);const body=await r.clone().json().catch(()=>null);await writeFile(join(process.cwd(),`artifacts/phase9-kimi-response-${used}.json`),JSON.stringify({content:body?.choices?.[0]?.message?.content,usage:body?.usage}));calls.push({number:used,ok:r.ok,durationMs:performance.now()-start});return r;}
  catch {calls.push({number:used,ok:false,durationMs:performance.now()-start});throw new Error("Synthetic provider request unavailable");}
}});
const userId=randomUUID(),workspaceId=randomUUID();
function source(content:string,name:string):Evidence{return {id:randomUUID(),documentId:randomUUID(),userId,workspaceId,chunkIndex:0,content,contentHash:content,chunkVersion:"chunk-v1",tokenEstimate:20,pageStart:null,pageEnd:null,lineStart:1,lineEnd:1,paragraphStart:null,paragraphEnd:null,headingPath:[],charStart:0,charEnd:content.length,documentName:name,fileType:"txt",summary:"",tags:[],score:0.9,semanticScore:0.9};}
const rows:{name:string;passed:boolean;result:unknown}[]=[];
const signal=AbortSignal.timeout(240000);
// Clarification first ensures that a repaired conflict cannot consume its budget.
const projects=[source("AI Competition project deadline is June 10.","ai-project.txt"),source("Database Course Project deadline is June 15.","course-project.txt"),source("Research Proposal project deadline is June 20.","research-project.txt")];
const clarification=await verifyAnswerContext("那个项目什么时候截止？",buildRAGContext(projects).sources,provider,signal).catch(()=>null);
rows.push({name:"ambiguous-project",passed:clarification?.clarification.required===true&&clarification.clarification.options.length===3,result:clarification});
const policies=[source("Orion policy edition 2028-01 specifies that temporary records last 3 hours.","orion-policy-old.txt"),source("Orion policy edition 2028-03 explicitly replaces the prior temporary-record retention clause. Temporary records now last 8 hours.","orion-policy-update.txt")];
const conflict=await verifyAnswerContext("比较 Orion policy 两个版本的保留期，引用双方并说明更新关系。",buildRAGContext(policies).sources,provider,signal).catch(()=>null);
rows.push({name:"conflict-and-date-regression",passed:conflict?.conflicts.length===1&&conflict.conflicts[0].versionRelationship==="explicit_superseded",result:conflict});
if(used<6){try{const docs=[projects[0],source("AI Competition project uses human review before applying changes.","ai-review.txt")];const context=await verifyAnswerContext("When is the AI Competition deadline?",buildRAGContext(docs).sources,provider,signal);rows.push({name:"specific-query-no-overclarification",passed:!context.clarification.required&&!context.conflicts.length,result:context});}catch{rows.push({name:"specific-query-no-overclarification",passed:false,result:{unavailable:true}});}}
await writeFile(destination,JSON.stringify({version:"phase9-budgeted-samples-v1",checkedAt:new Date().toISOString(),live:true,syntheticSources:true,retrievalTested:false,callLimit:6,callsUsed:used,calls,rows,passed:rows.every(r=>r.passed),scope:"After retained failed attempt 1, three context-verification samples only. Final answer generation and release verification were tested locally, not with this live sample. Not a 20-query real-model regression, global false-refusal metric or full Demo."},null,2)+"\n");
console.log(JSON.stringify({callsUsed:used,limit:6,results:rows.map(r=>({name:r.name,passed:r.passed}))}));
if(rows.some(r=>!r.passed))process.exitCode=1;

}
void main().catch(()=>{console.error("Phase 9 sample execution failed; credentials suppressed.");process.exitCode=1;});
