import type { AIProvider } from "../ai/provider";
import { ApplicationLogSchema, loggedProvider, type applicationLog } from "../reliability/application-log";
import { WorkspaceError } from "../workspace/authorization";
import { VERIFIER_VERSION } from "./answer-verifier";
import type { EmbeddingProvider } from "./embedding-provider";
import { RetrievalEngine, type LexicalSearchProvider } from "./engine";
import { DeterministicReranker } from "./ranking";
import { buildRAGContext, generateGroundedAnswer } from "./rag";
import type { SearchRequest, SearchResult } from "./search-contract";
import type { SearchHistory } from "./search-history";
import type { Evidence, RetrievalScope } from "./types";
import type { VectorStore } from "./vector-store";

interface SearchDependencies {
  history: SearchHistory;
  knowledge: LexicalSearchProvider & { getSource(scope: RetrievalScope, id: string): Promise<Evidence | null> };
  vectors: VectorStore;
  embedding(): EmbeddingProvider | null;
  refreshIndexVersions(scope: RetrievalScope): Promise<void>;
  provider(): AIProvider | null;
  realAIRequired(): boolean;
  developmentControls(): boolean;
  rerankEnabled(): boolean;
  log: typeof applicationLog;
}

export interface PreparedSearch {
  scope: RetrievalScope;
  input: SearchRequest;
  rewrittenQuery: string;
  selectedDocumentIds?: string[];
}

export class SearchService {
  constructor(private dependencies: SearchDependencies) {}

  async getSource(userId: string, id: string) {
    const source = await this.dependencies.knowledge.getSource({ userId }, id);
    if (!source) throw new WorkspaceError("NOT_FOUND", "来源已不可用，请重新搜索。", 404);
    return source;
  }

  async getRun(userId: string, id: string) {
    const saved = await this.dependencies.history.get({ userId }, id);
    if (!saved) throw new WorkspaceError("NOT_FOUND", "搜索记录已不可用。", 404);
    const result = { ...saved.result };
    if (!this.dependencies.developmentControls()) delete result.debug;
    return result;
  }

  listRecent(userId: string) {
    return this.dependencies.history.list(userId);
  }

  // Prepare before opening SSE so invalid clarification requests keep their HTTP errors.
  async prepare(userId: string, input: SearchRequest): Promise<PreparedSearch> {
    const scope = { userId, workspaceId: input.workspaceId };
    await this.dependencies.refreshIndexVersions(scope);
    let rewrittenQuery = input.query;
    let selectedDocumentIds: string[] | undefined;
    if (input.clarificationOption !== undefined && !input.previousRunId) {
      throw new WorkspaceError("NOT_FOUND", "澄清记录已不可用，请重新搜索。", 404);
    }
    if (input.previousRunId) {
      const prior = await this.dependencies.history.get(scope, input.previousRunId);
      if (input.clarificationOption !== undefined) {
        const option = prior?.result.answer?.clarification?.options?.[input.clarificationOption];
        if (!option || prior?.result.answerState !== "needs_clarification") {
          throw new WorkspaceError("NOT_FOUND", "澄清记录已不可用，请重新搜索。", 404);
        }
        selectedDocumentIds = option.documentIds;
        rewrittenQuery = `${prior.query.slice(-3000)}\nSelected subject: ${option.label}`;
      } else if (prior && /\b(it|that|those|these|there)\b|它|这|那/i.test(input.query)) {
        rewrittenQuery = `${prior.query.slice(-3000)}\nFollow-up: ${input.query}`;
        selectedDocumentIds = prior.result.selectedDocumentIds;
      }
    }
    return { scope, input, rewrittenQuery, selectedDocumentIds };
  }

