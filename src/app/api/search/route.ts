import { z } from "zod";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { getUserId } from "@/lib/server/identity";
import { database, persistenceConfigured } from "@/lib/server/database";
import { configuredEmbedding, knowledgeRepository, vectorStore, offlineRAGProvider, refreshIndexVersions } from "@/lib/server/knowledge";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { SearchRequestSchema, type SearchResult } from "@/lib/retrieval/search-contract";
import { RetrievalEngine } from "@/lib/retrieval/engine";
import { DeterministicReranker } from "@/lib/retrieval/ranking";
import { buildRAGContext, generateGroundedAnswer } from "@/lib/retrieval/rag";
import { indexingConfig, retrievalConfig } from "@/lib/retrieval/config";
import { getAIProvider } from "@/lib/ai/get-provider";
import type { AIProvider } from "@/lib/ai/provider";
import { VERIFIER_VERSION } from "@/lib/retrieval/answer-verifier";
import { applicationLog,loggedProvider } from "@/lib/reliability/application-log";
export async function GET(request: Request) {
  try {
    const userId = await getUserId();
    const url = new URL(request.url);
    if (!userId || !persistenceConfigured()) {
      if (url.searchParams.has("chunkId") || url.searchParams.has("runId")) throw new WorkspaceError("NOT_FOUND", "Source not found.", 404);
      return Response.json({ recent: [] });
    }
    if (url.searchParams.has("chunkId")) {
      const id = z.uuid().parse(url.searchParams.get("chunkId"));
      const source = await knowledgeRepository.getSource({ userId }, id);
      if (!source) throw new WorkspaceError("NOT_FOUND", "Source no longer available. Search again.", 404);
      return Response.json(source, { headers: { "cache-control": "no-store" } });
    }
    if (url.searchParams.has("runId")) {
      const id = z.uuid().parse(url.searchParams.get("runId"));
      const result = await database.query(userId, "select result from filemind.retrieval_runs where user_id=$1 and id=$2", [userId, id]);
      if (!result.rows.length) throw new WorkspaceError("NOT_FOUND", "Search no longer available.", 404);
      return Response.json((result.rows[0] as { result: unknown }).result, { headers: { "cache-control": "no-store" } });
    }
    const recent = await database.query(userId, "select id,query,mode,created_at from filemind.retrieval_runs where user_id=$1 order by created_at desc limit 10", [userId]);
    return Response.json({ recent: recent.rows }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const input = SearchRequestSchema.parse(await readJSON(request, 8192));
    const userId = await getUserId();
    if (!userId || !persistenceConfigured()) throw new WorkspaceError("NOT_FOUND", "Import and save your documents in Workspace first.", 404);
    const scope = { userId, workspaceId: input.workspaceId };
    await refreshIndexVersions(scope);
    let rewrittenQuery = input.query;
    if (input.previousRunId) {
      const previous = await database.query(userId, "select coalesce(rewritten_query,query) as query from filemind.retrieval_runs where user_id=$1 and id=$2 and ($3::uuid is null or workspace_id=$3)", [userId, input.previousRunId, input.workspaceId ?? null]);
      if (previous.rows.length && /\b(it|that|those|these|there)\b|它|这|那/i.test(input.query)) rewrittenQuery = `${(previous.rows[0] as { query: string }).query.slice(-3000)}\nFollow-up: ${input.query}`;
    }
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder(); let closed = false;
        const send = (type: string, data: unknown) => { if (!closed && !request.signal.aborted) { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)); } catch { closed = true; } } };
        try {
          const started = performance.now(); const embedding = configuredEmbedding();
          const engine = new RetrievalEngine(embedding, vectorStore, knowledgeRepository, indexingConfig(process.env).rerankEnabled ? new DeterministicReranker() : null);
          const retrieved = await engine.retrieve(scope, rewrittenQuery, stage => send("stage", stage));
          let provider: AIProvider | null = null;
          if (process.env.AI_ENGINE === "mock") provider = offlineRAGProvider();
          else { try { provider = getAIProvider(); } catch {} }
          const llmStarted = performance.now();
          if (input.mode === "ask" && retrieved.evidence.length) send("stage", "Generating answer");
          const grounded = input.mode === "ask" ? await generateGroundedAnswer(rewrittenQuery, retrieved.evidence, scope, provider, knowledgeRepository.getSource.bind(knowledgeRepository), request.signal, stage => send("stage", stage)) : { answer: null, sources: buildRAGContext(retrieved.evidence).sources, unavailable: false };
          request.signal.throwIfAborted();
          const latency = { ...retrieved.latency, llm: input.mode === "ask" ? performance.now() - llmStarted : 0, total: performance.now() - started };
          const result: SearchResult = { id: crypto.randomUUID(), query: input.query, rewrittenQuery, mode: input.mode, answer: grounded.answer, sources: grounded.sources, nearest: buildRAGContext(retrieved.nearest).sources, semanticUnavailable: retrieved.semanticUnavailable, answerUnavailable: grounded.unavailable, mock: retrieved.mock || process.env.AI_ENGINE === "mock", evidenceCount: grounded.sources.length, candidateCount: retrieved.fused.length };
          if(input.mode==="ask")result.verification={version:VERIFIER_VERSION,status:grounded.unavailable?"unavailable":"verification" in grounded && grounded.verification?.accepted?(grounded.verification.conflicts.length?"conflict":"verified"):"rejected"};
          const verified="verification" in grounded?grounded.verification:undefined;
          if (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE!=="true") result.debug = { queryProfile: retrieved.profile, selectedStrategy: retrieved.route.strategy, reason: retrieved.route.reason, evidenceAssessment: "assessment" in grounded ? grounded.assessment : undefined, verification:verified?{version:verified.version,accepted:verified.accepted,reason:verified.reason,completeness:verified.completeness,faithfulness:verified.faithfulness}:undefined, semantic: retrieved.semantic.map(s => ({ id: s.id, score: s.score })), lexical: retrieved.lexical.map(s => ({ id: s.id, score: s.score })), fused: retrieved.fused.map(s => ({ id: s.id, score: s.score, fusedRank: s.fusedRank })), reranker: retrieved.reranker, latency };
          await database.query(userId, `insert into filemind.retrieval_runs(id,user_id,workspace_id,query,rewritten_query,mode,vector_model,vector_provider,top_k,retrieved_chunk_ids,evidence_ids,reranker_status,latency,result) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[],$11::uuid[],$12,$13,$14)`, [result.id, userId, input.workspaceId ?? null, input.query, rewrittenQuery, input.mode, embedding?.getModelInfo().model ?? null, embedding?.getModelInfo().provider ?? null, retrievalConfig.vectorTopK, retrieved.fused.map(s => s.id), grounded.sources.map(s => s.id), retrieved.reranker, latency, result]);
          await applicationLog({level:grounded.unavailable?"warn":"info",event:"search_completed",request_id:result.id,workspace_id:input.workspaceId??null,operation_id:null,provider:provider?loggedProvider(provider.name):null,error_code:grounded.unavailable?"UNAVAILABLE":null,duration:latency.total});
          request.signal.throwIfAborted(); send("result", result);
        } catch { send("error", "Search is temporarily unavailable. Your documents are preserved."); }
        finally { if (!closed) { closed = true; controller.close(); } }
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (error) { return apiError(error); }
}
