import { z } from "zod";
import type { RAGAnswer, RAGSource, AnswerVerificationSummary } from "./answer-contract";

export type QueryType = "semantic" | "exact" | "mixed" | "filename" | "code" | "identifier" | "short_ambiguous" | "followup";
export interface QueryProfile {
  language: "zh" | "en" | "mixed" | "other";
  tokenCount: number;
  containsCodeToken: boolean;
  containsVersion: boolean;
  containsErrorCode: boolean;
  containsQuotedPhrase: boolean;
  containsFilename: boolean;
  containsAcronym: boolean;
  exactTerms: string[];
  exactnessScore: number;
  semanticScore: number;
  type: QueryType;
}
export type RetrievalStrategy = "VECTOR_ONLY" | "VECTOR_WITH_LEXICAL_BOOST" | "LEXICAL_FIRST" | "FILENAME_SEARCH" | "FALLBACK";
export interface EvidenceAssessment {
  sufficient: boolean;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  evidenceCount: number;
  documentDiversity: number;
  topSemanticScore: number | null;
  topEvidenceGap: number | null;
  topLexicalCoverage: number;
}
export interface SourceCoverage {
  selectedCount: number;
  evidenceDocumentIds: string[];
  citedDocumentIds: string[];
  mergedCopies: { documentId: string; intoDocumentId: string }[];
  uncovered: { documentId: string; name: string; reason: "not_ready" | "no_relevant_evidence" | "budget" | "not_cited" | "missing_facts"; detail?: string }[];
  unlistedCount: number;
  complete: boolean;
}
// Public, version-independent outcomes. Never derive these from error messages.
export const SearchIssueSchema = z.enum([
  "PREPARATION_INCOMPLETE", "NO_RELEVANT_CONTENT", "MISSING_REQUESTED_FACTS",
  "VERIFICATION_FAILED", "ANSWER_SERVICE_UNAVAILABLE", "SOURCES_CHANGED",
  "INSUFFICIENT_EVIDENCE", "SEARCH_UNAVAILABLE", "HISTORY_UNVERIFIED", "SEMANTIC_UNAVAILABLE",
]);
export type SearchIssue = z.infer<typeof SearchIssueSchema>;

export const SearchRequestSchema = z.object({ query: z.string().trim().min(1).max(1500), mode: z.enum(["ask", "find"]), workspaceId: z.uuid().optional(), documentIds: z.array(z.uuid()).min(1).max(30).optional(), previousRunId: z.uuid().optional(), compareAll: z.boolean().optional(), clarificationOption: z.number().int().min(0).max(7).optional() }).strict();
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export interface SearchResult {
  id: string; query: string; rewrittenQuery: string; mode: "ask" | "find";
  answer: RAGAnswer | null; sources: RAGSource[]; nearest: RAGSource[];
  semanticUnavailable: boolean; answerUnavailable: boolean; mock: boolean;
  evidenceCount: number; candidateCount: number;
  answerErrorCode?:string;
  answerState?: "answered" | "no_answer" | "needs_clarification" | "conflicting" | "error";
  selectedDocumentIds?: string[];
  workspaceId?: string;
  historyWarning?: string;
  issues?: SearchIssue[];
  coverage?: SourceCoverage;
  verification?:{status:"verified"|"conflict"|"rejected"|"unavailable"|"no_answer"|"needs_clarification";version:string};
  debug?: { queryProfile: QueryProfile; selectedStrategy: RetrievalStrategy; reason: string; evidenceAssessment?: EvidenceAssessment; verification?:AnswerVerificationSummary; semantic: { id: string; score: number }[]; lexical: { id: string; score: number }[]; fused: { id: string; score: number; fusedRank?: number }[]; reranker: string; latency: Record<string, number> };
}
