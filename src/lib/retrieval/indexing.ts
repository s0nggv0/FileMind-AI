import { randomUUID } from "node:crypto";
import { normalizeAIError } from "../ai/errors";
import { embeddingCacheKey, validateVector, type EmbeddingProvider } from "./embedding-provider";
import { indexingConfig } from "./config";
import type { VectorStore } from "./vector-store";
import type { DocumentChunk, IndexDocument, RetrievalScope } from "./types";
import type { PostgresKnowledgeRepository } from "./postgres-knowledge";

export class IndexingPipeline {
  private config: ReturnType<typeof indexingConfig>;
  constructor(private repository: PostgresKnowledgeRepository, private vectors: VectorStore, private provider: EmbeddingProvider, env: Record<string, string | undefined> = {}) { this.config = indexingConfig(env); }
  async indexDocument(document: IndexDocument) {
    const generation = randomUUID();
    const chunks = await this.repository.prepareChunks(document, generation);
    const info = this.provider.getModelInfo();
    await this.repository.setStatus(document, generation, "embedding", info);
    const cached = await this.vectors.getEmbeddingStatus(document, chunks.map(c => c.id), info);
    const pending = chunks.filter(c => cached.get(c.id) !== embeddingCacheKey(c.contentHash, info.provider, info.model, c.chunkVersion));
    const batches: DocumentChunk[][] = [];
    for (let i = 0; i < pending.length; i += this.config.batchSize) batches.push(pending.slice(i, i + this.config.batchSize));
    let cursor = 0; let failure: string | undefined;
    const workers = Array.from({ length: Math.min(this.config.concurrency, batches.length) }, async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        for (let attempt = 0; attempt <= this.config.retries; attempt++) {
          try {
            const results = await this.provider.embedDocuments(batch.map(c => c.content));
            if (results.length !== batch.length) throw new Error("Invalid Embedding batch size");
            for (let i = 0; i < batch.length; i++) {
              const result = results[i];
              if (result.model !== info.model || result.provider !== info.provider || result.dimensions !== info.dimensions) throw new Error("Embedding configuration changed");
              validateVector(result.vector, info.dimensions);
              await this.vectors.upsertEmbedding(document, batch[i], result, embeddingCacheKey(batch[i].contentHash, info.provider, info.model, batch[i].chunkVersion));
            }
            break;
          } catch (error) {
            const normalized = normalizeAIError(error, info.provider);
            if (attempt === this.config.retries || !normalized.retryable) { failure = normalized.code; break; }
            await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
          }
        }
      }
    });
    await Promise.all(workers);
    await this.repository.setStatus(document, generation, failure ? "failed" : "ready", info, failure);
    return { documentId: document.id, chunks: chunks.length, embedded: pending.length, cached: chunks.length - pending.length, status: failure ? "failed" : "ready", errorCode: failure };
  }
  async indexLibrary(scope: RetrievalScope, documentId?: string) {
    const documents = await this.repository.documents(scope, documentId);
    const results = [];
    // Document scheduling is sequential; embedding workers are bounded globally
    // within this request. A failed document does not strand the remaining ones.
    for (const document of documents) {
      try { results.push(await this.indexDocument(document)); }
      catch { results.push({ documentId: document.id, status: "failed", errorCode: "INDEX_UNAVAILABLE" }); }
    }
    return results;
  }
}
