import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../scripts/migrate-database.mjs";
import { runTenantQuery, runTenantTransaction } from "../src/lib/workspace/tenant-query";
import { PostgresWorkspaceRepository, type TransactionalTenantDatabase } from "../src/lib/workspace/postgres-repository";
import { RecoveryService } from "../src/lib/reliability/recovery";
import { DemoWorkspaceService } from "../src/lib/reliability/demo-workspace";
import { WorkspaceOperations } from "../src/lib/reliability/workspace-operations";
import { PrivateFileStorage } from "../src/lib/workspace/private-file-storage";

test("demo reset rejects normal users and other workspaces, and repairs committed originals after lost response",async()=>{
  const root=await mkdtemp(join(tmpdir(),"filemind-demo-")),pg=new PGlite();
  try {
    await applyMigrations({query:async(s:string,p?:unknown[])=>p?pg.query(s,p):(await pg.exec(s)).at(-1)!});
    await pg.exec("create role demo_tenant;grant usage on schema filemind to demo_tenant;grant select,insert,update,delete on all tables in schema filemind to demo_tenant;grant execute on function filemind.save_workspace(uuid,jsonb,integer) to demo_tenant;");
    const client=()=>({query:async(s:string,p?:unknown[])=>{const r=await pg.query(s,p);if(s.startsWith("begin"))await pg.exec("set local role demo_tenant");return r;},release(){}});
    const db:TransactionalTenantDatabase={query:(u,s,p)=>runTenantQuery(client(),u,s,p),transaction:(u,w,r)=>runTenantTransaction(client(),u,w,r)};
    const recovery=new RecoveryService(db,join(root,"storage")),demo=new DemoWorkspaceService(recovery),repo=new PostgresWorkspaceRepository(db);
    const ordinary=randomUUID(),normal=await repo.create(ordinary,"Preserve real user"),identity=await demo.open();
    assert.deepEqual(await demo.open(),identity);
    assert.equal((await demo.status(ordinary)).active,false);
    assert.equal((await demo.status(identity.userId)).active,true);
    const sibling=await repo.create(identity.userId,"Preserve sibling workspace");
    await assert.rejects(demo.reset(ordinary,identity.workspaceId,"RESET_DEMO_WORKSPACE"),/not found/);
    await assert.rejects(demo.reset(identity.userId,sibling.id,"RESET_DEMO_WORKSPACE"),/not found/);
    await assert.rejects(demo.reset(identity.userId,identity.workspaceId,"wrong"),/not found/);
    const doc=randomUUID(),bytes=Buffer.from("Synthetic demo original"),initial=await repo.get(identity.userId,identity.workspaceId);
    const snapshot=await repo.save(identity.userId,{...initial,documents:[{id:doc,name:"demo.txt",type:"txt",mimeType:"text/plain",size:bytes.length,parseStatus:"completed",metadata:{addedAt:new Date().toISOString()}}],texts:{[doc]:bytes.toString()}});
    const beforeReset=await new WorkspaceOperations(recovery).upload(identity.userId,snapshot,doc,"txt",bytes);
    await assert.rejects(demo.reset(identity.userId,identity.workspaceId,"RESET_DEMO_WORKSPACE",async()=>{throw new Error("response lost");}),/response lost/);
    assert.equal((await repo.get(identity.userId,identity.workspaceId)).documents.length,0);
    assert.ok((await repo.get(identity.userId,identity.workspaceId)).revision>beforeReset.revision);
    await assert.rejects(repo.save(identity.userId,beforeReset),/changed/);
    const file={userId:identity.userId,workspaceId:identity.workspaceId,documentId:doc,extension:"txt"};
    assert.ok((await new PrivateFileStorage(recovery.storageRoot).readOriginal(file)).equals(bytes));
    assert.equal((await recovery.recover(identity.userId)).recovered,1);
    await assert.rejects(new PrivateFileStorage(recovery.storageRoot).readOriginal(file),/not found/);
    assert.equal((await recovery.recover(identity.userId)).recovered,0);
    assert.equal((await repo.get(ordinary,normal.id)).name,normal.name);
    assert.equal((await repo.get(identity.userId,sibling.id)).name,sibling.name);
    // Missing registration never silently adopts an existing real identity.
    await db.query(identity.userId,"delete from filemind.demo_registration where user_id=$1",[identity.userId]);
    await assert.rejects(demo.open());
    assert.equal((await repo.get(identity.userId,sibling.id)).name,sibling.name);
    assert.equal(JSON.parse(await readFile(join(root,"demo/identity.json"),"utf8")).userId,identity.userId);
  }finally{await pg.close();const rel=relative(resolve(tmpdir()),resolve(root));assert.ok(rel&&!rel.startsWith("..")&&!isAbsolute(rel));await rm(root,{recursive:true,force:true});}
});
