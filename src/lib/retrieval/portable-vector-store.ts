import { z } from "zod";
import type { TenantDatabase } from "../workspace/postgres-repository";
import { CHUNK_VERSION } from "./config";
import { EvidenceSchema, evidenceColumns } from "./postgres-knowledge";
import { embeddingCacheKey, validateVector, type EmbeddingModelInfo, type EmbeddingResult } from "./embedding-provider";
import type { DocumentChunk, Evidence, RetrievalScope } from "./types";
import { cosineSimilarity, type VectorStore } from "./vector-store";
export class PortableVectorStore implements VectorStore {
  constructor(private db: TenantDatabase) {}
  async upsertEmbedding(scope: RetrievalScope, chunk: DocumentChunk, embedding: EmbeddingResult, cacheKey: string) {
    if (chunk.userId !== scope.userId || (scope.workspaceId && chunk.workspaceId !== scope.workspaceId)) throw new Error("Inaccessible chunk");
    validateVector(embedding.vector, embedding.dimensions);
    const result = await this.db.query(scope.userId, `insert into filemind.chunk_embeddings(user_id,workspace_id,document_id,chunk_id,provider,model,dimensions,embedding,embedding_hash,chunk_version)
      select c.user_id,c.workspace_id,c.document_id,c.id,$5,$6,$7,$8::real[],$9,$10 from filemind.document_chunks c where c.user_id=$1 and c.id=$2 and c.workspace_id=$3 and c.document_id=$4 and c.content_hash=$11
      on conflict(chunk_id,provider,model,chunk_version) do update set embedding=excluded.embedding,embedding_hash=excluded.embedding_hash,dimensions=excluded.dimensions returning id`, [scope.userId, chunk.id, chunk.workspaceId, chunk.documentId, embedding.provider, embedding.model, embedding.dimensions, embedding.vector, cacheKey, chunk.chunkVersion, chunk.contentHash]);
    if (!result.rows.length) throw new Error("Chunk changed during embedding");
  }
  async deleteDocumentEmbeddings(scope: RetrievalScope, documentId: string) {
    await this.db.query(scope.userId, "delete from filemind.chunk_embeddings where user_id=$1 and document_id=$2 and ($3::uuid is null or workspace_id=$3)", [scope.userId, documentId, scope.workspaceId ?? null]);
  }
  async getEmbeddingStatus(scope: RetrievalScope, chunkIds: string[], info: EmbeddingModelInfo) {
    const result = await this.db.query(scope.userId, `select chunk_id,embedding_hash from filemind.chunk_embeddings where user_id=$1 and ($2::uuid is null or workspace_id=$2) and chunk_id=any($3::uuid[]) and provider=$4 and model=$5 and dimensions=$6 and chunk_version=$7`, [scope.userId, scope.workspaceId ?? null, chunkIds, info.provider, info.model, info.dimensions, CHUNK_VERSION]);
    return new Map(z.array(z.object({ chunk_id: z.uuid(), embedding_hash: z.string() })).parse(result.rows).map(r => [r.chunk_id, r.embedding_hash]));
  }
  async searchSimilar(scope: RetrievalScope, embedding: EmbeddingResult, topK: number): Promise<Evidence[]> {
    validateVector(embedding.vector, embedding.dimensions);
    if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new Error("Invalid top K");
    const scan = async (db:TenantDatabase) => {
    const best: Evidence[] = []; let cursor: string | null = null;
    // Page through the complete accessible index. Keep only top K in memory.
    while (true) {
      const result = await db.query(scope.userId, `select ${evidenceColumns},0::float as score,e.embedding from filemind.chunk_embeddings e
        join filemind.document_chunks c on c.id=e.chunk_id and c.user_id=e.user_id join filemind.documents d on d.id=c.document_id and d.user_id=c.user_id
        where e.user_id=$1 and ($2::uuid is null or e.workspace_id=$2) and e.provider=$3 and e.model=$4 and e.dimensions=$5 and e.chunk_version=$6 and c.chunk_version=$6
        and d.index_status='ready' and d.embedding_provider=$3 and d.embedding_model=$4 and ($7::uuid is null or c.id > $7) order by c.id limit 200`, [scope.userId, scope.workspaceId ?? null, embedding.provider, embedding.model, embedding.dimensions, CHUNK_VERSION, cursor]);
      const rows = z.array(EvidenceSchema.extend({ embedding: z.array(z.number()) })).parse(result.rows);
      for (const row of rows) {
        const score = cosineSimilarity(row.embedding, embedding.vector);
        const { embedding: _vector, ...source } = row; void _vector;
        best.push({ ...source, score, semanticScore: score });
        best.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)); best.length = Math.min(best.length, topK);
      }
      if (rows.length < 200) break;
      cursor = rows.at(-1)!.id;
    }
    return best;
    };
    // One repeatable-read snapshot spans every page. A replacement committed
    // mid-scan cannot mix old and new chunks in a single retrieval result.
    if("transaction" in this.db && typeof this.db.transaction==="function") {
      const db=this.db as import("../workspace/postgres-repository").TransactionalTenantDatabase;
      return db.transaction(scope.userId,tx=>scan({query:(_u,s,p)=>tx.query(s,p)}),true);
    }
    return scan(this.db);
  }
  async getCachedEmbeddings(scope: RetrievalScope, chunks: DocumentChunk[], info: EmbeddingModelInfo) {
    const result=await this.db.query(scope.userId,"select chunk_id,embedding_hash,embedding from filemind.chunk_embeddings where user_id=$1 and ($2::uuid is null or workspace_id=$2) and chunk_id=any($3::uuid[]) and provider=$4 and model=$5 and dimensions=$6 and chunk_version=$7",[scope.userId,scope.workspaceId??null,chunks.map(c=>c.id),info.provider,info.model,info.dimensions,CHUNK_VERSION]);
    const cached=new Map<string,EmbeddingResult>();
    for(const row of z.array(z.object({chunk_id:z.uuid(),embedding_hash:z.string(),embedding:z.array(z.number())})).parse(result.rows)) {
      const chunk=chunks.find(c=>c.id===row.chunk_id);
      if(!chunk || row.embedding_hash!==embeddingCacheKey(chunk.contentHash,info.provider,info.model,chunk.chunkVersion)) continue;
      validateVector(row.embedding,info.dimensions); cached.set(row.chunk_id,{...info,vector:row.embedding});
    }
    return cached;
  }
}
