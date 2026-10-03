import { randomUUID } from "node:crypto";
import { link, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { ensureStorageDirectory, originalKey } from "../../../scripts/storage-recovery.mjs";
import { WorkspaceSnapshotSchema } from "../workspace/schemas";
import { WorkspaceError } from "../workspace/authorization";
import { PostgresWorkspaceRepository } from "../workspace/postgres-repository";
import { atomicWriteFile, withPathMutex } from "./atomic-file";
import { OperationPayloadSchema } from "./operation-journal";
import { RecoveryService } from "./recovery";

const IdentitySchema=z.object({version:z.literal(1),userId:z.uuid(),workspaceId:z.uuid()}).strict();
export class DemoWorkspaceService {
  constructor(readonly recovery:RecoveryService) {}
  private async identity() {
    const directory=join(dirname(this.recovery.storageRoot),"demo");
    await ensureStorageDirectory(directory);
    const path=join(directory,"identity.json");
    return withPathMutex(path,async()=>{
      try {return IdentitySchema.parse(JSON.parse(await readFile(path,"utf8")));}
      catch(error) {if(!(error instanceof Error&&"code" in error&&error.code==="ENOENT"))throw error;}
      const identity=IdentitySchema.parse({version:1,userId:randomUUID(),workspaceId:randomUUID()}),temporary=join(directory,`${randomUUID()}.json`);
      // A complete synced file is linked without overwriting an identity that
      // another process has published. No caller supplies these identifiers.
      try {await atomicWriteFile(temporary,Buffer.from(JSON.stringify(identity)));await link(temporary,path);}
      catch(error) {if(!(error instanceof Error&&"code" in error&&error.code==="EEXIST"))throw error;}
      finally {await unlink(temporary).catch(()=>{});}
      return IdentitySchema.parse(JSON.parse(await readFile(path,"utf8")));
    });
  }
  private snapshot(id:string) {return WorkspaceSnapshotSchema.parse({id,name:"FileMind Competition Demo",revision:0,documents:[],run:null,proposal:null,texts:{},updatedAt:new Date().toISOString()});}
  async open() {
    const identity=await this.identity();
    await this.recovery.journal.lock(identity.userId,"demo_registration",()=>this.recovery.db.transaction(identity.userId,async tx=>{
      const existing=await tx.query("select workspace_id from filemind.demo_registration where user_id=$1",[identity.userId]);
      if(existing.rows.length) {if(z.object({workspace_id:z.uuid()}).parse(existing.rows[0]).workspace_id!==identity.workspaceId)throw new Error("DEMO_IDENTITY_MISMATCH");return;}
      // Never adopt an existing profile without the server-created marker.
      await tx.query("insert into filemind.profiles(id) values($1)",[identity.userId]);
      const snapshot=this.snapshot(identity.workspaceId);
      await tx.query("insert into filemind.workspaces(id,user_id,name,snapshot) values($1,$2,$3,$4)",[snapshot.id,identity.userId,snapshot.name,snapshot]);
      await tx.query("insert into filemind.demo_registration(user_id,workspace_id) values($1,$2)",[identity.userId,identity.workspaceId]);
    }));
    return identity;
  }
  async status(userId:string|null) {
    const identity=await this.identity();
    if(userId!==identity.userId)return {active:false,workspaceId:null};
    const result=await this.recovery.db.query(userId,"select workspace_id from filemind.demo_registration where user_id=$1 and workspace_id=$2",[userId,identity.workspaceId]);
    return {active:!!result.rows.length,workspaceId:result.rows.length?identity.workspaceId:null};
  }
  async reset(userId:string,workspaceId:string,confirm:string,afterCommit?:()=>Promise<void>) {
    const identity=await this.identity();
    if(userId!==identity.userId||workspaceId!==identity.workspaceId||confirm!=="RESET_DEMO_WORKSPACE")throw new WorkspaceError("NOT_FOUND","Demo workspace not found.",404);
    await this.recovery.recover(userId);
    const result=await this.recovery.journal.run(userId,"demo_reset",workspaceId,{workspaceId},async op=>{
      const active=await this.recovery.db.query(userId,"select id from filemind.operation_journal where user_id=$1 and operation_type='reindex' and status in ('pending','running')",[userId]);
      if(active.rows.length)throw new WorkspaceError("CONFLICT","Wait for indexing to finish before resetting the demo.",409);
      const previous=await new PostgresWorkspaceRepository(this.recovery.db).get(userId,workspaceId);
      const rows=await this.recovery.db.query(userId,"select id,original_name,storage_path,content_hash from filemind.documents where user_id=$1 and workspace_id=$2 and storage_path is not null",[userId,workspaceId]);
      const originals=z.array(z.object({id:z.uuid(),original_name:z.string(),storage_path:z.string(),content_hash:z.string()})).parse(rows.rows);
      const removedFiles=OperationPayloadSchema.parse({removedFiles:originals.map(row=>({documentId:row.id,workspaceId,extension:row.original_name.split('.').at(-1)!.toLowerCase(),hash:row.content_hash}))}).removedFiles!;
      for(let i=0;i<originals.length;i++)if(originals[i].storage_path!==originalKey(userId,workspaceId,originals[i].id,removedFiles[i].extension))throw new Error("INVALID_ORIGINAL_INTENT");
      await op.stage("reset_prepared",{removedFiles,expectedRevision:previous.revision});
      return this.recovery.db.transaction(userId,async tx=>{
        op.assertActive();
        const marker=await tx.query("select workspace_id from filemind.demo_registration where user_id=$1 and workspace_id=$2 for update",[userId,workspaceId]);
        if(!marker.rows.length)throw new WorkspaceError("NOT_FOUND","Demo workspace not found.",404);
        const current=await tx.query("select revision from filemind.workspaces where user_id=$1 and id=$2 for update",[userId,workspaceId]);
        if(z.object({revision:z.number().int()}).parse(current.rows[0]).revision!==previous.revision)throw new WorkspaceError("CONFLICT","Workspace changed. Retry the demo reset.",409);
        await tx.query("delete from filemind.retrieval_runs where user_id=$1 and (workspace_id=$2 or retrieved_chunk_ids && array(select id from filemind.document_chunks where user_id=$1 and workspace_id=$2))",[userId,workspaceId]);
        await tx.query("delete from filemind.workspaces where user_id=$1 and id=$2",[userId,workspaceId]);
        const snapshot={...this.snapshot(workspaceId),revision:previous.revision+1};
        await tx.query("insert into filemind.workspaces(id,user_id,name,snapshot,revision) values($1,$2,$3,$4,$5)",[workspaceId,userId,snapshot.name,snapshot,snapshot.revision]);
        await tx.query("insert into filemind.demo_registration(user_id,workspace_id) values($1,$2)",[userId,workspaceId]);
        await op.commit(tx);return snapshot;
      });
    });
    await afterCommit?.();await this.recovery.recover(userId);return result;
  }
}
