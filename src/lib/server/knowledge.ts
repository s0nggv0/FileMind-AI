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
export const knowledgeRepository = new PostgresKnowledgeRepository(database);
export const vectorStore = new PortableVectorStore(database);
export function configuredEmbedding(): EmbeddingProvider | null { try { return getEmbeddingProvider(); } catch { return null; } }
export async function refreshIndexVersions(scope: RetrievalScope) {
  const info = configuredEmbedding()?.getModelInfo();
  if (!info) return;
  await database.query(scope.userId, `update filemind.documents d set index_status='stale',index_generation=null where d.user_id=$1 and ($2::uuid is null or d.workspace_id=$2) and d.index_status='ready' and (d.embedding_provider is distinct from $3 or d.embedding_model is distinct from $4 or d.chunk_version is distinct from $5 or exists(select 1 from filemind.chunk_embeddings e where e.user_id=$1 and e.document_id=d.id and e.dimensions<>$6))`, [scope.userId, scope.workspaceId ?? null, info.provider, info.model, CHUNK_VERSION, info.dimensions]);
}
export async function indexKnowledge(scope: RetrievalScope, documentId?: string) {
  const provider = configuredEmbedding();
  if (provider) return new IndexingPipeline(knowledgeRepository, vectorStore, provider, process.env).indexLibrary(scope, documentId);
  // Even without credentials, keep genuine lexical chunks available. Never save
  // mock vectors implicitly or mark the semantic index as ready.
  const documents = await knowledgeRepository.documents(scope, documentId); const results = [];
  for (const document of documents) {
    const generation = crypto.randomUUID();
    try {
      const chunks = await knowledgeRepository.prepareChunks(document, generation);
      await knowledgeRepository.setStatus(document, generation, "failed", undefined, "CONFIGURATION");
      results.push({ documentId: document.id, chunks: chunks.length, status: "failed", errorCode: "CONFIGURATION" });
    } catch { results.push({ documentId: document.id, status: "failed", errorCode: "INDEX_UNAVAILABLE" }); }
  }
  return results;
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
      return { object: input.schema.parse({ answer: sources.map(s => `${s.content.slice(0, 400)} [${s.sourceId}]`).join("\n\n"), citations: sources.map(s => ({ sourceId: s.sourceId, chunkId: s.chunkId, documentId: s.documentId })), confidence: "low", insufficientEvidence: false }), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    },
    async generateText() { throw new Error("Mock RAG supports extractive output only"); },
    async *streamText() { yield ""; },
    async callTools() { throw new Error("Search has no tools"); },
  };
}
