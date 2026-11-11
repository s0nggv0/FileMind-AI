import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolatedKnowledge } from "./helpers/isolated-knowledge";
import { queueIndexPreparation, runQueuedPreparation } from "../src/lib/retrieval/index-preparation-queue";
import { IndexStatusRepository } from "../src/lib/retrieval/index-status";
import { IndexingPipeline } from "../src/lib/retrieval/indexing";
import { MockEmbeddingProvider } from "../src/lib/retrieval/embedding-provider";
import { RecoveryService } from "../src/lib/reliability/recovery";
import { recoverTenantOperations } from "../scripts/runtime/storage-recovery.mjs";
import { OperationJournal } from "../src/lib/reliability/operation-journal";

test("queued preparation is visible before background work, survives runtime recovery and recovers after restart without replacing old knowledge",async()=>{
  const f=await isolatedKnowledge(),root=await mkdtemp(join(tmpdir(),"filemind-queued-"));
  try{
    const userId=crypto.randomUUID(),workspace=await f.workspaces.create(userId,"Queued synthetic files"),ids=[crypto.randomUUID(),crypto.randomUUID()];
    await f.workspaces.save(userId,{...workspace,documents:ids.map(id=>({id,name:"fixture.txt",type:"txt" as const,mimeType:"text/plain",size:20,parseStatus:"completed" as const,metadata:{addedAt:new Date().toISOString()}})),texts:Object.fromEntries(ids.map(id=>[id,"Synthetic retention is 6 hours."]))});
    const scope={userId,workspaceId:workspace.id},status=new IndexStatusRepository(f.tenant),journal=new OperationJournal(f.tenant),recovery=new RecoveryService(f.tenant,root);
    const queued=await queueIndexPreparation(f.tenant,scope);assert.equal(queued.length,2);assert.equal((await status.page(scope)).summary.processing,2);
    assert.equal((await queueIndexPreparation(f.tenant,scope)).length,0); // a second Apply cannot queue the same running files
    assert.equal((await recovery.recover(userId)).recovered,0);
    const pipeline=new IndexingPipeline(f.knowledge,f.vectors,new MockEmbeddingProvider(),{}, {storageRoot:root});
    for(const job of queued)await runQueuedPreparation(f.tenant,job,()=>pipeline.indexLibrary(scope,job.documentId));
    assert.equal((await status.page(scope)).summary.semantic,2);assert.equal((await status.page(scope)).summary.processing,0);
    const original=(await f.knowledge.lexicalSearch(scope,"retention")).map(e=>e.id);
    await f.db.query("update filemind.documents set index_build_status='failed' where id=$1",[ids[0]]);
    const lost=(await queueIndexPreparation(f.tenant,{...scope,documentIds:[ids[0]]}))[0];assert.ok(lost);
    const recovered=await recoverTenantOperations(recovery.query,(key,work,tryOnly)=>journal.lock(userId,key.slice(userId.length+1),work,tryOnly),userId,{storageRoot:root});
    assert.equal(recovered.recovered,1);assert.equal((await journal.get(userId,lost.id))?.status,"interrupted");
    assert.equal((await status.page(scope)).summary.replacementFailed,1);
    assert.deepEqual((await f.knowledge.lexicalSearch(scope,"retention")).map(e=>e.id),original);
    let called=false;await runQueuedPreparation(f.tenant,lost,async()=>{called=true;});assert.equal(called,false);
    let release!:()=>void;const held=journal.lock(userId,"prepare:test",()=>new Promise<void>(resolve=>{release=resolve;}));
    await new Promise(resolve=>setTimeout(resolve,0));assert.equal(await journal.lock(userId,"prepare:test",async()=>true,true),null);release();await held;
  }finally{await f.db.close();await rm(root,{recursive:true,force:true});}
});
