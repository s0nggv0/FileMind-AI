import { z } from "zod";
import { PostgresDateSchema, type TenantDatabase, type TransactionalTenantDatabase } from "../workspace/postgres-repository";
import { ParsedStructureSchema } from "../workspace/schemas";
import { DocumentChunker } from "./chunker";
import { lexicalTokens } from "./lexical-tokens";
import { CHUNK_VERSION, retrievalConfig } from "./config";
import type { Evidence, IndexDocument, RetrievalScope } from "./types";
import type { DocumentChunk } from "./types";
import { embeddingCacheKey, validateVector, type EmbeddingModelInfo, type EmbeddingResult } from "./embedding-provider";
import type { OperationContext } from "../reliability/operation-journal";
const nullableNumber = z.number().int().nullable();
export const EvidenceSchema = z.object({
  documentUpdatedAt:PostgresDateSchema.optional(),
  chunkSource: z.enum(["text", "ocr", "vision_summary", "concepts", "mixed"]).optional(),
  id: z.uuid(), userId: z.uuid(), workspaceId: z.uuid(), documentId: z.uuid(), chunkIndex: z.number().int(), content: z.string(), contentHash: z.string(),
  pageStart: nullableNumber, pageEnd: nullableNumber, lineStart: nullableNumber, lineEnd: nullableNumber, paragraphStart: nullableNumber, paragraphEnd: nullableNumber,
  headingPath: z.array(z.string()), charStart: z.number().int(), charEnd: z.number().int(), tokenEstimate: z.number().int(), chunkVersion: z.string(),
  documentName: z.string(), fileType: z.string(), summary: z.string(), tags: z.array(z.string()), score: z.number(),
  lexicalCoverage: z.number().optional(),
});
export const evidenceColumns = `c.chunk_source as "chunkSource",c.id,c.user_id as "userId",c.workspace_id as "workspaceId",c.document_id as "documentId",
  c.chunk_index as "chunkIndex",c.content,c.content_hash as "contentHash",c.page_start as "pageStart",c.page_end as "pageEnd",
  c.line_start as "lineStart",c.line_end as "lineEnd",c.paragraph_start as "paragraphStart",c.paragraph_end as "paragraphEnd",
  c.heading_path as "headingPath",c.char_start as "charStart",c.char_end as "charEnd",c.token_estimate as "tokenEstimate",c.chunk_version as "chunkVersion",
  d.display_name as "documentName",d.file_type as "fileType",d.updated_at as "documentUpdatedAt",coalesce(d.summary,'') as summary,
  coalesce((select array_agg(t.tag) from filemind.document_tags t where t.document_id=d.id and t.user_id=d.user_id),'{}') as tags`;