  async execute(prepared: PreparedSearch, signal: AbortSignal, onStage: (stage: string) => void): Promise<SearchResult> {
    const { scope, input, rewrittenQuery, selectedDocumentIds } = prepared;
    const dependencies = this.dependencies;
    const started = performance.now();
    const embedding = dependencies.embedding();
    const engine = new RetrievalEngine(embedding, dependencies.vectors, dependencies.knowledge,
      dependencies.rerankEnabled() ? new DeterministicReranker() : null);
    const retrieved = await engine.retrieve(scope, rewrittenQuery, onStage);
    if (selectedDocumentIds) {
      retrieved.evidence = retrieved.evidence.filter(source => selectedDocumentIds.includes(source.documentId));
      retrieved.nearest = retrieved.nearest.filter(source => selectedDocumentIds.includes(source.documentId));
    }
    const provider = dependencies.provider();
    const llmStarted = performance.now();
    if (input.mode === "ask" && retrieved.evidence.length) onStage("正在生成回答");
    const grounded = input.mode === "ask"
      ? await generateGroundedAnswer(rewrittenQuery, retrieved.evidence, scope, provider,
        dependencies.knowledge.getSource.bind(dependencies.knowledge), signal, onStage)
      : { answer: null, sources: buildRAGContext(retrieved.evidence).sources, unavailable: false };
    signal.throwIfAborted();
    const latency = { ...retrieved.latency, llm: input.mode === "ask" ? performance.now() - llmStarted : 0, total: performance.now() - started };
    const result: SearchResult = {
      id: crypto.randomUUID(), query: input.query, rewrittenQuery, mode: input.mode,
      answer: grounded.answer, sources: grounded.sources, nearest: buildRAGContext(retrieved.nearest).sources,
      semanticUnavailable: retrieved.semanticUnavailable, answerUnavailable: grounded.unavailable,
      mock: retrieved.mock || !dependencies.realAIRequired(), evidenceCount: grounded.sources.length, candidateCount: retrieved.fused.length,
    };
    const verified = "verification" in grounded ? grounded.verification : undefined;
    if (input.mode === "ask") {
      result.answerState = grounded.unavailable ? "error" : grounded.answer?.answerState ?? "no_answer";
      result.verification = {
        version: VERIFIER_VERSION,
        status: grounded.unavailable ? "unavailable"
          : result.answerState === "needs_clarification" ? "needs_clarification"
          : result.answerState === "no_answer" ? "no_answer"
          : verified?.accepted ? (verified.conflicts.length ? "conflict" : "verified") : "rejected",
      };
    }
    if (selectedDocumentIds) result.selectedDocumentIds = selectedDocumentIds;
    const publicError = ApplicationLogSchema.shape.error_code.safeParse("errorCode" in grounded ? grounded.errorCode : null);
    const errorCode = publicError.success ? publicError.data : grounded.unavailable ? "UNAVAILABLE" : null;
    if (errorCode) result.answerErrorCode = errorCode;
    if (dependencies.developmentControls()) {
      result.debug = {
        queryProfile: retrieved.profile, selectedStrategy: retrieved.route.strategy, reason: retrieved.route.reason,
        evidenceAssessment: "assessment" in grounded ? grounded.assessment : undefined,
        verification: verified ? {
          version: verified.version, accepted: verified.accepted, reason: verified.reason,
          completeness: verified.completeness, faithfulness: verified.faithfulness,
        } : undefined,
        semantic: retrieved.semantic.map(source => ({ id: source.id, score: source.score })),
        lexical: retrieved.lexical.map(source => ({ id: source.id, score: source.score })),
        fused: retrieved.fused.map(source => ({ id: source.id, score: source.score, fusedRank: source.fusedRank })),
        reranker: retrieved.reranker, latency,
      };
    }
    await dependencies.history.save(scope, result, {
      embedding: embedding?.getModelInfo() ?? null, candidateIds: retrieved.fused.map(source => source.id),
      reranker: retrieved.reranker, latency,
    });
    await dependencies.log({
      level: grounded.unavailable ? "warn" : "info", event: "search_completed", request_id: result.id,
      workspace_id: scope.workspaceId ?? null, operation_id: null, provider: provider ? loggedProvider(provider.name) : null,
      error_code: errorCode ?? (grounded.unavailable ? "UNAVAILABLE" : null), duration: latency.total,
    });
    signal.throwIfAborted();
    return result;
  }
}
