import {randomUUID} from "node:crypto";
import {mkdir,writeFile,readFile,rm,realpath,lstat} from "node:fs/promises";
import {resolve,relative,isAbsolute,join} from "node:path";
import {z} from "zod";
import type {TransactionalTenantDatabase} from "../workspace/postgres-repository";
import {PrivateFileStorage} from "../workspace/private-file-storage";
import {tables,BACKUP_FORMAT_VERSION,BACKUP_SCHEMA_VERSION,BACKUP_LIMITS,BackupError,type BackupData,type BackupRow,type BackupCompatibility,type BackupManifest} from "./format";
import {packArchive,sha256} from "./archive";
import {validateBackup,validateReferences,type ValidatedBackup} from "./validation";
import {WorkspaceSnapshotSchema,recoverSnapshot} from "../workspace/schemas";
export type BackupStage="Preparing metadata"|"Collecting files"|"Generating manifest"|"Calculating checksums"|"Packaging"|"Completed";
export interface ImportOptions{skipDuplicates?:boolean;signal?:AbortSignal;beforeCommit?:()=>Promise<void>}
const json=(v:unknown)=>Buffer.from(JSON.stringify(v));
function neutral(value:unknown):unknown{
 if(Array.isArray(value))return value.map(neutral);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([k])=>k!=="user_id"&&k!=="userId").map(([k,v])=>[k,neutral(v)]));
 return value;
}
function extension(row:BackupRow){const ext=String(row.original_name).split(".").pop()?.toLowerCase();if(!ext||!["pdf","docx","txt","md","png","jpg","jpeg"].includes(ext))throw new BackupError("Original file extension is unsupported.");return ext;}
const referenceFields=new Set("id workspace_id document_id run_id source_id target_id chunk_id documentId workspaceId chunkId source target index_generation documentIds retrieved_chunk_ids evidence_ids".split(" "));
const preservedFields=new Set("text_content content content_preview summary original_name display_name suggested_filename name originalName suggestedName reason query rewritten_query answer ocr_text vision_summary ocrText visionSummary description title message output error error_message tag tags topics visible_concepts visibleConcepts lexical_tokens heading_path".split(" "));
function transform(value:unknown,ids:Map<string,string>,paths:Map<string,string>,userId:string,field=""):unknown{
 if(preservedFields.has(field)&&(typeof value==="string"||Array.isArray(value)&&value.every(v=>typeof v==="string")))return value;
 if(typeof value==="string")return referenceFields.has(field)?ids.get(value)??value:value;
 if(Array.isArray(value))return value.map(v=>transform(v,ids,paths,userId,field));
 if(value&&typeof value==="object"){
  const object=Object.fromEntries(Object.entries(value).map(([k,v])=>[ids.get(k)??k,transform(v,ids,paths,userId,k)]));
  if(typeof object.id==="string"&&paths.has(object.id)&&"storagePath" in object)object.storagePath=paths.get(object.id);
  if("chunkVersion" in object&&"documentId" in object)object.userId=userId;
  return object;
 }
 return value;
}
// Retain independent run history, but remove skipped documents and all references
// to them. Never map a duplicate into another workspace's composite foreign keys.
function pruneSkipped(value:unknown,skipped:Set<string>):unknown{
 if(Array.isArray(value))return value.filter(v=>!(v&&typeof v==="object"&&("id" in v&&skipped.has(String(v.id))||"source" in v&&skipped.has(String(v.source))||"target" in v&&skipped.has(String(v.target))||"input" in v&&v.input&&typeof v.input==="object"&&"documentId" in v.input&&skipped.has(String(v.input.documentId))))).map(v=>pruneSkipped(v,skipped)).filter(v=>!(v&&typeof v==="object"&&"documentIds" in v&&Array.isArray(v.documentIds)&&v.documentIds.length<2));
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([k])=>!skipped.has(k)).map(([k,v])=>[k,k==="documentIds"&&Array.isArray(v)?v.filter(id=>!skipped.has(String(id))):pruneSkipped(v,skipped)]));
 return value;
}
export class BackupService{
 constructor(private db:TransactionalTenantDatabase,private storageRoot:string,private current:BackupCompatibility,private filemindVersion="0.1.0"){}
 async export(userId:string,onStage:(stage:BackupStage)=>void=()=>{}){
  z.uuid().parse(userId);onStage("Preparing metadata");
  const data={} as BackupData;let profile:{created_at:string}={created_at:new Date().toISOString()};
  const archive:Record<string,Uint8Array>=Object.create(null);const storage=new PrivateFileStorage(this.storageRoot);
  await this.db.transaction(userId,async tx=>{
   await tx.query("insert into filemind.profiles(id) values($1) on conflict do nothing",[userId]);
   const p=await tx.query("select created_at from filemind.profiles where id=$1",[userId]);profile={created_at:new Date((p.rows[0] as {created_at:string}).created_at).toISOString()};
   for(const t of tables){const result=await tx.query(`select to_jsonb(t)-'user_id' as row from filemind.${t.table} t where t.user_id=$1`,[userId]);data[t.table]=result.rows.map(r=>neutral((r as {row:BackupRow}).row) as BackupRow);}
   onStage("Collecting files");
   for(const document of data.documents){if(document.storage_path===null)continue;const ext=extension(document),path=`files/${document.id}.${ext}`;const bytes=await storage.readOriginal({userId,workspaceId:String(document.workspace_id),documentId:String(document.id),extension:ext});if(bytes.length!==document.file_size||sha256(bytes)!==document.content_hash)throw new BackupError("Original file integrity check failed.");archive[path]=bytes;document.storage_path=path;}
  },true);
  const paths=new Map(data.documents.map(d=>[String(d.id),d.storage_path]));
  function archivePaths(value:unknown):unknown{if(Array.isArray(value))return value.map(archivePaths);if(value&&typeof value==="object"){const result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,archivePaths(v)]));if(typeof result.id==="string"&&"name" in result&&"type" in result&&paths.get(result.id))result.storagePath=paths.get(result.id);return result;}return value;}
  for(const t of tables){data[t.table]=archivePaths(data[t.table]) as BackupRow[];archive[`data/${t.file}.json`]=json(data[t.table]);}
  archive["data/profile.json"]=json(profile);onStage("Generating manifest");
  const manifest:BackupManifest={format:"filemind-backup",version:BACKUP_FORMAT_VERSION,createdAt:new Date().toISOString(),filemindVersion:this.filemindVersion,schemaVersion:BACKUP_SCHEMA_VERSION,chunkVersion:this.current.chunkVersion,embeddingProvider:this.current.embedding?.provider??null,embeddingModel:this.current.embedding?.model??null,embeddingDimensions:this.current.embedding?.dimensions??null,visionProvider:this.current.vision?.provider??null,visionModel:this.current.vision?.model??null,analysisVersion:this.current.vision?.analysisVersion??"none",visionPromptVersion:this.current.vision?.promptVersion??"none",documentsCount:data.documents.length,workspacesCount:data.workspaces.length,filesCount:Object.keys(archive).filter(p=>p.startsWith("files/")).length,checksumAlgorithm:"SHA-256",checksums:{},encrypted:false};
  onStage("Calculating checksums");let total=0;for(const [path,bytes]of Object.entries(archive)){total+=bytes.length;if(total>BACKUP_LIMITS.totalBytes)throw new BackupError("Backup exceeds supported limits.");manifest.checksums[path]=sha256(bytes);}archive["manifest.json"]=json(manifest);archive["manifest.sha256"]=Buffer.from(sha256(archive["manifest.json"]));
  onStage("Packaging");const bytes=packArchive(archive);validateBackup(bytes,this.current);onStage("Completed");return{bytes,manifest};
 }
 validate(bytes:Uint8Array){return validateBackup(bytes,this.current);}
 async preview(userId:string,bytes:Uint8Array){const validated=this.validate(bytes);const result=await this.db.query(userId,"select content_hash from filemind.documents where user_id=$1 and content_hash is not null",[userId]);const hashes=new Set(result.rows.map(r=>String((r as {content_hash:string}).content_hash)));return{...validated.preview,duplicates:validated.data.documents.filter(d=>d.content_hash&&hashes.has(String(d.content_hash))).length};}
 async import(userId:string,bytes:Uint8Array,options:ImportOptions={}){
  z.uuid().parse(userId);options.signal?.throwIfAborted();const backup=this.validate(bytes);
  const root=resolve(this.storageRoot);await mkdir(root,{recursive:true,mode:0o700});const realRoot=await realpath(root);
  const stagingRoot=join(realRoot,".imports");await mkdir(stagingRoot,{recursive:true,mode:0o700});if((await lstat(stagingRoot)).isSymbolicLink()||await realpath(stagingRoot)!==stagingRoot)throw new BackupError("Unsafe import staging directory.");
  const staging=join(stagingRoot,randomUUID());await mkdir(staging,{mode:0o700});const published:string[]=[];
  try{
   for(const row of backup.data.documents){if(row.storage_path===null)continue;options.signal?.throwIfAborted();await writeFile(join(staging,`${row.id}.${extension(row)}`),backup.files[String(row.storage_path)],{flag:"wx",mode:0o600});}
   const result=await this.db.transaction(userId,async tx=>{
    // Serialize duplicate decisions for this tenant across simultaneous imports.
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,7107))",[userId]);
    const existing=await tx.query("select content_hash from filemind.documents where user_id=$1 and content_hash is not null",[userId]);const hashes=new Set(existing.rows.map(r=>String((r as {content_hash:string}).content_hash)));const skipped=new Set<string>();
    if(options.skipDuplicates!==false)for(const d of backup.data.documents){if(d.content_hash&&hashes.has(String(d.content_hash)))skipped.add(String(d.id));else if(d.content_hash)hashes.add(String(d.content_hash));}
    const data=this.prepareImport(backup,userId,skipped);const storage=new PrivateFileStorage(realRoot);
    for(const row of data.data.documents){options.signal?.throwIfAborted();const old=backup.data.documents.find(d=>data.ids.get(String(d.id))===row.id)!;if(old.storage_path===null)continue;const ext=extension(old);const payload=await readFile(join(staging,`${old.id}.${ext}`));if(sha256(payload)!==old.content_hash)throw new BackupError();published.push(join(realRoot,userId,String(row.workspace_id),String(row.id)));const path=await storage.putOriginal({userId,workspaceId:String(row.workspace_id),documentId:String(row.id),extension:ext,bytes:payload});row.storage_path=path;data.paths.set(String(row.id),path);}
    await tx.query("insert into filemind.profiles(id) values($1) on conflict do nothing",[userId]);
    // All generated IDs are new. No ON CONFLICT update and no existing row is overwritten.
    for(const t of tables)for(const original of data.data[t.table]){
     options.signal?.throwIfAborted();const row=transform(original,new Map(),data.paths,userId) as BackupRow;
     const cols=["user_id",...t.columns.split(" ")];await tx.query(`insert into filemind.${t.table}(${cols.join(",")}) select ${cols.map(c=>`r.${c}`).join(",")} from jsonb_populate_record(null::filemind.${t.table},$1::jsonb) r`,[JSON.stringify({...row,user_id:userId})]);
    }
    await options.beforeCommit?.();options.signal?.throwIfAborted();
    return{workspaces:data.data.workspaces.length,documents:data.data.documents.length,files:published.length,skippedDocuments:skipped.size,embeddingCompatible:backup.embeddingCompatible,visionCompatible:backup.visionCompatible,reindexRequired:!backup.embeddingCompatible||!backup.visionCompatible,workspaceIds:data.data.workspaces.map(w=>String(w.id))};
   });
   return result;
  }catch(error){
   for(const directory of published){const within=relative(realRoot,directory);if(!within||within.startsWith("..")||isAbsolute(within))throw new BackupError("Unsafe import cleanup path.");await rm(directory,{recursive:true,force:true});}
   if(error instanceof BackupError)throw error;throw new BackupError("Import failed. No data was restored. Please retry.",503);
  }finally{const within=relative(stagingRoot,staging);if(!within||within.startsWith("..")||isAbsolute(within))throw new BackupError("Unsafe staging cleanup path.");await rm(staging,{recursive:true,force:true});}
 }
 private prepareImport(backup:ValidatedBackup,userId:string,skipped:Set<string>){
  const ids=new Map<string,string>(),paths=new Map<string,string>();const chunkSkip=new Set(backup.data.document_chunks.filter(c=>skipped.has(String(c.document_id))).map(c=>String(c.id)));
  const data=structuredClone(backup.data);
  const skippedWorkspaces=new Set(data.workspaces.filter(w=>{const docs=data.documents.filter(d=>d.workspace_id===w.id);return docs.length>0&&docs.every(d=>skipped.has(String(d.id)));}).map(w=>String(w.id)));
  for(const t of tables)data[t.table]=data[t.table].filter(r=>!skippedWorkspaces.has(String(r.id))&&!skippedWorkspaces.has(String(r.workspace_id))&&!skipped.has(String(r.id))&&!skipped.has(String(r.document_id))&&!skipped.has(String(r.source_id))&&!skipped.has(String(r.target_id))&&!(t.table==="retrieval_runs"&&[...(r.evidence_ids as string[]),...(r.retrieved_chunk_ids as string[])].some(id=>chunkSkip.has(id))));
  for(const t of tables)for(const r of data[t.table])if(typeof r.id==="string")ids.set(r.id,randomUUID());
  // Always remap, including conflict-free IDs, to keep ownership/reference domains isolated.
  for(const r of data.documents)if(r.storage_path!==null)paths.set(ids.get(String(r.id))!,`${userId}/${ids.get(String(r.workspace_id))}/${ids.get(String(r.id))}/original.${extension(r)}`);
  for(const t of tables)data[t.table]=transform(pruneSkipped(data[t.table],skipped),ids,paths,userId) as BackupRow[];
  for(const w of data.workspaces){const docs=data.documents.filter(d=>d.workspace_id===w.id);w.snapshot=recoverSnapshot(WorkspaceSnapshotSchema.parse({...w.snapshot as object,texts:Object.fromEntries(docs.map(d=>[String(d.id),d.text_content]))}));}
  for(const d of data.documents){d.index_generation=null;if(!backup.embeddingCompatible||(!backup.visionCompatible&&d.file_type==="image")||["chunking","embedding"].includes(String(d.index_status))){d.index_status="stale";d.indexed_at=null;d.index_error_code=null;}if(d.file_type==="image"&&!backup.visionCompatible)d.vision_status="stale";}
  if(!backup.visionCompatible)for(const row of data.multimodal_analysis){const a=row.analysis as BackupRow;a.visionStatus="stale";}
  // Nested snapshots must not carry archive-local paths into persisted files.
  for(const w of data.workspaces)w.snapshot=transform(w.snapshot,new Map(),paths,userId);
  validateReferences(data);return{data,ids,paths};
 }
}
