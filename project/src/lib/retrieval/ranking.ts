import type { Evidence } from "./types";
import { retrievalConfig } from "./config";
import { lexicalTokens } from "./lexical-tokens";
export function rankFusion(semantic: Evidence[], lexical: Evidence[], k = retrievalConfig.rrfK) {
  if (k < 1) throw new Error("Invalid RRF constant");
  const map = new Map<string, Evidence>();
  for (const [source, list] of [["semantic", semantic], ["lexical", lexical]] as const) {
    const seen = new Set<string>(); let rank = 0;
    for (const item of list) {
      if (seen.has(item.id)) continue; seen.add(item.id); rank++;
      const old = map.get(item.id);
      map.set(item.id, { ...item, ...old, lexicalCoverage: source === "lexical" ? item.lexicalCoverage : old?.lexicalCoverage, semanticScore: source === "semantic" ? item.score : old?.semanticScore, retrievalSource: old ? "both" : source, score: (old?.score ?? 0) + 1 / (k + rank) });
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((item, index) => ({ ...item, fusedRank: index + 1 }));
}
export interface Reranker { rerank(query: string, candidates: Evidence[]): Promise<Evidence[]> }
export class DeterministicReranker implements Reranker {
  async rerank(query: string, candidates: Evidence[]) {
    const tokens = lexicalTokens(query);
    const relevance = (item: Evidence) => {
      const titleTokens = new Set(lexicalTokens(item.documentName + " " + item.headingPath.join(" ")));
      const titleMatches = tokens.filter(t => titleTokens.has(t)).length / Math.max(tokens.length, 1);
      return item.score + titleMatches / 100;
    };
    return [...candidates].sort((a, b) => relevance(b) - relevance(a) || (a.fusedRank ?? 0) - (b.fusedRank ?? 0));
  }
}
