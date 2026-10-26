// Two synthetic comparisons in an in-memory SQL database. A persistent transport
// ledger counts every external attempt, including failures and bounded repairs.
import { loadEnvConfig } from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { isolatedKnowledge } from "../../tests/helpers/isolated-knowledge";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../../src/lib/ai/models";
import { DashScopeEmbeddingProvider } from "../../src/lib/retrieval/dashscope-provider";
import { PostgresSearchHistory } from "../../src/lib/retrieval/postgres-search-history";
import { SearchService } from "../../src/lib/retrieval/search-service";
import { IndexStatusRepository } from "../../src/lib/retrieval/index-status";
import { contentHash } from "../../src/lib/retrieval/chunker";
import { lexicalTokens } from "../../src/lib/retrieval/lexical-tokens";
import type { EmbeddingResult } from "../../src/lib/retrieval/embedding-provider";

async function main() {
  if (!process.argv.includes("--live")) throw new Error("Explicit --live required");
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const root=join(process.cwd(),"artifacts/priority-optimizations");await mkdir(root,{recursive:true});
  const ledger=join(root,"live-budget.json"),reportPath=join(root,"live-report.json"),limit=20;
  let used=await readFile(ledger,"utf8").then(s=>JSON.parse(s).used as number,()=>0);
  assert.ok(Number.isInteger(used)&&used>=0&&used<limit,"Persistent external request budget exhausted");
  const calls:{number:number;service:string;ok:boolean;durationMs:number}[]=[];
  const transport:typeof fetch=async(input,init)=>{
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
    if(url.protocol!=="https:"||(!["api.moonshot.cn","api.moonshot.ai"].includes(url.hostname)&&!url.hostname.endsWith(".aliyuncs.com")))throw new Error("Unapproved live destination");
    if(used>=limit)throw new Error("EXTERNAL_BUDGET_EXHAUSTED");
    used++;await writeFile(ledger,JSON.stringify({limit,used,updatedAt:new Date().toISOString()}));
    const start=performance.now(),service=url.hostname.endsWith(".aliyuncs.com")?"embedding":"kimi";
    try{const response=await fetch(input,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(60000)])});calls.push({number:used,service,ok:response.ok,durationMs:Math.round(performance.now()-start)});return response;}
    catch{calls.push({number:used,service,ok:false,durationMs:Math.round(performance.now()-start)});throw new Error("Synthetic provider connection unavailable");}
  };
  const missingOnly=process.argv.includes("--missing-only");
  const prior=await readFile(reportPath,"utf8").then(s=>JSON.parse(s),()=>null);
  const retainedRows:Record<string,unknown>[]=missingOnly ? (prior?.rows??[]).filter((row:{case:string;passed:boolean})=>row.case==="long-source-versus-short"&&row.passed) : [];
  const retainedCalls=prior?.calls??[];
  const rows:Record<string,unknown>[]=[...retainedRows],f=await isolatedKnowledge();
  try{
    const provider=createKimiProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL,models:readModelConfig(process.env),fetch:transport});
    const embeddings=new DashScopeEmbeddingProvider({apiKey:process.env.EMBEDDING_API_KEY||process.env.DASHSCOPE_API_KEY||"",baseURL:process.env.EMBEDDING_BASE_URL||"",model:process.env.EMBEDDING_MODEL||"",dimensions:Number(process.env.EMBEDDING_DIMENSIONS||1024),fetch:transport});
    const userId=crypto.randomUUID(),workspace=await f.workspaces.create(userId,"Synthetic bounded live comparison"),ids=[crypto.randomUUID(),crypto.randomUUID()];
    const missing="合成织叶方案乙只说明使用人工复核，未给出通过线。";
    const texts=["合成织叶方案甲的通过线为72分。", missingOnly ? missing : "合成织叶方案乙的通过线为68分。"];
    const savedTexts=[Array(30).fill(texts[0]).join("\n\n"),texts[1]];
    await f.workspaces.save(userId,{...workspace,documents:ids.map((id,i)=>({id,name:`合成方案${i?"乙":"甲"}.txt`,type:"txt" as const,mimeType:"text/plain",size:Buffer.byteLength(savedTexts[i]),parseStatus:"completed" as const,contentHash:contentHash(savedTexts[i]),metadata:{addedAt:new Date().toISOString()}})),texts:Object.fromEntries(ids.map((id,i)=>[id,savedTexts[i]]))});
    const vectors=await embeddings.embedDocuments(texts),info=embeddings.getModelInfo();
    async function chunk(documentId:string,index:number,text:string,vector:EmbeddingResult){
      const id=crypto.randomUUID(),start=index*(text.length+2);
      await f.db.query(`insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version,lexical_tokens) values($1,$2,$3,$4,$5,$6,$7,$8,$9,30,'chunk-v1',$10)`,[id,userId,workspace.id,documentId,index,text,contentHash(text),start,start+text.length,lexicalTokens(text)]);
      await f.db.query(`insert into filemind.chunk_embeddings(user_id,workspace_id,document_id,chunk_id,provider,model,dimensions,embedding,embedding_hash,chunk_version) values($1,$2,$3,$4,$5,$6,$7,$8,'synthetic','chunk-v1')`,[userId,workspace.id,documentId,id,info.provider,info.model,info.dimensions,vector.vector]);
    }
    for(let i=0;i<30;i++)await chunk(ids[0],i,texts[0],vectors[0]);await chunk(ids[1],0,texts[1],vectors[1]);
    const ready=()=>f.db.query("update filemind.documents set index_status='ready',embedding_provider=$1,embedding_model=$2,chunk_version='chunk-v1'",[info.provider,info.model]);await ready();
    const service=new SearchService({history:new PostgresSearchHistory(f.tenant),knowledge:f.knowledge,vectors:f.vectors,embedding:()=>embeddings,refreshIndexVersions:async()=>{},readiness:async scope=>(await new IndexStatusRepository(f.tenant).page(scope,{limit:1})).summary,provider:()=>provider,realAIRequired:()=>true,developmentControls:()=>false,rerankEnabled:()=>false,log:async()=>true});
    const input={query:"比较合成织叶方案甲与方案乙各自的通过线，分别引用双方。",mode:"ask" as const,workspaceId:workspace.id,documentIds:ids};
    if(!missingOnly) {
    const first=await service.execute(await service.prepare(userId,input),AbortSignal.timeout(240000),()=>{});
    const firstPassed=first.verification?.status==="verified"||first.verification?.status==="conflict";
    rows.push({case:"long-source-versus-short",passed:firstPassed&&first.coverage?.complete===true&&first.coverage.citedDocumentIds.length===2,result:first});
    // Stop on service failure; repeated connection attempts spend no useful budget.
    if(first.answerUnavailable)throw new Error("Live answer unavailable");
    await f.db.query("update filemind.documents set text_content=$2 where id=$1",[ids[1],missing]);
    await chunk(ids[1],0,missing,(await embeddings.embedDocuments([missing]))[0]);await ready();
    }
    const second=await service.execute(await service.prepare(userId,input),AbortSignal.timeout(240000),()=>{});
    rows.push({case:"missing-requested-fact",passed:second.coverage?.complete===false&&(second.answerState==="no_answer"||second.coverage.uncovered.some(d=>d.documentId===ids[1])),result:second});
  }catch{rows.push({case:"execution",passed:false,error:"Live verification unavailable; credentials suppressed."});}
  finally{
    await f.db.close();
    const passed=rows.length===2&&rows.every(row=>row.passed===true);
    await writeFile(reportPath,JSON.stringify({passed,checkedAt:new Date().toISOString(),limit,used,calls:[...retainedCalls,...calls],syntheticOnly:true,isolatedDatabase:"PGlite",rows},null,2));
    console.log(JSON.stringify({passed,limit,used,calls,rows:rows.map(row=>({case:row.case,passed:row.passed}))}));
    if(!passed)process.exitCode=1;
  }
}
void main().catch(()=>{console.error("Bounded live verification could not start; credentials suppressed.");process.exitCode=1;});
