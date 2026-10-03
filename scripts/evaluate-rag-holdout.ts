import {loadEnvConfig} from "@next/env";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {Pool} from "pg";
import mammoth from "mammoth";
import {holdoutDocuments,holdoutImages,holdoutQueries} from "../tests/fixtures/rag-holdout/corpus";
import {evaluationDatabase} from "./tenant-pool";
import {PostgresWorkspaceRepository} from "../src/lib/workspace/postgres-repository";
import {PostgresKnowledgeRepository} from "../src/lib/retrieval/postgres-knowledge";
import {PortableVectorStore} from "../src/lib/retrieval/portable-vector-store";
import {DashScopeEmbeddingProvider} from "../src/lib/retrieval/dashscope-provider";
import {type EmbeddingProvider,type EmbeddingResult} from "../src/lib/retrieval/embedding-provider";
import {contentHash} from "../src/lib/retrieval/chunker";
import {retrievalConfig} from "../src/lib/retrieval/config";
import {IndexingPipeline} from "../src/lib/retrieval/indexing";
import {rankFusion} from "../src/lib/retrieval/ranking";
import {RetrievalEngine} from "../src/lib/retrieval/engine";
import {KimiVisionProvider} from "../src/lib/multimodal/kimi-vision";
import {PortableOCRProvider} from "../src/lib/multimodal/portable-ocr";
import {MultimodalPipeline} from "../src/lib/multimodal/pipeline";
import {MultimodalRepository} from "../src/lib/multimodal/repository";
import {analysisQueue} from "../src/lib/ai/analysis-queue";
import {createKimiProvider} from "../src/lib/ai/providers/kimi-provider";
import {readModelConfig} from "../src/lib/ai/models";
import {generateGroundedAnswer} from "../src/lib/retrieval/rag";
import type {Evidence,ParsedStructure} from "../src/lib/retrieval/types";
const modes=["vector","lexical","alwaysHybrid","adaptive"] as const;
const sha=(s:Buffer|string)=>createHash("sha256").update(s).digest("hex");
function metrics(evidence:Evidence[],expected:string[]){
 const names=[...new Set(evidence.map(e=>e.documentName))];const rank=names.findIndex(n=>expected.includes(n))+1;
 const dcg=names.slice(0,10).reduce((s,n,i)=>s+(expected.includes(n)?1/Math.log2(i+2):0),0);
 const ideal=expected.slice(0,10).reduce((s,_,i)=>s+1/Math.log2(i+2),0);
 return{hitAt1:Number(rank===1),hitAt5:Number(rank>0&&rank<=5),mrr:rank>0?1/rank:0,recallAt10:names.slice(0,10).filter(n=>expected.includes(n)).length/expected.length,ndcgAt10:ideal?dcg/ideal:0};
}
type Metric=ReturnType<typeof metrics>;
function average(list:Metric[]){return Object.fromEntries(Object.keys(list[0]??{}).map(k=>[k,list.reduce((s,m)=>s+m[k as keyof Metric],0)/list.length]));}
async function main(){
 loadEnvConfig(process.cwd(),false,{info(){},error(){}});
 if(!process.argv.includes("--live"))throw new Error("Explicit --live required. Mock vectors cannot produce holdout semantic metrics.");
 const reportPath="docs/evaluation/rag-holdout-results.json";
 const previous=await readFile(reportPath,"utf8").then(JSON.parse,()=>null);
 if(previous?.completed)throw new Error("Final holdout already completed. Repeated quality-driven runs are prohibited.");
 const freeze=JSON.parse(await readFile("tests/fixtures/rag-holdout/freeze.json","utf8"));
 for(const [path,hash] of Object.entries(freeze.algorithm))if(sha((await readFile(path,"utf8")).replaceAll("\r\n","\n"))!==hash)throw new Error("Frozen algorithm changed before holdout evaluation.");
 if(sha((await readFile("tests/fixtures/rag-holdout/corpus.ts","utf8")).replaceAll("\r\n","\n"))!==freeze.corpusHash)throw new Error("Frozen corpus changed.");
 for(const [name,hash] of Object.entries(freeze.files))if(sha(await readFile(`tests/fixtures/rag-holdout/files/${name}`))!==hash)throw new Error("Frozen fixture changed.");
 await mkdir(".filemind/evaluation",{recursive:true});
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000});
 const {db,closeLeases}=evaluationDatabase(pool,process.env.DATABASE_URL);
 const owner=randomUUID();const scope={userId:owner};const workspaces:string[]=[];
 const repo=new PostgresWorkspaceRepository(db),knowledge=new PostgresKnowledgeRepository(db),vectors=new PortableVectorStore(db),mm=new MultimodalRepository(db);
 const real=new DashScopeEmbeddingProvider({apiKey:process.env.EMBEDDING_API_KEY||process.env.DASHSCOPE_API_KEY||"",baseURL:process.env.EMBEDDING_BASE_URL||"",model:process.env.EMBEDDING_MODEL||"",dimensions:Number(process.env.EMBEDDING_DIMENSIONS||1024)});
 const cachePath=".filemind/evaluation/holdout-embeddings.json";const cache:Record<string,EmbeddingResult>=await readFile(cachePath,"utf8").then(JSON.parse,()=>({}));
 const cacheKey=(t:string,k:string)=>contentHash(JSON.stringify([real.getModelInfo(),k,t]));
 const provider:EmbeddingProvider={getModelInfo:()=>real.getModelInfo(),async embedQuery(t){const key=cacheKey(t,"query");if(!cache[key]){cache[key]=await real.embedQuery(t);await writeFile(cachePath,JSON.stringify(cache));}return cache[key];},async embedDocuments(texts){const missing=[...new Set(texts.filter(t=>!cache[cacheKey(t,"document")]))];for(let i=0;i<missing.length;i+=10){const batch=missing.slice(i,i+10),items=await real.embedDocuments(batch);batch.forEach((t,j)=>{cache[cacheKey(t,"document")]=items[j];});}await writeFile(cachePath,JSON.stringify(cache));return texts.map(t=>cache[cacheKey(t,"document")]);}};
 const report:Record<string,unknown>={completed:false,live:true,checkedAt:new Date().toISOString(),freeze,sample:{documents:50,images:8,queries:100,answerable:92,noAnswer:8},queryDistribution:Object.fromEntries([...new Set(holdoutQueries.map(q=>q.kind))].map(k=>[k,holdoutQueries.filter(q=>q.kind===k).length])),embedding:real.getModelInfo(),configuration:retrievalConfig};
 try{
  const pipeline=new MultimodalPipeline(new KimiVisionProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL}),new PortableOCRProvider(),process.env);
  const imageCachePath=".filemind/evaluation/holdout-images.json";const imageCache=await readFile(imageCachePath,"utf8").then(JSON.parse,()=>({}));
  const images=await analysisQueue([...holdoutImages],async([name])=>{const bytes=await readFile(`tests/fixtures/rag-holdout/files/${name}`);const result=await pipeline.analyze(randomUUID(),{bytes,filename:name,mimeType:"image/png"},sha(bytes),AbortSignal.timeout(90000),imageCache[name]??null);if(!result.analysis.vision||!result.analysis.ocr)throw new Error("Live image analysis failed");imageCache[name]=result.analysis;console.log(`Vision + OCR: ${name}`);return{name,type:"image" as const,text:result.text,structure:result.structure,analysis:result.analysis,bytes};},new AbortController().signal,2);
  await writeFile(imageCachePath,JSON.stringify(imageCache));
  const sources=[];
  for(const d of holdoutDocuments){const bytes=await readFile(`tests/fixtures/rag-holdout/files/${d.name}`);const type=d.name.split(".").pop() as "txt"|"md"|"docx"|"pdf";let text=bytes.toString("utf8");let structure:ParsedStructure|undefined;
   if(type==="docx"){text=(await mammoth.extractRawText({buffer:bytes})).value;structure={paragraphs:[{index:1,charStart:0,charEnd:text.length}]};}
   if(type==="pdf"){const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true});try{const pdf=await task.promise;const page=await pdf.getPage(1);text=(await page.getTextContent()).items.map(v=>"str" in v?v.str+" ":"").join("");structure={pages:[{page:1,charStart:0,charEnd:text.length}]};}finally{await task.destroy();}}
   if(!text.includes(d.title))throw new Error("Fixture parsing failed");sources.push({name:d.name,type,text,structure,bytes});
  }
  const all=[...sources,...images];
  for(let offset=0;offset<all.length;offset+=25){const w=await repo.create(owner,`Phase 7 frozen holdout ${offset/25+1}`);workspaces.push(w.id);const batch=all.slice(offset,offset+25);const documents=batch.map(s=>({id:randomUUID(),name:s.name,type:s.type,mimeType:s.type==="image"?"image/png":s.type==="pdf"?"application/pdf":s.type==="docx"?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"text/plain",size:s.bytes.length,contentHash:sha(s.bytes),parseStatus:"completed" as const,metadata:{addedAt:new Date().toISOString(),structure:s.structure}}));await repo.save(owner,{...w,documents,texts:Object.fromEntries(documents.map((d,i)=>[d.id,batch[i].text]))});for(let i=0;i<batch.length;i++){const s=batch[i];if("analysis" in s)await mm.save({userId:owner,workspaceId:w.id},{...s.analysis,documentId:documents[i].id});}}
  const indexed=await new IndexingPipeline(knowledge,vectors,provider).indexLibrary(scope);if(indexed.some(r=>r.status!=="ready"))throw new Error("Atomic benchmark index failed");
  const chunkCount=indexed.reduce((n,r)=>n+("chunks" in r?r.chunks:0),0);report.chunks=chunkCount;console.log(`Indexed ${all.length} original files, ${chunkCount} chunks with real embeddings.`);
  const engine=new RetrievalEngine(provider,vectors,knowledge,null);const kimi=createKimiProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL,models:readModelConfig(process.env)});
  const rows:(typeof holdoutQueries[number]&{scores:Record<string,Metric>|null;route:unknown;profile:unknown;top10:Record<string,string[]>})[]=[];const answers:Record<string,{correctNoAnswer:number;noAnswerAttempts:number;validCitations:number;returnedCitations:number;answerAttempts:number;unavailable:number;imageAnswers:number;imageAttempts:number;results:unknown[]}>=Object.fromEntries(modes.map(m=>[m,{correctNoAnswer:0,noAnswerAttempts:0,validCitations:0,returnedCitations:0,answerAttempts:0,unavailable:0,imageAnswers:0,imageAttempts:0,results:[]} ]));const routes:Record<string,number>={};
  for(let i=0;i<holdoutQueries.length;i++){const q=holdoutQueries[i];const vector=(await vectors.searchSimilar(scope,await provider.embedQuery(q.query),20)).map(e=>({...e,semanticScore:e.score,retrievalSource:"semantic" as const}));const lexical=(await knowledge.lexicalSearch(scope,q.query)).map(e=>({...e,retrievalSource:"lexical" as const}));const adaptive=await engine.retrieve(scope,q.query);routes[adaptive.route.strategy]=(routes[adaptive.route.strategy]??0)+1;const lists={vector,lexical,alwaysHybrid:rankFusion(vector,lexical),adaptive:adaptive.fused};
   rows.push({...q,route:adaptive.route,profile:adaptive.profile,scores:q.expected.length?Object.fromEntries(modes.map(m=>[m,metrics(lists[m],q.expected)])):null,top10:Object.fromEntries(modes.map(m=>[m,[...new Set(lists[m].map(e=>e.documentName))].slice(0,10)]))});
   if(!q.expected.length||q.imageOnly){for(const mode of modes){const selected=lists[mode].slice(0,15).filter(e=>(e.semanticScore??0)>=retrievalConfig.minimumCosine||(e.lexicalCoverage??0)>=retrievalConfig.minimumLexicalCoverage).slice(0,7);const answer=await generateGroundedAnswer(q.query,selected,scope,kimi,knowledge.getSource.bind(knowledge),AbortSignal.timeout(90000));const count=answers[mode];count.answerAttempts++;if(answer.unavailable)count.unavailable++;const citations=answer.answer?.citations.length??0;count.returnedCitations+=citations;if(!answer.unavailable)count.validCitations+=citations;let passed:boolean;if(!q.expected.length){count.noAnswerAttempts++;passed=answer.answer?.insufficientEvidence===true&&!answer.unavailable;if(passed)count.correctNoAnswer++;}else{count.imageAttempts++;passed=!!answer.answer&&!answer.answer.insufficientEvidence&&answer.answer.citations.some(c=>selected.some(e=>e.id===c.chunkId&&q.expected.includes(e.documentName)));if(passed)count.imageAnswers++;}count.results.push({id:q.id,passed,refused:answer.answer?.insufficientEvidence??null,citations,errorCode:answer.errorCode??null,assessment:answer.assessment??null});}}
   if((i+1)%10===0)console.log(`Holdout ${i+1}/100 complete.`);
  }
  const answerable=rows.filter(r=>r.scores);report.metrics=Object.fromEntries(modes.map(m=>[m,{...average(answerable.map(r=>r.scores![m])),noAnswerAccuracy:answers[m].correctNoAnswer/answers[m].noAnswerAttempts,multimodalHitAt5:average(answerable.filter(r=>r.imageOnly).map(r=>r.scores![m])).hitAt5,citationValidity:answers[m].returnedCitations?answers[m].validCitations/answers[m].returnedCitations:null}]));
  report.byType=Object.fromEntries([...new Set(rows.map(r=>r.kind))].map(k=>{const group=rows.filter(r=>r.kind===k);return[k,{count:group.length,metrics:Object.fromEntries(modes.map(m=>[m,average(group.filter(r=>r.scores).map(r=>r.scores![m]))]))}];}));report.routeDistribution=Object.fromEntries(Object.entries(routes).map(([route,count])=>[route,{count,share:count/rows.length}]));report.answerVerification=answers;report.queries=rows;report.completed=true;
 }catch(error){report.error=error instanceof Error?error.message.replace(/https?:\/\/\S+/g,"[endpoint]"):"Evaluation failed";process.exitCode=1;}
 finally{for(const id of workspaces)await db.query(owner,"delete from filemind.workspaces where user_id=$1 and id=$2",[owner,id]);await db.query(owner,"delete from filemind.profiles where id=$1",[owner]);await closeLeases();await pool.end();await writeFile(reportPath,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({completed:report.completed,metrics:report.metrics,routeDistribution:report.routeDistribution,error:report.error},null,2));}
}
void main().catch(()=>{console.error("Holdout prerequisites or infrastructure failed; raw connection details suppressed.");process.exitCode=1;});
