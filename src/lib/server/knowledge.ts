import "server-only";
import { after } from "next/server";
import { database } from "./database";
import { PostgresKnowledgeRepository } from "../retrieval/postgres-knowledge";
import { PortableVectorStore } from "../retrieval/portable-vector-store";
import { getEmbeddingProvider } from "../retrieval/get-embedding-provider";
import { IndexingPipeline } from "../retrieval/indexing";
import type { EmbeddingProvider } from "../retrieval/embedding-provider";
import type { RetrievalScope } from "../retrieval/types";
import { CHUNK_VERSION } from "../retrieval/config";
import { prepareImageIndexes, refreshMultimodalVersions } from "./multimodal";
export const knowledgeRepository = new PostgresKnowledgeRepository(database);
export const vectorStore = new PortableVectorStore(database);
export function configuredEmbedding(): EmbeddingProvider | null { try { return getEmbeddingProvider(); } catch { return null; } }
export async function refreshIndexVersions(scope: RetrievalScope) {
  await refreshMultimodalVersions(scope);
  const info = configuredEmbedding()?.getModelInfo();
  if (!info) return;
  await database.query(scope.userId, `update filemind.documents d set index_status='stale',index_generation=null where d.user_id=$1 and ($2::uuid is null or d.workspace_id=$2) and d.index_status='ready' and (d.embedding_provider is distinct from $3 or d.embedding_model is distinct from $4 or d.chunk_version is distinct from $5 or exists(select 1 from filemind.chunk_embeddings e where e.user_id=$1 and e.document_id=d.id and e.dimensions<>$6))`, [scope.userId, scope.workspaceId ?? null, info.provider, info.model, CHUNK_VERSION, info.dimensions]);
}
export async function indexKnowledge(scope: RetrievalScope, documentId?: string) {
  await prepareImageIndexes(scope, documentId);
  const provider = configuredEmbedding();
  // Publish complete lexical chunks without credentials, preserving an existing
  // ready index if its replacement fails. Mock vectors are never stored here.
  return new IndexingPipeline(knowledgeRepository, vectorStore, provider, process.env).indexLibrary(scope, documentId);
}
export function scheduleKnowledgeIndex(scope: RetrievalScope) {
  after(async () => { await indexKnowledge(scope).catch(() => {}); });
}
export function offlineRAGProvider() {
  // Deterministic extractive output only. Explicit Mock UI and no paid LLM call.
  return {
    name: "mock", models: { main: "extractive-fixture", small: "extractive-fixture" },
    async generateObject<T>(input: { prompt: string; schema: import("zod").z.ZodType<T> }) {
      const payload = JSON.parse(input.prompt) as { evidence: { untrustedSources: { sourceId: string; chunkId: string; documentId: string; content: string }[] } };
      const sources = payload.evidence.untrustedSources;
      return { object: input.schema.parse({statements:sources.flatMap(s=>s.content.slice(0,400).split(/(?<=[。！？!?])|\n+/u).map(line=>line.trim()).filter(Boolean).map(text=>({text,sourceIds:[s.sourceId]}))).slice(0,40),confidence:"low",insufficientEvidence:false,evidenceDecision:{supported:true,missingInformation:[]}}), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    },
    async generateText() { throw new Error("Mock RAG supports extractive output only"); },
    async *streamText() { yield ""; },
    async callTools() { throw new Error("Search has no tools"); },
  };
}
