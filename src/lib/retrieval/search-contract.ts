import { z } from "zod";
import type { RAGAnswer, RAGSource } from "./rag";
import type { QueryProfile } from "./query-analyzer";
import type { RetrievalRoute } from "./retrieval-router";
import type { EvidenceAssessment } from "./evidence-sufficiency";
import type { VerificationReport } from "./answer-verifier";
export const SearchRequestSchema = z.object({ query: z.string().trim().min(1).max(1500), mode: z.enum(["ask", "find"]), workspaceId: z.uuid().optional(), previousRunId: z.uuid().optional() }).strict();
export interface SearchResult {
  id: string; query: string; rewrittenQuery: string; mode: "ask" | "find";
  answer: RAGAnswer | null; sources: RAGSource[]; nearest: RAGSource[];
  semanticUnavailable: boolean; answerUnavailable: boolean; mock: boolean;
  evidenceCount: number; candidateCount: number;
  verification?:{status:"verified"|"conflict"|"rejected"|"unavailable";version:string};
  debug?: { queryProfile: QueryProfile; selectedStrategy: RetrievalRoute["strategy"]; reason: string; evidenceAssessment?: EvidenceAssessment; verification?:Pick<VerificationReport,"version"|"accepted"|"reason"|"completeness"|"faithfulness">; semantic: { id: string; score: number }[]; lexical: { id: string; score: number }[]; fused: { id: string; score: number; fusedRank?: number }[]; reranker: string; latency: Record<string, number> };
}
