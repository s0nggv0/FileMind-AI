export const CHUNK_VERSION = "chunk-v1";
export const retrievalConfig = {
  chunkTargetTokens: 800, chunkMaxTokens: 1000, overlapTokens: 100,
  vectorTopK: 20, lexicalTopK: 20, rrfK: 60, candidateLimit: 15, evidenceLimit: 7,
  minimumCosine: 0.35, minimumLexicalCoverage: 0.2, contextMaxCharacters: 24000,
  coverageDocumentLimit: 30,
};
export function indexingConfig(env: Record<string, string | undefined>) {
  const integer = (value: string | undefined, fallback: number, max: number) => {
    const number = value ? Number(value) : fallback;
    if (!Number.isInteger(number) || number < 1 || number > max) throw new Error("Invalid indexing configuration");
    return number;
  };
  return { batchSize: integer(env.EMBEDDING_BATCH_SIZE, 16, 128), concurrency: integer(env.EMBEDDING_CONCURRENCY, 2, 8), retries: 2, rerankEnabled: env.RAG_RERANK_ENABLED === "true" };
}
