import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { open,readFile,writeFile,mkdir } from "node:fs/promises";
import { createHash,randomUUID } from "node:crypto";
import { join,resolve,relative,isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import mammoth from "mammoth";
import { z } from "zod";
import { evaluationDatabase } from "./tenant-pool";
import { PostgresWorkspaceRepository } from "../src/lib/workspace/postgres-repository";
import { RecoveryService } from "../src/lib/reliability/recovery";
import { WorkspaceOperations } from "../src/lib/reliability/workspace-operations";
import { PostgresKnowledgeRepository } from "../src/lib/retrieval/postgres-knowledge";
import { PortableVectorStore } from "../src/lib/retrieval/portable-vector-store";
import { DashScopeEmbeddingProvider } from "../src/lib/retrieval/dashscope-provider";
import { IndexingPipeline } from "../src/lib/retrieval/indexing";
import { RetrievalEngine } from "../src/lib/retrieval/engine";
import { rankFusion,DeterministicReranker } from "../src/lib/retrieval/ranking";
import { retrievalConfig,indexingConfig } from "../src/lib/retrieval/config";
import { KimiVisionProvider } from "../src/lib/multimodal/kimi-vision";
import { PortableOCRProvider } from "../src/lib/multimodal/portable-ocr";
import { MultimodalPipeline } from "../src/lib/multimodal/pipeline";
import { MultimodalRepository } from "../src/lib/multimodal/repository";
import type { MultimodalAnalysis } from "../src/lib/multimodal/schemas";
import { createKimiProvider } from "../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../src/lib/ai/models";
import { generateGroundedAnswer,validateCitations } from "../src/lib/retrieval/rag";
import type { ParsedStructure } from "../src/lib/retrieval/types";
import { BLIND_PROTOCOL_VERSION,GOLD_JUDGE_VERSION,goldJudgePrompt,retrievalMetrics,averageMetrics,answerOutcome,percentiles } from "./blind-protocol";

const project=resolve(fileURLToPath(new URL("..",import.meta.url))),fixtures=join(project,"tests/fixtures/rag-blind"),reports=join(project,"docs/evaluation");
const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex"),textHash=(bytes:Buffer)=>sha(bytes.toString().replaceAll("\r\n","\n"));
const DocumentSchema=z.object({name:z.string().regex(/^[a-z0-9-]+\.(pdf|docx|md|txt|png|jpg)$/),sha256:z.string(),group:z.enum(["text","image","tricky"])});
const QuerySchema=z.object({id:z.string(),query:z.string().max(1500),kind:z.string(),expected:z.array(z.string()),facts:z.array(z.string()),answerability:z.enum(["answerable","no-answer","conflict","ambiguous"]),imageOnly:z.boolean().optional(),parent:z.string().optional(),goldRelation:z.enum(["disagreement","supersession"]).optional()});
const JudgeSchema=z.object({correct:z.boolean(),conflictDisclosed:z.boolean(),clarification:z.boolean(),factMatches:z.array(z.boolean())}).strict();
async function main(){
  assert.ok(process.argv.includes("--live"),"Explicit --live required");
  const root=resolve(process.env.FILEMIND_TEST_ROOT||""),rel=relative(join(project,"artifacts"),root);assert.ok(rel&&!isAbsolute(rel)&&/^phase8-fresh-[\w-]+$/.test(rel));
  loadEnvConfig(root,false,{info(){},error(){}});assert.equal(process.env.AI_ENGINE,"llm");process.env.FILE_STORAGE_ROOT=join(root,".filemind/storage");
  const freeze=JSON.parse(await readFile(join(fixtures,"freeze.json"),"utf8")),algorithm=JSON.parse(await readFile(join(reports,"phase8-algorithm-freeze.json"),"utf8"));
  assert.equal(freeze.algorithmFreezeHash,textHash(await readFile(join(reports,"phase8-algorithm-freeze.json"))));
  for(const [path,hash] of Object.entries(algorithm.files))assert.equal(textHash(await readFile(join(project,path))),hash,`Frozen source changed: ${path}`);
  const manifestBytes=await readFile(join(fixtures,"manifest.json")),queryBytes=await readFile(join(fixtures,"queries.json"));assert.equal(sha(manifestBytes),freeze.manifestHash);assert.equal(sha(queryBytes),freeze.queryHash);
  const documents=z.array(DocumentSchema).parse(JSON.parse(manifestBytes.toString()).documents),queries=z.array(QuerySchema).parse(JSON.parse(queryBytes.toString()));assert.equal(documents.length,90);assert.equal(queries.length,180);assert.ok(queries.filter(q=>q.answerability==="no-answer").length>=36);
  assert.equal(new Set(documents.map(d=>d.name)).size,90);assert.equal(new Set(queries.map(q=>q.id)).size,180);assert.equal(documents.filter(d=>d.group==="image").length,18);assert.equal(documents.filter(d=>d.group==="tricky").length,9);
  const names=new Set(documents.map(d=>d.name));for(const q of queries){assert.ok(q.expected.every(name=>names.has(name)));if(q.answerability==="no-answer")assert.equal(q.expected.length,0);if(q.answerability==="conflict")assert.ok(q.expected.length>=2);}
  for(const d of documents)assert.equal(sha(await readFile(join(fixtures,"files",d.name))),d.sha256);
  await mkdir(reports,{recursive:true});
  // Exclusive creation reserves Run #1. Any restart must use a separate number,
  // preserving this complete/partial first run rather than overwriting it.
  const ledger=await open(join(reports,"rag-blind-run1.jsonl"),"wx");
  const append=async(row:unknown)=>{await ledger.writeFile(JSON.stringify(row)+"\n");await ledger.sync();};
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000}),{db,closeLeases}=evaluationDatabase(pool,process.env.DATABASE_URL);
  const owner=randomUUID(),scope={userId:owner},repo=new PostgresWorkspaceRepository(db),knowledge=new PostgresKnowledgeRepository(db),vectors=new PortableVectorStore(db),mm=new MultimodalRepository(db),recovery=new RecoveryService(db,process.env.FILE_STORAGE_ROOT),operations=new WorkspaceOperations(recovery);
  const embeddings=new DashScopeEmbeddingProvider({apiKey:process.env.EMBEDDING_API_KEY||process.env.DASHSCOPE_API_KEY||"",baseURL:process.env.EMBEDDING_BASE_URL||"",model:process.env.EMBEDDING_MODEL||"",dimensions:Number(process.env.EMBEDDING_DIMENSIONS||1024)}),kimi=createKimiProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL,models:readModelConfig(process.env)});
  const pipeline=new MultimodalPipeline(new KimiVisionProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL}),new PortableOCRProvider(),process.env);
  const config=indexingConfig(process.env),engine=new RetrievalEngine(embeddings,vectors,knowledge,config.rerankEnabled?new DeterministicReranker():null);
  const report:{[k:string]:unknown}={run:1,completed:false,live:true,startedAt:new Date().toISOString(),protocol:BLIND_PROTOCOL_VERSION,goldJudge:{model:kimi.models.main,prompt:GOLD_JUDGE_VERSION,promptHash:sha(goldJudgePrompt),automated:true},sample:{documents:documents.length,images:documents.filter(d=>d.group==="image").length,queries:queries.length},configuration:{retrievalConfig,...config},embedding:embeddings.getModelInfo(),freeze,algorithm};
  const inputs:{name:string;text:string;structure?:ParsedStructure;imageAnalysis?:unknown;latencyMs:number;parseError?:string}[]=[],rows:Record<string,unknown>[]=[],rewritten=new Map<string,string>();
  await append({type:"start",...report});
  try {
    // Parse each raw document once. Cached first-run image interpretations are
    // preserved as immutable inputs; no favourable interpretation is selected.
    for(const d of documents){
      const bytes=await readFile(join(fixtures,"files",d.name)),ext=d.name.split(".").at(-1)!,start=performance.now();let text="",structure:ParsedStructure|undefined,imageAnalysis:unknown,parseError:string|undefined;
      try {
        if(d.group==="image"){const result=await pipeline.analyze(randomUUID(),{bytes,filename:d.name,mimeType:ext==="jpg"?"image/jpeg":"image/png"},d.sha256,AbortSignal.timeout(120000));text=result.text;structure=result.structure;imageAnalysis=result.analysis;}
        else if(ext==="docx"){text=(await mammoth.extractRawText({buffer:bytes})).value;structure={paragraphs:[{index:1,charStart:0,charEnd:text.length}]};}
        else if(ext==="pdf"){const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs"),task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true});try{const pdf=await task.promise;structure={pages:[]};for(let page=1;page<=pdf.numPages;page++){const item=await pdf.getPage(page),start=text.length;const part=(await item.getTextContent()).items.map(v=>"str" in v?v.str:"").join(" ");text+=`${text?"\n":""}${part}`;structure.pages!.push({page,charStart:start,charEnd:text.length});}}finally{await task.destroy();}}
        else text=bytes.toString("utf8");
      }catch{parseError="PARSE_UNAVAILABLE";}
      const input={name:d.name,text,structure,imageAnalysis,latencyMs:performance.now()-start,parseError};inputs.push(input);await append({type:"document_input",...input});
      console.log(`Blind input ${inputs.length}/${documents.length} parsed${parseError?" with failure":""}.`);
    }
    await writeFile(join(reports,"rag-blind-run1-inputs.json"),JSON.stringify(inputs,null,2)+"\n",{flag:"wx"});
    for(let offset=0;offset<documents.length;offset+=25){let w=await repo.create(owner,`Frozen blind corpus ${offset/25+1}`);const batch=documents.slice(offset,offset+25),parsed=inputs.slice(offset,offset+25),docs=batch.map((d,i)=>({id:randomUUID(),name:d.name,type:(d.group==="image"?"image":d.name.split(".").at(-1)) as "image"|"pdf"|"docx"|"md"|"txt",mimeType:d.name.endsWith(".png")?"image/png":d.name.endsWith(".jpg")?"image/jpeg":d.name.endsWith(".pdf")?"application/pdf":d.name.endsWith(".docx")?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"text/plain",size:0,contentHash:d.sha256,parseStatus:parsed[i].parseError?"failed" as const:"completed" as const,metadata:{addedAt:new Date().toISOString(),structure:parsed[i].structure}}));
      for(let i=0;i<docs.length;i++)docs[i].size=(await readFile(join(fixtures,"files",batch[i].name))).length;
      w=await repo.save(owner,{...w,documents:docs,texts:Object.fromEntries(docs.map((doc,i)=>[doc.id,parsed[i].text]))});
      for(let i=0;i<docs.length;i++){w=await operations.upload(owner,w,docs[i].id,batch[i].name.split('.').at(-1)!,await readFile(join(fixtures,"files",batch[i].name)));if(parsed[i].imageAnalysis)await mm.save({userId:owner,workspaceId:w.id},{...parsed[i].imageAnalysis as MultimodalAnalysis,documentId:docs[i].id});}
    }
    const indexing=await new IndexingPipeline(knowledge,vectors,embeddings,process.env,{storageRoot:process.env.FILE_STORAGE_ROOT}).indexLibrary(scope);await append({type:"indexing",results:indexing});report.indexing=indexing;
    const modes=["vector","lexical","alwaysHybrid","adaptive"] as const;
    for(const q of queries){
      let query=q.query;if(q.parent&&rewritten.has(q.parent)&&/\b(it|that|those|these|there)\b|它|这|那/i.test(query))query=`${rewritten.get(q.parent)!.slice(-3000)}\nFollow-up: ${query}`;rewritten.set(q.id,query);
      const row:Record<string,unknown>={...q,rewrittenQuery:query};
      try {
        const vectorStart=performance.now(),vector=(await vectors.searchSimilar(scope,await embeddings.embedQuery(query),retrievalConfig.vectorTopK)).map(e=>({...e,semanticScore:e.score,retrievalSource:"semantic" as const}));row.vectorMs=performance.now()-vectorStart;
        const lexical=(await knowledge.lexicalSearch(scope,query)).map(e=>({...e,retrievalSource:"lexical" as const}));const adaptiveStart=performance.now(),adaptive=await engine.retrieve(scope,query);row.adaptiveMs=performance.now()-adaptiveStart;
        const lists={vector,lexical,alwaysHybrid:rankFusion(vector,lexical),adaptive:adaptive.fused};row.metrics=Object.fromEntries(modes.map(mode=>[mode,retrievalMetrics(lists[mode],q.expected)]));row.top10=Object.fromEntries(modes.map(mode=>[mode,[...new Set(lists[mode].map(e=>e.documentName))].slice(0,10)]));row.route=adaptive.route;row.latency=adaptive.latency;
        const ragStart=performance.now(),grounded=await generateGroundedAnswer(query,adaptive.evidence,scope,kimi,knowledge.getSource.bind(knowledge),AbortSignal.timeout(180000));row.ragMs=performance.now()-ragStart;row.grounded=grounded;
        let valid=0;for(const citation of grounded.answer?.citations??[])try{await validateCitations({...grounded.answer!,citations:[citation],answer:`Supported statement [${citation.sourceId}]`},grounded.sources,scope,knowledge.getSource.bind(knowledge));valid++;}catch{}
        row.citations={valid,returned:grounded.answer?.citations.length??0};
        let judge:z.infer<typeof JudgeSchema>|null=null;let judgeError=false;
        if(grounded.answer&&!grounded.answer.insufficientEvidence&&!grounded.unavailable){try{judge=JudgeSchema.parse((await kimi.generateObject({system:goldJudgePrompt,prompt:JSON.stringify({query:query,expectedFacts:q.facts,answerability:q.answerability,goldRelation:q.goldRelation??null,untrustedAnswer:grounded.answer.answer,untrustedRelevantDocuments:inputs.filter(d=>q.expected.includes(d.name)).map(d=>({name:d.name,text:d.text})),citedDocumentNames:grounded.answer.citations.map(c=>grounded.sources.find(s=>s.id===c.chunkId)?.documentName??null)}),schema:JudgeSchema,signal:AbortSignal.timeout(90000)})).object);if(judge.factMatches.length!==q.facts.length)throw new Error("INCOMPLETE_GOLD_COVERAGE");}catch{judge=null;judgeError=true;}}
        row.goldJudge=judge;row.goldJudgeUnavailable=judgeError;
        const referenced=[...new Set(grounded.answer?.citations.map(c=>grounded.sources.find(s=>s.id===c.chunkId)?.documentName)??[])],sourceSet=q.expected.every(name=>referenced.includes(name));
        const verified="verification" in grounded?grounded.verification:undefined;
        row.outcome=answerOutcome({expected:q.answerability,unavailable:grounded.unavailable,refused:grounded.answer?.insufficientEvidence??null,goldCorrect:judge?judge.correct&&judge.factMatches.every(Boolean)&&valid===grounded.answer?.citations.length:null,conflictDetected:!!judge?.conflictDisclosed&&!!verified?.conflicts.length&&sourceSet,clarification:!!judge?.clarification});
        row.sourceSetCovered=sourceSet;
      }catch{row.errorCode="EVALUATION_UNAVAILABLE";row.outcome="Unavailable";}
      rows.push(row);await append({type:"query",...row});console.log(`Blind query ${rows.length}/${queries.length}: ${row.outcome}.`);
    }
    const withMetrics=rows.filter(r=>r.metrics),answerable=rows.filter(r=>r.answerability==="answerable"||r.answerability==="conflict"),noAnswer=rows.filter(r=>r.answerability==="no-answer"),conflicts=rows.filter(r=>r.answerability==="conflict"),ambiguous=rows.filter(r=>r.answerability==="ambiguous");
    const metricRows=(group:Record<string,unknown>[],mode:string)=>group.filter(r=>(r.expected as string[]).length).map(r=>(r.metrics as Record<string,ReturnType<typeof retrievalMetrics>>|undefined)?.[mode]??{hitAt1:0,hitAt5:0,mrr:0,recallAt10:0,ndcgAt10:0});
    const groundedRows=rows.map(r=>r.grounded as Awaited<ReturnType<typeof generateGroundedAnswer>>|undefined),released=groundedRows.filter(g=>g?.answer&&!g.answer.insufficientEvidence&&!g.unavailable),claims=released.flatMap(g=>g&&"verification" in g&&g.verification?.accepted?g.verification.claims:[]);
    const citations=rows.map(r=>r.citations as {valid:number;returned:number}|undefined),citationCount=citations.reduce((s,c)=>s+(c?.returned??0),0);
    report.metrics={retrieval:Object.fromEntries(modes.map(mode=>[mode,averageMetrics(metricRows(rows,mode))])),retrievalEvaluated:withMetrics.length,retrievalFailures:rows.length-withMetrics.length,noAnswerAccuracy:noAnswer.filter(r=>r.outcome==="Correct Refusal").length/noAnswer.length,falseRefusalRate:answerable.filter(r=>r.outcome==="False Refusal").length/answerable.length,answerableRecall:answerable.filter(r=>r.outcome==="Correct Answer"||r.outcome==="Conflicting Evidence Correctly Detected").length/answerable.length,releasedAnswerCoverage:answerable.filter(r=>{const g=r.grounded as Awaited<ReturnType<typeof generateGroundedAnswer>>|undefined;return !!g?.answer&&!g.answer.insufficientEvidence&&!g.unavailable;}).length/answerable.length,multimodalHitAt5:averageMetrics(metricRows(rows.filter(r=>r.imageOnly),"adaptive"))?.hitAt5??null,citationValidity:citationCount?citations.reduce((s,c)=>s+(c?.valid??0),0)/citationCount:null,citationCount,citationCompleteness:claims.length?claims.filter(c=>c.cited&&c.numericSupport&&(c.status==="supported"||c.status==="conflicting")).length/claims.length:null,answerFaithfulness:claims.length?claims.filter(c=>c.numericSupport&&(c.status==="supported"||c.status==="conflicting")).length/claims.length:null,releasedAnswers:released.length,releasedClaims:claims.length,conflictDetection:{correct:conflicts.filter(r=>r.outcome==="Conflicting Evidence Correctly Detected").length,total:conflicts.length,releasedFalseConflicts:rows.filter(r=>{const g=r.grounded as Awaited<ReturnType<typeof generateGroundedAnswer>>|undefined;return r.answerability!=="conflict"&&g&&"verification" in g&&g.verification?.accepted&&g.verification.conflicts.length;}).length},ambiguousClarification:{correct:ambiguous.filter(r=>r.outcome==="Ambiguous Query Clarification").length,total:ambiguous.length},unavailable:rows.filter(r=>r.outcome==="Unavailable").length};
    report.matrix=Object.fromEntries(["answerable","no-answer","conflict","ambiguous"].map(expected=>[expected,Object.fromEntries(["Correct Answer","Correct Refusal","Incorrect Answer","False Refusal","Conflicting Evidence Correctly Detected","Ambiguous Query Clarification","Unavailable"].map(outcome=>[outcome,rows.filter(r=>r.answerability===expected&&r.outcome===outcome).length]))]));
    report.byType=Object.fromEntries([...new Set(queries.map(q=>q.kind))].map(kind=>[kind,{count:rows.filter(r=>r.kind===kind).length,adaptive:averageMetrics(metricRows(rows.filter(r=>r.kind===kind),"adaptive"))}]));
    report.latency={vectorRetrieval:percentiles(rows.flatMap(r=>typeof r.vectorMs==="number"?[r.vectorMs]:[])),adaptiveRetrieval:percentiles(rows.flatMap(r=>typeof r.adaptiveMs==="number"?[r.adaptiveMs]:[])),ragAnswer:percentiles(rows.flatMap(r=>typeof r.ragMs==="number"?[r.ragMs]:[])),imageAnalysis:percentiles(inputs.filter(i=>documents.find(d=>d.name===i.name)?.group==="image").map(i=>i.latencyMs))};
    report.completed=true;report.completedAt=new Date().toISOString();
  }catch{report.infrastructureError="BLIND_RUN_INTERRUPTED";process.exitCode=1;}
  finally{report.completedQueries=rows.length;await append({type:"finish",...report});await ledger.close();await writeFile(join(reports,"rag-blind-run1-results.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});await closeLeases();await pool.end();console.log(JSON.stringify({completed:report.completed,queries:rows.length,metrics:report.metrics,latency:report.latency},null,2));}
}
void main().catch(()=>{console.error("Blind prerequisites failed or Run #1 already exists. Existing first-run files are preserved.");process.exitCode=1;});
