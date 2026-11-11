import { contentHash } from "./chunker";
import { lexicalTokens } from "./lexical-tokens";

export interface EmbeddingModelInfo { provider: string; model: string; dimensions: number; mock: boolean }
export interface EmbeddingResult extends EmbeddingModelInfo { vector: number[] }
export interface EmbeddingProvider {
  embedQuery(text: string): Promise<EmbeddingResult>;
  embedDocuments(texts: string[]): Promise<EmbeddingResult[]>;
  getModelInfo(): EmbeddingModelInfo;
}
export function embeddingCacheKey(contentHash_: string, provider: string, model: string, chunkVersion: string) {
  return contentHash(JSON.stringify([contentHash_, provider, model, chunkVersion]));
}
export function validateVector(vector: number[], dimensions: number) {
  if (!Number.isInteger(dimensions) || dimensions <= 0 || vector.length !== dimensions || vector.some(v => !Number.isFinite(v)) || !vector.some(v => v !== 0)) throw new Error("Invalid embedding vector");
}
// Deliberately token hashing, not a real semantic embedding. Offline tests only.
export class MockEmbeddingProvider implements EmbeddingProvider {
  getModelInfo(): EmbeddingModelInfo { return { provider: "mock", model: "token-hash-fixture-v1", dimensions: 256, mock: true }; }
  async embedQuery(text: string) {
    const vector = Array<number>(256).fill(0);
    for (const token of lexicalTokens(text)) vector[parseInt(contentHash(token).slice(0, 8), 16) % vector.length]++;
    if (!vector.some(Boolean)) vector[0] = 1;
    return { ...this.getModelInfo(), vector };
  }
  async embedDocuments(texts: string[]) { return Promise.all(texts.map(text => this.embedQuery(text))); }
}
