import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../scripts/database/migrate-database.mjs";
import { ensureStorageDirectory, quarantineStorage } from "../scripts/runtime/storage-recovery.mjs";
import { runTenantQuery, runTenantTransaction } from "../src/lib/workspace/tenant-query";
import { PostgresWorkspaceRepository, type TransactionalTenantDatabase } from "../src/lib/workspace/postgres-repository";
import { PrivateFileStorage } from "../src/lib/workspace/private-file-storage";
import { RecoveryService } from "../src/lib/reliability/recovery";
import { WorkspaceOperations } from "../src/lib/reliability/workspace-operations";

test("upload commit/revision failure, orphan quarantine and missing reconciliation preserve owned knowledge and are repeatable", async () => {
  const root = await mkdtemp(join(tmpdir(), "filemind-reconcile-")), db = new PGlite();
  try {
    await applyMigrations({ query: async (s: string, p?: unknown[]) => p ? db.query(s, p) : (await db.exec(s)).at(-1)! });
    await db.exec("create role repair_tenant; grant usage on schema filemind to repair_tenant; grant select,insert,update,delete on all tables in schema filemind to repair_tenant; grant execute on function filemind.save_workspace(uuid,jsonb,integer) to repair_tenant;");
    const client = () => ({ query: async (s: string,p?: unknown[]) => { const r=await db.query(s,p); if (s.startsWith("begin")) await db.exec("set local role repair_tenant"); return r; }, release() {} });
    const tenant: TransactionalTenantDatabase = { query:(u,s,p)=>runTenantQuery(client(),u,s,p), transaction:(u,w,r)=>runTenantTransaction(client(),u,w,r) };
    const user=crypto.randomUUID(), foreign=crypto.randomUUID(), id=crypto.randomUUID();
    const repository=new PostgresWorkspaceRepository(tenant), recovery=new RecoveryService(tenant,join(root,"storage")), operations=new WorkspaceOperations(recovery);
    const empty=await repository.create(user,"Reliability fixture"), bytes=Buffer.from("Stored knowledge survives a missing original.");
    const snapshot=await repository.save(user,{...empty,documents:[{id,name:"sample.txt",type:"txt",mimeType:"text/plain",size:bytes.length,parseStatus:"completed",metadata:{addedAt:new Date().toISOString()}}],texts:{[id]:bytes.toString()}});
    const saved=await operations.upload(user,structuredClone(snapshot),id,"txt",bytes);
    assert.equal((await recovery.reconcile(user)).referenced,1);
    // A stale retry cannot remove bytes already committed by the first upload.
    await assert.rejects(operations.upload(user,structuredClone(snapshot),id,"txt",bytes),/changed/);
    assert.ok((await new PrivateFileStorage(recovery.storageRoot).readOriginal({userId:user,workspaceId:saved.id,documentId:id,extension:"txt"})).equals(bytes));
    const orphan=crypto.randomUUID(), foreignDoc=crypto.randomUUID(), storage=new PrivateFileStorage(recovery.storageRoot);
    const orphanKey=await storage.putOriginal({userId:user,workspaceId:saved.id,documentId:orphan,extension:"txt",bytes:Buffer.from("orphan")});
    const foreignKey=await storage.putOriginal({userId:foreign,workspaceId:saved.id,documentId:foreignDoc,extension:"txt",bytes:Buffer.from("foreign")});
    const report=await recovery.reconcile(user); assert.equal(report.orphan,1); assert.equal(report.referenced,1); assert.equal(report.quarantineIds.length,1);
    const manifest=JSON.parse(await readFile(join(root,"quarantine",user,report.quarantineIds[0],"manifest.json"),"utf8"));
    assert.equal(manifest.origin,orphanKey); assert.equal(manifest.sha256,createHash("sha256").update("orphan").digest("hex"));
    assert.equal((await recovery.reconcile(user)).orphan,0);
    await assert.rejects(quarantineStorage(recovery.query,user,foreignKey,"orphan_file",{storageRoot:recovery.storageRoot}),/FOREIGN/);
    assert.ok((await storage.readOriginal({userId:foreign,workspaceId:saved.id,documentId:foreignDoc,extension:"txt"})).equals(Buffer.from("foreign")));
    const original=join(recovery.storageRoot,...saved.documents[0].storagePath!.split("/"));
    await rm(original);
    assert.equal((await recovery.reconcile(user)).missing,1);
    assert.equal((await repository.get(user,saved.id)).texts[id],bytes.toString());
    assert.equal((await tenant.query(user,"select storage_status from filemind.documents where id=$1",[id])).rows[0] && (await db.query<{storage_status:string}>("select storage_status from filemind.documents where id=$1",[id])).rows[0].storage_status,"missing");
    await operations.upload(user,await repository.get(user,saved.id),id,"txt",bytes);
    assert.equal((await recovery.reconcile(user)).referenced,1);
    assert.equal((await readdir(join(root,"quarantine",user))).length,1);
    // A committed removal can lose its response before quarantine. The startup
    // protocol finishes it once, while retaining all parsed knowledge.
    const current=await repository.get(user,saved.id);
    await assert.rejects(operations.removeOriginal(foreign,saved.id,id,current.revision),/not found/);
    await assert.rejects(operations.removeOriginal(user,saved.id,id,current.revision-1),/changed/);
    await assert.rejects(operations.removeOriginal(user,saved.id,id,current.revision,async()=>{throw new Error("simulated response loss");}),/response loss/);
    const removed=await repository.get(user,saved.id);assert.equal(removed.documents[0].storagePath,undefined);assert.equal(removed.documents[0].storageStatus,"not_stored");assert.equal(removed.texts[id],bytes.toString());
    assert.ok((await storage.readOriginal({userId:user,workspaceId:saved.id,documentId:id,extension:"txt"})).equals(bytes));
    assert.equal((await recovery.recover(user)).recovered,1);
    await assert.rejects(storage.readOriginal({userId:user,workspaceId:saved.id,documentId:id,extension:"txt"}),/not found/);
    assert.equal((await recovery.recover(user)).recovered,0);
    assert.ok((await storage.readOriginal({userId:foreign,workspaceId:saved.id,documentId:foreignDoc,extension:"txt"})).equals(Buffer.from("foreign")));
    // Do not follow junction ancestors, and do not create children behind them.
    const outside=join(root,"outside"), junction=join(root,"junction"); await mkdir(outside); await symlink(outside,junction,"junction");
    await assert.rejects(ensureStorageDirectory(join(junction,"escape")),/UNSAFE/);
    assert.deepEqual(await readdir(outside),[]);
  } finally {
    await db.close();
    const within=relative(resolve(tmpdir()),resolve(root)); assert.ok(within && !within.startsWith("..") && !isAbsolute(within));
    await rm(root,{recursive:true,force:true});
  }
});
