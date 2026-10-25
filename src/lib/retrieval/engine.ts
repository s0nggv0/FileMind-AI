import { uniquePassages, diversePassages } from "./evidence-diversity";
import { questionIntent } from "./question-intent";
import type { EmbeddingProvider } from "./embedding-provider";
import type { VectorStore } from "./vector-store";
import type { CandidateOptions, Evidence, RetrievalScope } from "./types";
import { rankFusion, type Reranker } from "./ranking";
import { retrievalConfig } from "./config";
import { QueryAnalyzer } from "./query-analyzer";
import { RetrievalRouter } from "./retrieval-router";
export interface LexicalSearchProvider {
  lexicalSearch(scope: RetrievalScope, query: string, options?: CandidateOptions): Promise<Evidence[]>;
  filenameSearch?(scope: RetrievalScope, query: string): Promise<Evidence[]>;
}
export class RetrievalEngine {
  constructor(private embeddings: EmbeddingProvider | null, private vectors: VectorStore, private lexical: LexicalSearchProvider, private reranker: Reranker | null = null) {}
  async retrieve(scope: RetrievalScope, query: string, onStage: (stage: string) => void = () => {}, options: { mode?: "ask" | "find" } = {}) {
    const normalized = query.normalize("NFKC").replace(/\s+/g, " ").trim();
    const multiSource = questionIntent(normalized) === "multi_source" && (scope.documentIds?.length ?? 2) > 1;
    const candidateOptions = { documentCoverage: multiSource };
    const accessible = (e: Evidence) => e.userId === scope.userId && (!scope.workspaceId || e.workspaceId === scope.workspaceId) && (!scope.documentIds || scope.documentIds.includes(e.documentId));
    const profile = new QueryAnalyzer().analyze(normalized);
    let route = new RetrievalRouter().route(profile, !!this.embeddings);
    if (options.mode === "find" && route.strategy === "VECTOR_ONLY") route = { strategy: "VECTOR_WITH_LEXICAL_BOOST", reason: "Passage lookup includes literal text matches as well as semantic candidates." };
    const latency = { queryEmbedding: 0, vector: 0, lexical: 0, rerank: 0 };
    let semanticUnavailable = !this.embeddings;
    let semantic: Evidence[] = [], lexical: Evidence[] = [];
    onStage("Searching your knowledge");
    const vectorSearch = async () => {
      if (!this.embeddings) return [];
      try {
        let time = performance.now();
        const vector = await this.embeddings.embedQuery(normalized); latency.queryEmbedding = performance.now() - time;
        time = performance.now();
        const result = await this.vectors.searchSimilar(scope, vector, retrievalConfig.vectorTopK, candidateOptions); latency.vector = performance.now() - time;
        return result.filter(accessible).map(e => ({ ...e, semanticScore: e.semanticScore ?? e.score, retrievalSource: "semantic" as const }));
      } catch { semanticUnavailable = true; route = new RetrievalRouter().route(profile, false); return []; }
    };
    const lexicalSearch = async (filename = false) => {
      const time = performance.now();
      const result = filename && this.lexical.filenameSearch
        ? await this.lexical.filenameSearch(scope, profile.exactTerms.find(t => /\./.test(t)) ?? normalized)
        : await this.lexical.lexicalSearch(scope, normalized, candidateOptions);
      latency.lexical += performance.now() - time;
      return result.filter(accessible).map(e => ({ ...e, retrievalSource: "lexical" as const }));
    };
    if (route.strategy === "VECTOR_ONLY") {
      semantic = await vectorSearch();
      if (semanticUnavailable || !semantic.some(e => (e.semanticScore ?? e.score) >= retrievalConfig.minimumCosine) || questionIntent(normalized) === "multi_source") lexical = await lexicalSearch();
    } else if (route.strategy === "VECTOR_WITH_LEXICAL_BOOST") {
      [semantic, lexical] = await Promise.all([vectorSearch(), lexicalSearch()]);
    } else {
      lexical = await lexicalSearch(route.strategy === "FILENAME_SEARCH");
      if (!lexical.some(e => (e.lexicalCoverage ?? 0) >= 0.5) && !semanticUnavailable) semantic = await vectorSearch();
    }
    const fused = semantic.length && lexical.length && route.strategy === "VECTOR_WITH_LEXICAL_BOOST"
      ? rankFusion(semantic, lexical)
      : route.strategy === "VECTOR_ONLY" ? [...semantic, ...lexical].filter((e, i, all) => all.findIndex(v => v.id === e.id) === i)
      : [...lexical, ...semantic].filter((e, i, all) => all.findIndex(v => v.id === e.id) === i);
    const started = performance.now();
    const candidates = multiSource ? diversePassages(fused, retrievalConfig.candidateLimit) : uniquePassages(fused).slice(0, retrievalConfig.candidateLimit);
    const ranked = this.reranker ? await this.reranker.rerank(normalized, candidates) : candidates;
    latency.rerank = this.reranker ? performance.now() - started : 0;
    const strong = ranked.filter(e => (e.lexicalCoverage ?? 0) >= retrievalConfig.minimumLexicalCoverage || (e.semanticScore ?? 0) >= retrievalConfig.minimumCosine);
    return { query: normalized, profile, route, semantic, lexical, fused, evidence: multiSource ? diversePassages(strong, retrievalConfig.evidenceLimit) : strong.slice(0, retrievalConfig.evidenceLimit), nearest: ranked.slice(0, 5), semanticUnavailable, mock: this.embeddings?.getModelInfo().mock ?? false, reranker: this.reranker ? "deterministic" : "disabled", latency };
  }
}
