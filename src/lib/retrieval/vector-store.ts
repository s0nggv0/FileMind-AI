import type { DocumentChunk, Evidence, RetrievalScope } from "./types";
import type { EmbeddingModelInfo, EmbeddingResult } from "./embedding-provider";
export interface VectorStore {
  upsertEmbedding(scope: RetrievalScope, chunk: DocumentChunk, embedding: EmbeddingResult, cacheKey: string): Promise<void>;
  deleteDocumentEmbeddings(scope: RetrievalScope, documentId: string): Promise<void>;
  searchSimilar(scope: RetrievalScope, embedding: EmbeddingResult, topK: number): Promise<Evidence[]>;
  getEmbeddingStatus(scope: RetrievalScope, chunkIds: string[], info: EmbeddingModelInfo): Promise<Map<string, string>>;
}
export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length || [...a, ...b].some(n => !Number.isFinite(n))) throw new Error("Incompatible vectors");
  let dot = 0; let normA = 0; let normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] ** 2; normB += b[i] ** 2; }
  return normA && normB ? Math.max(-1, Math.min(1, dot / Math.sqrt(normA * normB))) : 0;
}