export class PostgresKnowledgeRepository {
  constructor(public readonly db: TenantDatabase, private chunker = new DocumentChunker()) {}
  get transactional(): TransactionalTenantDatabase {
    if (!("transaction" in this.db) || typeof this.db.transaction !== "function") throw new Error("Atomic indexing requires tenant transactions");
    return this.db as TransactionalTenantDatabase;
  }
  async documents(scope: RetrievalScope, documentId?: string): Promise<IndexDocument[]> {
    const result = await this.db.query(scope.userId, `select id,workspace_id,text_content,file_type,metadata from filemind.documents where user_id=$1 and ($2::uuid is null or workspace_id=$2) and ($3::uuid is null or id=$3) and parse_status='completed' order by id`, [scope.userId, scope.workspaceId ?? null, documentId ?? null]);
    const rows = z.array(z.object({ id: z.uuid(), workspace_id: z.uuid(), text_content: z.string(), file_type: z.string(), metadata: z.object({ structure: ParsedStructureSchema.optional() }) })).parse(result.rows);
    return rows.map(d => ({ id: d.id, userId: scope.userId, workspaceId: d.workspace_id, text: d.text_content, fileType: d.file_type, structure: d.metadata.structure }));
  }
  buildChunks(document: IndexDocument) { return this.chunker.chunk(document); }
  async setBuildStatus(document: IndexDocument, id: string, status: string, errorCode?: string) {
    await this.db.query(document.userId, "update filemind.documents set index_build_id=$3,index_build_status=$4,index_build_error_code=$5 where user_id=$1 and id=$2", [document.userId,document.id,id,status,errorCode??null]);
  }
  async activeStatus(document: IndexDocument) {
    const result=await this.db.query(document.userId,"select index_status from filemind.documents where user_id=$1 and id=$2 and workspace_id=$3",[document.userId,document.id,document.workspaceId]);
    return z.object({index_status:z.string()}).parse(result.rows[0]).index_status;
  }
  async publishIndex(document: IndexDocument, op: OperationContext, chunks: DocumentChunk[], embeddings: Map<string,EmbeddingResult>, info: EmbeddingModelInfo|null, errorCode?: string) {
    const ready=Boolean(info && chunks.length && embeddings.size===chunks.length && !errorCode);
    if(info && !ready && embeddings.size) throw new Error("Partial index publication is forbidden");
    for(const chunk of chunks) {
      if(chunk.userId!==document.userId || chunk.documentId!==document.id || chunk.workspaceId!==document.workspaceId) throw new Error("Inaccessible build");
      const vector=embeddings.get(chunk.id);
      if(ready && (!vector || vector.provider!==info!.provider || vector.model!==info!.model || vector.dimensions!==info!.dimensions)) throw new Error("Incomplete index build");
      if(vector) validateVector(vector.vector,info!.dimensions);
    }
    return this.transactional.transaction(document.userId,async tx=> {
      op.assertActive();
      const result=await tx.query("select text_content,file_type,metadata,parse_status,index_build_id from filemind.documents where user_id=$1 and id=$2 and workspace_id=$3 for update",[document.userId,document.id,document.workspaceId]);
      const row=z.object({text_content:z.string(),file_type:z.string(),metadata:z.object({structure:ParsedStructureSchema.optional()}),parse_status:z.string(),index_build_id:z.uuid().nullable()}).parse(result.rows[0]);
      if(row.text_content!==document.text || row.file_type!==document.fileType || row.parse_status!=="completed" || JSON.stringify(row.metadata.structure??null)!==JSON.stringify(document.structure??null) || row.index_build_id!==op.id) throw new Error("Document changed during private index build");
      await tx.query("delete from filemind.document_chunks where user_id=$1 and document_id=$2",[document.userId,document.id]);
      const inserted=await tx.query(`with owned as (select id from filemind.documents where user_id=$1 and id=$2 and workspace_id=$3)
      insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,page_start,page_end,line_start,line_end,paragraph_start,paragraph_end,heading_path,char_start,char_end,token_estimate,chunk_version,lexical_tokens,chunk_source)
      select (v->>'id')::uuid,$1,$3,$2,(v->>'chunkIndex')::integer,v->>'content',v->>'contentHash',(v->>'pageStart')::integer,(v->>'pageEnd')::integer,(v->>'lineStart')::integer,(v->>'lineEnd')::integer,(v->>'paragraphStart')::integer,(v->>'paragraphEnd')::integer,array(select jsonb_array_elements_text(v->'headingPath')),(v->>'charStart')::integer,(v->>'charEnd')::integer,(v->>'tokenEstimate')::integer,v->>'chunkVersion',array(select jsonb_array_elements_text(v->'tokens')),coalesce(v->>'chunkSource','text')
      from jsonb_array_elements($4::jsonb) v where exists(select 1 from owned) returning id`,[document.userId,document.id,document.workspaceId,JSON.stringify(chunks.map(c=>({...c,tokens:lexicalTokens(c.content)})))]);
      if(inserted.rows.length!==chunks.length) throw new Error("Index publication failed");
      if(ready) for(const chunk of chunks) {
        const vector=embeddings.get(chunk.id)!;
        await tx.query("insert into filemind.chunk_embeddings(user_id,workspace_id,document_id,chunk_id,provider,model,dimensions,embedding,embedding_hash,chunk_version) values($1,$2,$3,$4,$5,$6,$7,$8::real[],$9,$10)",[document.userId,document.workspaceId,document.id,chunk.id,vector.provider,vector.model,vector.dimensions,vector.vector,embeddingCacheKey(chunk.contentHash,vector.provider,vector.model,chunk.chunkVersion),chunk.chunkVersion]);
      }
      await tx.query("update filemind.documents set index_status=$4,index_generation=$3,chunk_version=$5,embedding_provider=$6,embedding_model=$7,index_error_code=$8,indexed_at=case when $4='ready' then now() else null end,index_build_status=$9,index_build_error_code=$8 where user_id=$1 and id=$2",[document.userId,document.id,op.id,ready?"ready":"failed",CHUNK_VERSION,info?.provider??null,info?.model??null,errorCode??null,ready?"ready":"failed"]);
      await op.commit(tx);
    });
  }
  async lexicalSearch(scope: RetrievalScope, query: string): Promise<Evidence[]> {
    const tokens = lexicalTokens(query).slice(0, 64);
    if (!tokens.length) return [];
    const result = await this.db.query(scope.userId, `select ${evidenceColumns},
      (select count(*)::float from unnest($3::text[]) q where q=any(c.lexical_tokens)) / cardinality($3::text[]) as "lexicalCoverage",
      (select count(*)::float from unnest($3::text[]) q where q=any(c.lexical_tokens)) as score
      from filemind.document_chunks c join filemind.documents d on d.id=c.document_id and d.user_id=c.user_id
      where c.user_id=$1 and ($2::uuid is null or c.workspace_id=$2) and c.chunk_version=$4 and d.index_status in ('ready','failed') and c.lexical_tokens && $3::text[]
      order by score desc,d.display_name,c.chunk_index,c.id limit $5`, [scope.userId, scope.workspaceId ?? null, tokens, CHUNK_VERSION, retrievalConfig.lexicalTopK]);
    return z.array(EvidenceSchema).parse(result.rows);
  }
  async getSource(scope: RetrievalScope, chunkId: string) {
    const result = await this.db.query(scope.userId, `select ${evidenceColumns},0::float as score from filemind.document_chunks c join filemind.documents d on d.id=c.document_id and d.user_id=c.user_id where c.user_id=$1 and c.id=$2 and ($3::uuid is null or c.workspace_id=$3)`, [scope.userId, chunkId, scope.workspaceId ?? null]);
    return result.rows.length ? EvidenceSchema.parse(result.rows[0]) : null;
  }
  async filenameSearch(scope: RetrievalScope, filename: string): Promise<Evidence[]> {
    const result = await this.db.query(scope.userId, `select ${evidenceColumns},1::float as "lexicalCoverage",1::float as score
      from filemind.document_chunks c join filemind.documents d on d.id=c.document_id and d.user_id=c.user_id
      where c.user_id=$1 and ($2::uuid is null or c.workspace_id=$2) and (lower(d.display_name)=lower($3) or lower(d.original_name)=lower($3))
      and c.chunk_version=$4 and d.index_status in ('ready','failed') order by c.chunk_index,c.id limit $5`, [scope.userId, scope.workspaceId ?? null, filename, CHUNK_VERSION, retrievalConfig.lexicalTopK]);
    return z.array(EvidenceSchema).parse(result.rows);
  }
  async cleanup(scope: RetrievalScope, documentId: string) {
    await this.db.query(scope.userId, `with removed as (delete from filemind.document_chunks where user_id=$1 and document_id=$2 and ($3::uuid is null or workspace_id=$3)), relations as (delete from filemind.document_relations where user_id=$1 and (source_id=$2 or target_id=$2) and ($3::uuid is null or workspace_id=$3)), history as (delete from filemind.retrieval_runs where user_id=$1 and ($3::uuid is null or workspace_id=$3)) update filemind.documents set index_status='not_indexed',indexed_at=null,index_generation=null where user_id=$1 and id=$2 and ($3::uuid is null or workspace_id=$3)`, [scope.userId, documentId, scope.workspaceId ?? null]);
  }
}
