import assert from "node:assert/strict";
import { mkdtemp,readFile,writeFile,rm } from "node:fs/promises";
import { join,relative,isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { Client } from "pg";
import sharp from "sharp";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { AIError } from "../../src/lib/ai/errors";
import { DashScopeEmbeddingProvider } from "../../src/lib/retrieval/dashscope-provider";
import { KimiVisionProvider } from "../../src/lib/multimodal/kimi-vision";
import { PortableOCRProvider } from "../../src/lib/multimodal/portable-ocr";
import { MultimodalPipeline } from "../../src/lib/multimodal/pipeline";
import { ImageAnalysisSchema } from "../../src/lib/multimodal/schemas";
import type { VisionProvider } from "../../src/lib/multimodal/provider";
import { generateGroundedAnswer } from "../../src/lib/retrieval/rag";
import { RetrievalEngine } from "../../src/lib/retrieval/engine";
import type { Evidence } from "../../src/lib/retrieval/types";
import type { VectorStore } from "../../src/lib/retrieval/vector-store";
import { atomicWriteFile } from "../../src/lib/reliability/atomic-file";
import { registerFile,parseDocument,releaseDocument } from "../../src/features/workspace/services/file-parser";

type Row={fault:string;mode:string;passed:boolean;durationMs:number;outcome:string;errorCode?:string};
const rows:Row[]=[],signal=()=>new AbortController().signal;
async function check(fault:string,mode:string,work:()=>Promise<string>) {
  const started=performance.now();try{rows.push({fault,mode,passed:true,durationMs:performance.now()-started,outcome:await work()});rows.at(-1)!.durationMs=performance.now()-started;}
  catch(error){rows.push({fault,mode,passed:false,durationMs:performance.now()-started,outcome:"Acceptance failed",errorCode:error instanceof AIError?error.code:"CHECK_FAILED"});process.exitCode=1;}
  console.log(`${fault}: ${rows.at(-1)!.passed?"PASS":"FAIL"}`);
}
const unavailable:typeof fetch=async()=>Response.json({error:{message:"Synthetic unavailable"}},{status:503});
const timeout:typeof fetch=async()=>{throw new DOMException("Synthetic transport timeout","TimeoutError");};
const invalid:typeof fetch=async()=>Response.json({id:"fixture",object:"chat.completion",created:1,model:"kimi-k2.6",choices:[{index:0,finish_reason:"stop",message:{role:"assistant",content:'{"incorrect":true}'}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
const models={main:"kimi-k2.6",small:"kimi-k2.6"};
const kimi=(transport:typeof fetch)=>createKimiProvider({apiKey:"synthetic-key-no-network",models,fetch:transport});
const embedding=(transport:typeof fetch)=>new DashScopeEmbeddingProvider({apiKey:"synthetic-key-no-network",baseURL:"https://dashscope.aliyuncs.com/compatible-mode/v1",model:"qwen3.7-text-embedding-flash",dimensions:1024,fetch:transport});
const userId=crypto.randomUUID(),workspaceId=crypto.randomUUID();
const source:Evidence={id:crypto.randomUUID(),userId,workspaceId,documentId:crypto.randomUUID(),chunkIndex:0,content:"Audit retention is 6 hours.",contentHash:"fixture",chunkVersion:"chunk-v1",tokenEstimate:10,pageStart:null,pageEnd:null,lineStart:1,lineEnd:1,paragraphStart:null,paragraphEnd:null,headingPath:[],charStart:0,charEnd:26,documentName:"synthetic.txt",fileType:"txt",summary:"",tags:[],score:0.9,lexicalCoverage:1};
async function main() {
for(const [fault,transport] of [["Kimi unavailable",unavailable],["Kimi timeout",timeout],["Kimi invalid response",invalid]] as const)await check(fault,"Injected transport through production Kimi SDK adapter",async()=>{
  const result=await generateGroundedAnswer("retention?",[source],{userId},kimi(transport),async()=>source,signal());
  assert.equal(result.unavailable,true);assert.equal(result.answer,null);assert.equal(result.sources.length,1);assert.ok(result.errorCode);return `Answer unavailable (${result.errorCode}); sources retained`;
});
for(const [fault,transport] of [["DashScope unavailable",unavailable],["DashScope timeout",timeout]] as const)await check(fault,"Injected transport through production DashScope adapter",async()=>{
  const vector={searchSimilar:async()=>{throw new Error("No query embedding may reach vectors");}} as unknown as VectorStore;
  const result=await new RetrievalEngine(embedding(transport),vector,{lexicalSearch:async()=>[source]}).retrieve({userId},"How long are temporary audit records retained?");
  assert.equal(result.semanticUnavailable,true);assert.equal(result.evidence[0].id,source.id);return "Lexical fallback returned stored evidence";
});
const bytes=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="220"><rect width="1000" height="220" fill="white"/><text x="40" y="85" font-family="Arial" font-size="42" fill="black">Audit retention: 6 hours</text><text x="40" y="155" font-family="Arial" font-size="32" fill="black">Synthetic acceptance fixture</text></svg>')).png().toBuffer();
const image={bytes,mimeType:"image/png" as const,filename:"synthetic-retention.png"};
const downVision=new KimiVisionProvider({apiKey:"synthetic-key-no-network",fetch:unavailable});
await check("Vision unavailable","Injected Kimi Vision transport + actual bundled Tesseract worker",async()=>{
  const result=await new MultimodalPipeline(downVision,new PortableOCRProvider()).analyze(crypto.randomUUID(),image,"fixture",signal());
  assert.equal(result.analysis.visionStatus,"failed");assert.equal(result.analysis.ocrStatus,"ready");assert.match(result.text,/retention.*6 hours/i);return "OCR-only searchable text retained";
});
const ocrFailure=new PortableOCRProvider(async()=>{throw new Error("Synthetic worker startup failure");});
const fixtureVision:VisionProvider={getModelInfo:()=>({provider:"fixture",model:"fixture",promptVersion:"fixture-v1"}),analyzeImage:async()=>({analysis:ImageAnalysisSchema.parse({imageType:"diagram",summary:"A synthetic retention note states audit retention is 6 hours.",topics:["Retention"],visibleConcepts:["Audit"],tags:["audit"],suggestedCategory:"Database",confidence:0.9})}),extractSemanticContent:async()=>{throw new Error("unused");}};
await check("OCR worker failure","Injected worker initialization failure + labelled Vision fixture",async()=>{
  const result=await new MultimodalPipeline(fixtureVision,ocrFailure).analyze(crypto.randomUUID(),image,"fixture",signal());
  assert.equal(result.analysis.ocrStatus,"failed");assert.equal(result.analysis.visionStatus,"ready");assert.match(result.text,/AI interpretation/);assert.doesNotMatch(result.text,/extracted text/);return "Vision-only content retained with AI interpretation label";
});
await check("Vision and OCR unavailable","Both production providers have injected failures",async()=>{
  const result=await new MultimodalPipeline(downVision,ocrFailure).analyze(crypto.randomUUID(),image,"fixture",signal());
  assert.equal(result.text,"");assert.equal(result.analysis.ocrStatus,"failed");assert.equal(result.analysis.visionStatus,"failed");return "Image retained with no content-search claim";
});
const root=await mkdtemp(join(tmpdir(),"filemind-failure-matrix-"));
try{
  for(const [fault,code] of [["Storage read-only","EACCES"],["Disk full","ENOSPC"]])await check(fault,`Simulated ${code} at atomic publication barrier`,async()=>{
    const file=join(root,`${code}.txt`);await atomicWriteFile(file,Buffer.from("complete old bytes"));
    await assert.rejects(atomicWriteFile(file,Buffer.from("replacement"),{checkpoint:async stage=>{if(stage==="before_publish")throw Object.assign(new Error("Synthetic storage fault"),{code});}}));
    assert.equal(await readFile(file,"utf8"),"complete old bytes");return "Failure surfaced; complete previous bytes preserved";
  });
  await check("Corrupt document","Actual Mammoth parser with invalid synthetic DOCX bytes",async()=>{
    const doc=registerFile(new File([Buffer.from("PK corrupt synthetic archive")],"corrupt.docx",{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
    try{await assert.rejects(parseDocument(doc,signal()));return "Corrupt document rejected before extracted content publication";}finally{releaseDocument(doc.id);}
  });
  await check("PostgreSQL unavailable","Actual refused loopback connection, no existing database touched",async()=>{
    const socket=createServer();await new Promise<void>(ready=>socket.listen(0,"127.0.0.1",ready));const port=(socket.address() as {port:number}).port;await new Promise<void>(done=>socket.close(()=>done()));
    const client=new Client({host:"127.0.0.1",port,user:"synthetic",password:"synthetic",database:"synthetic",connectionTimeoutMillis:1000});try{await assert.rejects(client.connect());}finally{await client.end().catch(()=>{});}return "Database connection failed explicitly";
  });
}finally{const rel=relative(tmpdir(),root);assert.ok(rel&&!rel.startsWith("..")&&!isAbsolute(rel));await rm(root,{recursive:true,force:true});}
await writeFile("docs/evaluation/phase8-provider-failures.json",JSON.stringify({checkedAt:new Date().toISOString(),passed:rows.every(r=>r.passed),externalCalls:0,faults:rows,notes:["Fault injection is labelled; these are not live remote outages, hard power loss or an actual full disk.","UI failure acceptance is recorded separately in browser results.","Successful real Kimi/DashScope calls are recorded separately in phase8-rag-live-browser.json."]},null,2)+"\n");
}
void main().catch(()=>{console.error("Provider failure acceptance interrupted.");process.exitCode=1;});
