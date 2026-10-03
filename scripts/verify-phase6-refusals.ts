import {loadEnvConfig} from '@next/env';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {hardTextDocuments,hardQueries} from '../tests/fixtures/rag-hard/corpus';
import {imageFixtures} from './generate-image-fixtures';
import {runTenantQuery} from '../src/lib/workspace/tenant-query';
import {PostgresWorkspaceRepository,type TenantDatabase} from '../src/lib/workspace/postgres-repository';
import {PostgresKnowledgeRepository} from '../src/lib/retrieval/postgres-knowledge';
import {PortableVectorStore} from '../src/lib/retrieval/portable-vector-store';
import {DashScopeEmbeddingProvider} from '../src/lib/retrieval/dashscope-provider';
import {embeddingCacheKey,type EmbeddingProvider,type EmbeddingResult} from '../src/lib/retrieval/embedding-provider';
import {contentHash} from '../src/lib/retrieval/chunker';
import {CHUNK_VERSION} from '../src/lib/retrieval/config';
import {RetrievalEngine} from '../src/lib/retrieval/engine';
import {MultimodalPipeline} from '../src/lib/multimodal/pipeline';
import {KimiVisionProvider} from '../src/lib/multimodal/kimi-vision';
import {PortableOCRProvider} from '../src/lib/multimodal/portable-ocr';
import {createKimiProvider} from '../src/lib/ai/providers/kimi-provider';
import {readModelConfig} from '../src/lib/ai/models';
import {generateGroundedAnswer} from '../src/lib/retrieval/rag';
async function main(){
 loadEnvConfig(process.cwd(),false,{info(){},error(){}});const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
 const db:TenantDatabase={query:async(u,s,v)=>runTenantQuery(await pool.connect(),u,s,v)};const userId=randomUUID();const scope={userId};const ids:string[]=[];
 const real=new DashScopeEmbeddingProvider({apiKey:process.env.EMBEDDING_API_KEY||process.env.DASHSCOPE_API_KEY||'',baseURL:process.env.EMBEDDING_BASE_URL||'',model:process.env.EMBEDDING_MODEL||'',dimensions:Number(process.env.EMBEDDING_DIMENSIONS||1024)});
 const cache:Record<string,EmbeddingResult>=JSON.parse(await readFile('.filemind/evaluation/hard-embeddings.json','utf8'));const key=(t:string,k:string)=>contentHash(JSON.stringify([real.getModelInfo(),k,t]));
 const provider:EmbeddingProvider={getModelInfo:()=>real.getModelInfo(),async embedQuery(t){return cache[key(t,'query')]??real.embedQuery(t);},async embedDocuments(texts){const values=[];for(const t of texts)values.push(cache[key(t,'document')]??(await real.embedDocuments([t]))[0]);return values;}};
 const repo=new PostgresWorkspaceRepository(db),knowledge=new PostgresKnowledgeRepository(db),vectors=new PortableVectorStore(db);
 try{
  const images=JSON.parse(await readFile('.filemind/evaluation/hard-images.json','utf8'));const pipeline=new MultimodalPipeline(new KimiVisionProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL}),new PortableOCRProvider(),process.env);
  const sources=hardTextDocuments.map(d=>({...d,type:'txt' as 'txt'|'image',structure:undefined as import('../src/lib/retrieval/types').ParsedStructure|undefined}));
  for(const [name]of imageFixtures){const bytes=await readFile(`tests/fixtures/rag-hard/images/${name}`);const result=await pipeline.analyze(randomUUID(),{bytes,filename:name,mimeType:name.endsWith('jpg')?'image/jpeg':'image/png'},contentHash(bytes.toString('base64')),AbortSignal.timeout(90000),images[name]);sources.push({name,topic:'image',text:result.text,type:'image',structure:result.structure});}
  for(let offset=0;offset<sources.length;offset+=24){const w=await repo.create(userId,'Phase 7 development refusal regression');ids.push(w.id);const batch=sources.slice(offset,offset+24);const documents=batch.map(d=>({id:randomUUID(),name:d.name,type:d.type,mimeType:d.type==='image'?'image/png':'text/plain',size:Buffer.byteLength(d.text),parseStatus:'completed' as const,metadata:{addedAt:new Date().toISOString(),structure:d.structure}}));await repo.save(userId,{...w,documents,texts:Object.fromEntries(documents.map((d,i)=>[d.id,batch[i].text]))});}
  const pending=[];for(const d of await knowledge.documents(scope)){const generation=randomUUID();pending.push({d,generation,chunks:await knowledge.prepareChunks(d,generation)});}
  const chunks=pending.flatMap(p=>p.chunks),embeddings=await provider.embedDocuments(chunks.map(c=>c.content));for(let i=0;i<chunks.length;i++)await vectors.upsertEmbedding(scope,chunks[i],embeddings[i],embeddingCacheKey(chunks[i].contentHash,embeddings[i].provider,embeddings[i].model,CHUNK_VERSION));for(const p of pending)await knowledge.setStatus(p.d,p.generation,'ready',provider.getModelInfo());
  const engine=new RetrievalEngine(provider,vectors,knowledge,null),kimi=createKimiProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL,models:readModelConfig(process.env)});const results=[];
  for(const q of hardQueries.filter(q=>['none-20','none-23'].includes(q.id))){const retrieval=await engine.retrieve(scope,q.query);const answer=await generateGroundedAnswer(q.query,retrieval.evidence,scope,kimi,knowledge.getSource.bind(knowledge),AbortSignal.timeout(90000));results.push({id:q.id,query:q.query,phase6Failure:'False Answer',contributors:q.id==='none-20'?['Context Conflict','Threshold Problem']:['Weak Retrieval','Threshold Problem'],phase7Refused:answer.answer?.insufficientEvidence===true&&!answer.unavailable,route:retrieval.route,assessment:answer.assessment??null,errorCode:answer.errorCode??null});}
  const report={checkedAt:new Date().toISOString(),dataset:'Unchanged Phase 6 development corpus, 72 sources',queries:2,results};await writeFile('docs/evaluation/phase6-refusal-regression.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{for(const id of ids)await db.query(userId,'delete from filemind.workspaces where user_id=$1 and id=$2',[userId,id]);await db.query(userId,'delete from filemind.profiles where id=$1',[userId]);await pool.end();}
}
void main().catch(()=>{console.error('Development refusal verification failed; credentials suppressed.');process.exitCode=1;});
