import { z } from "zod";
import type { TenantDatabase } from "../workspace/postgres-repository";
import { ParsedStructureSchema } from "../workspace/schemas";
import { DocumentChunker } from "./chunker";
import { lexicalTokens } from "./lexical-tokens";
import { CHUNK_VERSION, retrievalConfig } from "./config";
import type { Evidence, IndexDocument, RetrievalScope } from "./types";
const nullableNumber = z.number().int().nullable();
export const EvidenceSchema = z.object({
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
  d.display_name as "documentName",d.file_type as "fileType",coalesce(d.summary,'') as summary,
  coalesce((select array_agg(t.tag) from filemind.document_tags t where t.document_id=d.id and t.user_id=d.user_id),'{}') as tags`;
export class PostgresKnowledgeRepository {
  constructor(public readonly db: TenantDatabase, private chunker = new DocumentChunker()) {}
  async documents(scope: RetrievalScope, documentId?: string): Promise<IndexDocument[]> {
    const result = await this.db.query(scope.userId, `select id,workspace_id,text_content,file_type,metadata from filemind.documents where user_id=$1 and ($2::uuid is null or workspace_id=$2) and ($3::uuid is null or id=$3) and parse_status='completed' order by id`, [scope.userId, scope.workspaceId ?? null, documentId ?? null]);
    const rows = z.array(z.object({ id: z.uuid(), workspace_id: z.uuid(), text_content: z.string(), file_type: z.string(), metadata: z.object({ structure: ParsedStructureSchema.optional() }) })).parse(result.rows);
    return rows.map(d => ({ id: d.id, userId: scope.userId, workspaceId: d.workspace_id, text: d.text_content, fileType: d.file_type, structure: d.metadata.structure }));
  }
  async prepareChunks(document: IndexDocument, generation: string) {
    const chunks = this.chunker.chunk(document);
    const updated = await this.db.query(document.userId, `update filemind.documents set index_status='chunking', index_generation=$4, index_error_code=null where id=$2 and user_id=$1 and workspace_id=$3 and (index_status not in ('chunking','embedding') or updated_at < now()-interval '3 minutes') returning id`, [document.userId, document.id, document.workspaceId, generation]);
    if (!updated.rows.length) throw new Error("Index already active or document inaccessible");
    // Preserve unchanged chunks and their cached embeddings; delete removed IDs.
    // A data-modifying CTE does not order DELETE before INSERT. Changed chunk IDs
    // can otherwise collide with the unique(document_id,chunk_index) constraint.
    await this.db.query(document.userId, `delete from filemind.document_chunks where user_id=$1 and document_id=$2 and not(id=any($5::uuid[])) and exists(select 1 from filemind.documents where user_id=$1 and id=$2 and workspace_id=$3 and index_generation=$4)`, [document.userId, document.id, document.workspaceId, generation, chunks.map(c => c.id)]);
    const result = await this.db.query(document.userId, `with owned as (select id from filemind.documents where user_id=$1 and id=$2 and workspace_id=$3 and index_generation=$4)
      insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,page_start,page_end,line_start,line_end,paragraph_start,paragraph_end,heading_path,char_start,char_end,token_estimate,chunk_version,lexical_tokens,chunk_source)
      select (v->>'id')::uuid,$1,$3,$2,(v->>'chunkIndex')::integer,v->>'content',v->>'contentHash',(v->>'pageStart')::integer,(v->>'pageEnd')::integer,(v->>'lineStart')::integer,(v->>'lineEnd')::integer,(v->>'paragraphStart')::integer,(v->>'paragraphEnd')::integer,array(select jsonb_array_elements_text(v->'headingPath')),(v->>'charStart')::integer,(v->>'charEnd')::integer,(v->>'tokenEstimate')::integer,v->>'chunkVersion',array(select jsonb_array_elements_text(v->'tokens')),coalesce(v->>'chunkSource','text')
      from jsonb_array_elements($5::jsonb) v where exists(select 1 from owned)
      on conflict(id) do update set updated_at=now() returning id`, [document.userId, document.id, document.workspaceId, generation, JSON.stringify(chunks.map(c => ({ ...c, tokens: lexicalTokens(c.content) })))]);
    if (result.rows.length !== chunks.length) throw new Error("Document changed during chunking");
    return chunks;
  }
  async setStatus(document: IndexDocument, generation: string, status: string, info?: { provider: string; model: string }, errorCode?: string) {
    const result = await this.db.query(document.userId, `update filemind.documents set index_status=$5,updated_at=now(),chunk_version=$6,embedding_provider=$7,embedding_model=$8,index_error_code=$9,indexed_at=case when $5='ready' then now() else null end where user_id=$1 and id=$2 and workspace_id=$3 and index_generation=$4 returning id`, [document.userId, document.id, document.workspaceId, generation, status, CHUNK_VERSION, info?.provider ?? null, info?.model ?? null, errorCode ?? null]);
    if (!result.rows.length) throw new Error("Index generation expired");
  }
  async lexicalSearch(scope: RetrievalScope, query: string): Promise<Evidence[]> {
    const tokens = lexicalTokens(query).slice(0, 64);
    if (!tokens.length) return [];
    const result = await this.db.query(scope.userId, `select ${evidenceColumns},
      (select count(*)::float from unnest($3::text[]) q where q=any(c.lexical_tokens)) / cardinality($3::text[]) as "lexicalCoverage",
      (select count(*)::float from unnest($3::text[]) q where q=any(c.lexical_tokens)) as score
      from filemind.document_chunks c join filemind.documents d on d.id=c.document_id and d.user_id=c.user_id
      where c.user_id=$1 and ($2::uuid is null or c.workspace_id=$2) and c.chunk_version=$4 and d.index_status in ('embedding','ready','failed') and c.lexical_tokens && $3::text[]
      order by score desc,d.display_name,c.chunk_index,c.id limit $5`, [scope.userId, scope.workspaceId ?? null, tokens, CHUNK_VERSION, retrievalConfig.lexicalTopK]);
    return z.array(EvidenceSchema).parse(result.rows);
  }
  async getSource(scope: RetrievalScope, chunkId: string) {
    const result = await this.db.query(scope.userId, `select ${evidenceColumns},0::float as score from filemind.document_chunks c join filemind.documents d on d.id=c.document_id and d.user_id=c.user_id where c.user_id=$1 and c.id=$2 and ($3::uuid is null or c.workspace_id=$3)`, [scope.userId, chunkId, scope.workspaceId ?? null]);
    return result.rows.length ? EvidenceSchema.parse(result.rows[0]) : null;
  }
  async cleanup(scope: RetrievalScope, documentId: string) {
    await this.db.query(scope.userId, `with removed as (delete from filemind.document_chunks where user_id=$1 and document_id=$2 and ($3::uuid is null or workspace_id=$3)), relations as (delete from filemind.document_relations where user_id=$1 and (source_id=$2 or target_id=$2) and ($3::uuid is null or workspace_id=$3)), history as (delete from filemind.retrieval_runs where user_id=$1 and ($3::uuid is null or workspace_id=$3)) update filemind.documents set index_status='not_indexed',indexed_at=null,index_generation=null where user_id=$1 and id=$2 and ($3::uuid is null or workspace_id=$3)`, [scope.userId, documentId, scope.workspaceId ?? null]);
  }
}
