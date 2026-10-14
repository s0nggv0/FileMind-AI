import type { EmbeddingModelInfo } from "./embedding-provider";
import type { SearchResult } from "./search-contract";
import type { RetrievalScope } from "./types";

export interface SavedSearch {
  query: string;
  result: SearchResult;
}

export interface SearchDiagnostics {
  embedding: EmbeddingModelInfo | null;
  candidateIds: string[];
  reranker: string;
  latency: Record<string, number>;
}

export interface SearchHistory {
  get(scope: RetrievalScope, id: string): Promise<SavedSearch | undefined>;
  list(userId: string): Promise<unknown[]>;
  save(scope: RetrievalScope, result: SearchResult, diagnostics: SearchDiagnostics): Promise<void>;
}
