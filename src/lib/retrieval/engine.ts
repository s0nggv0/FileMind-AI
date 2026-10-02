import type { EmbeddingProvider } from "./embedding-provider";
import type { VectorStore } from "./vector-store";
import type { Evidence, RetrievalScope } from "./types";
import { rankFusion, type Reranker } from "./ranking";
import { retrievalConfig } from "./config";
export interface LexicalSearchProvider { lexicalSearch(scope: RetrievalScope, query: string): Promise<Evidence[]> }
export class RetrievalEngine {
  constructor(private embeddings: EmbeddingProvider | null, private vectors: VectorStore, private lexical: LexicalSearchProvider, private reranker: Reranker | null) {}
  async retrieve(scope: RetrievalScope, query: string, onStage: (stage: string) => void = () => {}) {
    const normalized = query.normalize("NFKC").replace(/\s+/g, " ").trim();
    const latency = { queryEmbedding: 0, vector: 0, lexical: 0, rerank: 0 };
    let semanticUnavailable = !this.embeddings;
    onStage("Searching your knowledge");
    const semanticTask = (async () => {
      if (!this.embeddings) return [];
      try {
        onStage("Semantic retrieval"); let time = performance.now();
        const vector = await this.embeddings.embedQuery(normalized); latency.queryEmbedding = performance.now() - time;
        time = performance.now();
        const result = await this.vectors.searchSimilar(scope, vector, retrievalConfig.vectorTopK); latency.vector = performance.now() - time;
        return result;
      } catch { semanticUnavailable = true; return []; }
    })();
    const lexicalTask = (async () => {
      onStage("Matching keywords"); const time = performance.now();
      const result = await this.lexical.lexicalSearch(scope, normalized); latency.lexical = performance.now() - time;
      return result;
    })();
    const [semantic, lexical] = await Promise.all([semanticTask, lexicalTask]);
    onStage("Ranking evidence");
    const fused = rankFusion(semantic, lexical);
    const started = performance.now();
    const ranked = this.reranker ? await this.reranker.rerank(normalized, fused.slice(0, retrievalConfig.candidateLimit)) : fused.slice(0, retrievalConfig.candidateLimit);
    latency.rerank = performance.now() - started;
    const strong = ranked.filter(e => (e.lexicalCoverage ?? 0) >= retrievalConfig.minimumLexicalCoverage || (e.semanticScore ?? 0) >= retrievalConfig.minimumCosine);
    return { query: normalized, semantic, lexical, fused, evidence: strong.slice(0, retrievalConfig.evidenceLimit), nearest: ranked.slice(0, 5), semanticUnavailable, mock: this.embeddings?.getModelInfo().mock ?? false, reranker: this.reranker ? "deterministic" : "disabled", latency };
  }
}
