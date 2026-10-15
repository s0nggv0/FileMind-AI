import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { readFile,writeFile,open } from "node:fs/promises";
import { join,resolve,relative } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { evaluationDatabase } from "../shared/tenant-pool";
import { PostgresWorkspaceRepository } from "../../src/lib/workspace/postgres-repository";
import { PortableVectorStore } from "../../src/lib/retrieval/portable-vector-store";
import { CHUNK_VERSION } from "../../src/lib/retrieval/config";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../../src/lib/ai/models";
import { LLMAgentRunner } from "../../src/lib/ai/agent-runner";
import { KimiVisionProvider } from "../../src/lib/multimodal/kimi-vision";
import { PortableOCRProvider } from "../../src/lib/multimodal/portable-ocr";
import { MultimodalPipeline } from "../../src/lib/multimodal/pipeline";
import { percentiles } from "../evaluation/blind-protocol";
import type { AgentRun } from "../../src/types/workspace";
import type { PlannerMetrics } from "../../src/lib/ai/planner-metrics";
const project=resolve(fileURLToPath(new URL("../..",import.meta.url)));
async function main(){
  const root=resolve(process.env.FILEMIND_TEST_ROOT||""),rel=relative(join(project,"artifacts"),root);assert.match(rel,/^phase8-fresh-[\w-]+$/);loadEnvConfig(root,false,{info(){},error(){}});
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2}),{db,closeLeases}=evaluationDatabase(pool,process.env.DATABASE_URL),owner=randomUUID(),repo=new PostgresWorkspaceRepository(db),vectors=new PortableVectorStore(db);
  const ledger=await open(join(project,"docs/evaluation/phase8-performance.jsonl"),"a"),runId=randomUUID();
  const append=async(value:unknown)=>{await ledger.writeFile(JSON.stringify({runId,value})+"\n");await ledger.sync();};
  const rows:unknown[]=[],report:{[k:string]:unknown}={checkedAt:new Date().toISOString(),syntheticCapacityVectors:true,dimensions:1024,repetitionsPerScale:20,providerWorkload:"real configured Kimi; repeated synthetic demo inputs, no quality claim",completed:false};
  try {
    await append({type:"start",...report});
    const workspace=await repo.create(owner,"Synthetic vector capacity"),id=randomUUID(),document={id,name:"capacity.txt",type:"txt" as const,mimeType:"text/plain",size:40,parseStatus:"completed" as const,metadata:{addedAt:new Date().toISOString()}};
    await repo.save(owner,{...workspace,documents:[document],texts:{[id]:"Synthetic capacity fixture, not semantic evidence."}});
    await db.query(owner,"update filemind.documents set index_status='ready',chunk_version=$3,embedding_provider='synthetic',embedding_model='capacity-1024' where user_id=$1 and id=$2",[owner,id,CHUNK_VERSION]);
    const vector=(seed:number)=>Array.from({length:1024},(_,i)=>((i*17+seed*13)%19-9)/9),query={provider:"synthetic",model:"capacity-1024",dimensions:1024,mock:true,vector:vector(11)};
    let count=0;
    for(const target of [100,500,1000,2000,5000]){
      while(count<target){const batch=Array.from({length:Math.min(100,target-count)},(_,i)=>({id:randomUUID(),position:count+i,content:`Capacity record ${count+i}`,embedding:vector(count+i)}));
        await db.transaction(owner,async tx=>{
          await tx.query("insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version,lexical_tokens,heading_path) select (v->>'id')::uuid,$1,$2,$3,(v->>'position')::integer,v->>'content',repeat('a',64),0,40,10,$4,array['capacity'],array[]::text[] from jsonb_array_elements($5::jsonb) v",[owner,workspace.id,id,CHUNK_VERSION,JSON.stringify(batch)]);
          await tx.query("insert into filemind.chunk_embeddings(user_id,workspace_id,document_id,chunk_id,provider,model,dimensions,embedding,embedding_hash,chunk_version) select $1,$2,$3,(v->>'id')::uuid,'synthetic','capacity-1024',1024,array(select jsonb_array_elements_text(v->'embedding')::real),repeat('b',64),$4 from jsonb_array_elements($5::jsonb) v",[owner,workspace.id,id,CHUNK_VERSION,JSON.stringify(batch)]);
        });count+=batch.length;
      }
      const actual=await db.query(owner,"select count(*)::int as n from filemind.chunk_embeddings where user_id=$1",[owner]);assert.equal((actual.rows[0] as {n:number}).n,target);
      const timings:number[]=[],rss:number[]=[],heap:number[]=[];
      for(let i=0;i<20;i++){const start=performance.now(),found=await vectors.searchSimilar({userId:owner},query,20);timings.push(performance.now()-start);assert.equal(found.length,20);const memory=process.memoryUsage();rss.push(memory.rss);heap.push(memory.heapUsed);}
      rows.push({chunks:target,latencyMs:percentiles(timings),rssBytes:{min:Math.min(...rss),max:Math.max(...rss)},heapUsedBytes:{min:Math.min(...heap),max:Math.max(...heap)},pageSize:200,rawTimingsMs:timings});await append({type:"capacity",row:rows.at(-1)});console.log(`Actual SQL capacity: ${target} chunks, 20 full scans.`);
    }
    report.vectorCapacity=rows;
    const provider=createKimiProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL,models:readModelConfig(process.env)}),agentRows:{durationMs:number;status:string;metrics?:PlannerMetrics}[]=[];
    const fixture=await readFile(join(root,"tests/fixtures/demo/files/database-notes.txt"),"utf8");
    for(let i=0;i<20;i++){const docId=randomUUID(),start=performance.now();let final:AgentRun|undefined;try{await new LLMAgentRunner(provider).execute({id:randomUUID(),name:"Synthetic agent latency",revision:0,documents:[{id:docId,name:`demo-database-${i+1}.txt`,type:"txt",mimeType:"text/plain",size:Buffer.byteLength(fixture),parseStatus:"completed",metadata:{addedAt:new Date().toISOString()}}],texts:{[docId]:fixture},run:null,proposal:null,updatedAt:new Date().toISOString()},randomUUID(),async run=>{final=run;},AbortSignal.timeout(180000));agentRows.push({durationMs:performance.now()-start,status:final?.status??"unknown",metrics:final?.plannerMetrics});}catch{agentRows.push({durationMs:performance.now()-start,status:"unavailable",metrics:final?.plannerMetrics});}await append({type:"agent",row:agentRows.at(-1)});console.log(`Workspace Agent latency ${i+1}/20 (${agentRows.at(-1)!.status}).`);}
    report.workspaceAgent={latencyMs:percentiles(agentRows.map(r=>r.durationMs)),rows:agentRows};
    const pipeline=new MultimodalPipeline(new KimiVisionProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL}),new PortableOCRProvider(),process.env),imageRows=[];
    for(let i=0;i<20;i++){const name=i%2?"linear-algebra-whiteboard.jpg":"transformer-slide.png",bytes=await readFile(join(root,"tests/fixtures/demo/files",name)),start=performance.now();const result=await pipeline.analyze(randomUUID(),{bytes,filename:name,mimeType:i%2?"image/jpeg":"image/png"},"synthetic-performance-only",AbortSignal.timeout(120000));imageRows.push({name,durationMs:performance.now()-start,visionStatus:result.analysis.visionStatus,ocrStatus:result.analysis.ocrStatus});await append({type:"image",row:imageRows.at(-1)});console.log(`Uncached image analysis ${i+1}/20.`);}
    report.imageAnalysis={latencyMs:percentiles(imageRows.map(r=>r.durationMs)),rows:imageRows};report.completed=true;
  }catch{report.errorCode="PERFORMANCE_DRILL_INTERRUPTED";process.exitCode=1;}
  finally{await append({type:"finish",...report});await ledger.close();await writeFile(join(project,"docs/evaluation/phase8-performance.json"),JSON.stringify(report,null,2)+"\n");await closeLeases();await pool.end();}
}
void main().catch(()=>{console.error("Isolated performance prerequisites failed.");process.exitCode=1;});
