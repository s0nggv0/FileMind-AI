import { test } from "node:test";
import assert from "node:assert/strict";
import { isolatedKnowledge } from "./helpers/isolated-knowledge";
import { MockEmbeddingProvider } from "../src/lib/retrieval/embedding-provider";
import { RetrievalEngine } from "../src/lib/retrieval/engine";
import { buildRAGContext } from "../src/lib/retrieval/rag";
import { sourceCoverage } from "../src/lib/retrieval/source-coverage";
import { coverageCandidates } from "../src/lib/retrieval/evidence-diversity";
import { lexicalTokens } from "../src/lib/retrieval/lexical-tokens";
import { contentHash } from "../src/lib/retrieval/chunker";
import type { Evidence } from "../src/lib/retrieval/types";

test("SQL recall covers a short selected source before top-K; evidence budgets, copies and identity remain honest", async () => {
  const f = await isolatedKnowledge();
  try {
    const owner=crypto.randomUUID(), foreign=crypto.randomUUID();
    const workspace=await f.workspaces.create(owner,"Synthetic comparison");
    const ids=Array.from({length:12},()=>crypto.randomUUID());
    const documents=ids.map((id,i)=>({id,name:`${String(i).padStart(2,"0")}.txt`,type:"txt" as const,mimeType:"text/plain",size:50,parseStatus:"completed" as const,contentHash:contentHash(i===3?"0":""+i),metadata:{addedAt:new Date().toISOString()}}));
    await f.workspaces.save(owner,{...workspace,documents,texts:Object.fromEntries(ids.map(id=>[id,"Synthetic comparison fixture."]))});
    const provider=new MockEmbeddingProvider(), query="Compare retention policies", vector=await provider.embedQuery(query);
    const rows:Evidence[]=[];
    for(let i=0;i<ids.length;i++) {
      const content=i===2?"No requested numeric detail here.":i===1?"Retention is 8 hours.":"Compare retention policies: retention is 6 hours.";
      for(let n=0;n<(i===0?45:1);n++) {
        const id=crypto.randomUUID();
        await f.db.query(`insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version,lexical_tokens) values($1,$2,$3,$4,$5,$6,$7,0,$8,10,'chunk-v1',$9)`,[id,owner,workspace.id,ids[i],n,content,contentHash(content),content.length,lexicalTokens(content)]);
        const embedding=i===0||i===3?vector.vector:vector.vector.map((x,j)=>x+(j===0?2:0));
        await f.db.query(`insert into filemind.chunk_embeddings(user_id,workspace_id,document_id,chunk_id,provider,model,dimensions,embedding,embedding_hash,chunk_version) values($1,$2,$3,$4,$5,$6,$7,$8,'fixture','chunk-v1')`,[owner,workspace.id,ids[i],id,vector.provider,vector.model,vector.dimensions,embedding]);
      }
    }
    await f.db.query("update filemind.documents set index_status='ready',embedding_provider=$1,embedding_model=$2,chunk_version='chunk-v1'",[vector.provider,vector.model]);
    const scope={userId:owner,workspaceId:workspace.id,documentIds:ids.slice(0,2)};
    assert.deepEqual([...new Set((await f.knowledge.lexicalSearch(scope,query)).map(e=>e.documentId))],[ids[0]]);
    assert.deepEqual(new Set((await f.knowledge.lexicalSearch(scope,query,{documentCoverage:true})).map(e=>e.documentId)),new Set(scope.documentIds));
    assert.deepEqual([...new Set((await f.vectors.searchSimilar(scope,vector,20)).map(e=>e.documentId))],[ids[0]]);
    assert.deepEqual(new Set((await f.vectors.searchSimilar(scope,vector,20,{documentCoverage:true})).map(e=>e.documentId)),new Set(scope.documentIds));
    const result=await new RetrievalEngine(provider,f.vectors,f.knowledge).retrieve(scope,query);
    assert.deepEqual(new Set(result.evidence.map(e=>e.documentId)),new Set(scope.documentIds));
    const context=buildRAGContext(result.evidence);
    assert.equal(context.sources.find(e=>e.documentId===ids[1])?.content,"Retention is 8 hours.");
    for(const source of context.sources) assert.equal((await f.knowledge.getSource(scope,source.id))?.documentId,source.documentId);
    assert.deepEqual(await f.knowledge.lexicalSearch({...scope,userId:foreign},query,{documentCoverage:true}),[]);
    assert.deepEqual(await f.vectors.searchSimilar({...scope,userId:foreign},vector,20,{documentCoverage:true}),[]);
    assert.deepEqual(await f.knowledge.lexicalSearch({...scope,documentIds:[]},query,{documentCoverage:true}),[]);
    const allScope={...scope,documentIds:ids};
    const all=await new RetrievalEngine(null,f.vectors,f.knowledge).retrieve(allScope,query);
    rows.push(...all.fused);
    const allContext=buildRAGContext(all.evidence);
    const coverage=sourceCoverage(await f.knowledge.coverageDocuments(allScope),rows,allContext.sources);
    assert.equal(allContext.sources.length,7);assert.equal(coverage.complete,false);
    assert.equal(coverage.evidenceDocumentIds.length,7);
    assert.ok(coverage.uncovered.some(d=>d.documentId===ids[2]&&d.reason==="no_relevant_evidence"));
    assert.ok(coverage.uncovered.some(d=>d.reason==="budget"));
    // Copy and original collapse only at matching passage positions; distinct hashes retain identity.
    const shared=rows.filter(e=>e.chunkIndex===0&&[ids[0],ids[3],ids[4]].includes(e.documentId));
    const sharedContext=buildRAGContext(shared);
    assert.equal(sharedContext.sources.length,2);
    const copyCoverage=sourceCoverage({documents:documents.filter(d=>[ids[0],ids[3],ids[4]].includes(d.id)).map(d=>({id:d.id,name:d.name,status:"ready",chunks:1})),total:3},shared,sharedContext.sources);
    assert.equal(copyCoverage.mergedCopies.length,1);assert.equal(copyCoverage.evidenceDocumentIds.length,2);
    assert.equal(copyCoverage.complete,true);
    const ordinary=await new RetrievalEngine(null,f.vectors,f.knowledge).retrieve(scope,"retention policies");
    assert.equal(ordinary.evidence.every(e=>e.documentId===ids[0]),true);
    const stream=await f.vectors.searchSimilar(allScope,vector,20,{documentCoverage:true});
    assert.deepEqual(stream.map(e=>e.id),coverageCandidates((await f.vectors.searchSimilar(allScope,vector,100)),20).map(e=>e.id));
  } finally {await f.db.close();}
});
