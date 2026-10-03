import { readFile, rm } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { normalizeAIError } from "../ai/errors";
import { validateVector, type EmbeddingProvider, type EmbeddingResult } from "./embedding-provider";
import { CHUNK_VERSION, indexingConfig } from "./config";
import { contentHash } from "./chunker";
import type { VectorStore } from "./vector-store";
import type { DocumentChunk, IndexDocument, RetrievalScope } from "./types";
import type { PostgresKnowledgeRepository } from "./postgres-knowledge";
import { RecoveryService } from "../reliability/recovery";
import { atomicWriteFile } from "../reliability/atomic-file";
import { ensureStorageDirectory } from "../../../scripts/storage-recovery.mjs";

export interface IndexBuildOptions {
  storageRoot?: string;
  forceFreshVectors?: boolean;
  checkpoint?: (stage: "built" | "before_publish" | "committed", progress: number) => Promise<void>;
}
export class IndexingPipeline {
  private config: ReturnType<typeof indexingConfig>;
  constructor(private repository: PostgresKnowledgeRepository, private vectors: VectorStore, private provider: EmbeddingProvider|null, env: Record<string,string|undefined> = {}, private options: IndexBuildOptions = {}) { this.config=indexingConfig(env); }
  async indexDocument(document: IndexDocument) {
    const info=this.provider?.getModelInfo()??null;
    const recovery=new RecoveryService(this.repository.transactional,this.options.storageRoot??process.env.FILE_STORAGE_ROOT?.trim()??".filemind/storage");
    await recovery.recover(document.userId);
    const fingerprint=contentHash(JSON.stringify([document.text,document.fileType,document.structure??null,CHUNK_VERSION,info]));
    return recovery.journal.run(document.userId,"reindex",document.id,{workspaceId:document.workspaceId,fingerprint},async op=> {
      const buildId=op.id;
      await op.stage("chunking",{buildId});
      await this.repository.setBuildStatus(document,buildId,"chunking");
      const owner=await ensureStorageDirectory(join(recovery.storageRoot,".indexes",document.userId));
      const staging=await ensureStorageDirectory(join(owner,buildId));
      const chunks=this.repository.buildChunks(document);
      await atomicWriteFile(join(staging,"chunks.json"),Buffer.from(JSON.stringify(chunks)),{signal:op.signal});
      const embeddings=!this.options.forceFreshVectors && info && this.vectors.getCachedEmbeddings ? await this.vectors.getCachedEmbeddings(document,chunks,info) : new Map<string,EmbeddingResult>();
      const cachedCount=embeddings.size;
      await atomicWriteFile(join(staging,"cached.json"),Buffer.from(JSON.stringify([...embeddings])),{signal:op.signal});
      const pending=chunks.filter(c=>!embeddings.has(c.id));
      const batches:DocumentChunk[][]=[]; for(let i=0;i<pending.length;i+=this.config.batchSize) batches.push(pending.slice(i,i+this.config.batchSize));
      const batchPaths:string[]=[]; let cursor=0,failure:string|undefined=chunks.length?(info?undefined:"CONFIGURATION"):"NO_CONTENT";
      await op.stage("embedding"); await this.repository.setBuildStatus(document,buildId,"embedding");
      if(this.provider && info && !failure) await Promise.all(Array.from({length:Math.min(this.config.concurrency,batches.length)},async()=> {
        while(cursor<batches.length && !failure) {
          const batchIndex=cursor++,batch=batches[batchIndex];
          for(let attempt=0;attempt<=this.config.retries;attempt++) {
            try {
              op.assertActive();
              const results=await this.provider!.embedDocuments(batch.map(c=>c.content));
              op.assertActive();
              if(results.length!==batch.length) throw new Error("Invalid Embedding batch size");
              for(const result of results) {
                if(result.model!==info.model || result.provider!==info.provider || result.dimensions!==info.dimensions) throw new Error("Embedding configuration changed");
                validateVector(result.vector,info.dimensions);
              }
              const path=join(staging,`batch-${batchIndex}.json`), pairs=batch.map((c,i)=>[c.id,results[i]] as const);
              await atomicWriteFile(path,Buffer.from(JSON.stringify(pairs)),{signal:op.signal}); batchPaths.push(path);
              for(const [id,result] of pairs) embeddings.set(id,result);
              await op.stage("building_vectors"); await this.options.checkpoint?.("built",embeddings.size/Math.max(chunks.length,1)); break;
            } catch(error) {
              op.assertActive();
              const normalized=normalizeAIError(error,info.provider);
              if(attempt===this.config.retries || !normalized.retryable) {failure=normalized.code;break;}
              await new Promise(done=>setTimeout(done,200*2**attempt));
            }
          }
        }
      }));
      if(failure) {
        await this.repository.setBuildStatus(document,buildId,"failed",failure);
        if(await this.repository.activeStatus(document)==="ready") throw new Error("Replacement build failed; the previous index remains available");
        // An initial index may publish complete lexical chunks when embedding
        // fails, without vectors or a semantic-ready claim.
        embeddings.clear();
      }
      await op.stage("ready_to_publish"); await this.options.checkpoint?.("before_publish",1);
      op.assertActive();
      if(JSON.stringify(JSON.parse(await readFile(join(staging,"chunks.json"),"utf8")))!==JSON.stringify(chunks)) throw new Error("Private chunk integrity failed");
      if(!failure) {
        const persisted=new Map<string,EmbeddingResult>(JSON.parse(await readFile(join(staging,"cached.json"),"utf8")));
        for(const path of batchPaths) for(const [id,result] of JSON.parse(await readFile(path,"utf8")) as [string,EmbeddingResult][]) persisted.set(id,result);
        if(persisted.size!==chunks.length || JSON.stringify([...persisted].sort())!==JSON.stringify([...embeddings].sort())) throw new Error("Private vector integrity failed");
      }
      op.assertActive();
      await this.repository.publishIndex(document,op,chunks,embeddings,failure?null:info,failure);
      await this.options.checkpoint?.("committed",1);
      const within=relative(owner,staging); if(!within || within.startsWith("..") || isAbsolute(within)) throw new Error("Unsafe index cleanup");
      op.assertActive(); await rm(staging,{recursive:true,force:true});
      await recovery.db.query(document.userId,"update filemind.operation_journal set stage='settled',updated_at=now() where user_id=$1 and id=$2 and status='committed'",[document.userId,op.id]);
      return {documentId:document.id,chunks:chunks.length,embedded:failure?0:pending.length,cached:cachedCount,status:failure?"failed":"ready",errorCode:failure};
    },async row=> {
      await recovery.rollback(row);
      await this.repository.setBuildStatus(document,row.id,"failed","BUILD_FAILED");
    });
  }
  async indexLibrary(scope: RetrievalScope, documentId?: string) {
    const results=[];
    for(const document of await this.repository.documents(scope,documentId)) {
      try {results.push(await this.indexDocument(document));}
      catch {results.push({documentId:document.id,status:"failed",errorCode:"INDEX_UNAVAILABLE"});}
    }
    return results;
  }
}
