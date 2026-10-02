import { loadEnvConfig } from "@next/env";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { corpus, evaluationQueries } from "../tests/fixtures/rag/corpus";
import { PostgresWorkspaceRepository, type TenantDatabase } from "../src/lib/workspace/postgres-repository";
import { runTenantQuery } from "../src/lib/workspace/tenant-query";
import { PostgresKnowledgeRepository } from "../src/lib/retrieval/postgres-knowledge";
import { PortableVectorStore } from "../src/lib/retrieval/portable-vector-store";
import { MockEmbeddingProvider } from "../src/lib/retrieval/embedding-provider";
import { DashScopeEmbeddingProvider } from "../src/lib/retrieval/dashscope-provider";
import { IndexingPipeline } from "../src/lib/retrieval/indexing";
import { rankFusion, DeterministicReranker } from "../src/lib/retrieval/ranking";
import { RetrievalEngine } from "../src/lib/retrieval/engine";
import { createKimiProvider } from "../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../src/lib/ai/models";
import { generateGroundedAnswer } from "../src/lib/retrieval/rag";
import { CHUNK_VERSION, retrievalConfig } from "../src/lib/retrieval/config";
import { normalizeAIError } from "../src/lib/ai/errors";
async function main() {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const live = process.argv.includes("--live");
  const uri = new URL(process.env.DATABASE_URL!);
  const instance = JSON.parse(await readFile(".filemind/postgresql/instance.json", "utf8"));
  if (uri.hostname !== "127.0.0.1" || Number(uri.port) !== instance.port || uri.pathname !== "/filemind_ai" || uri.username !== "filemind_user") throw new Error("Private FileMind database required");
  if (live && !(await readFile("docs/phase-checklists/kimi-live-verification.md", "utf8")).includes("REAL_KIMI_VERIFIED=true")) throw new Error("Gate 0 must pass");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  pool.on("error", () => { process.exitCode = 1; });
  const db: TenantDatabase = { query: async (userId, sql, values) => runTenantQuery(await pool.connect(), userId, sql, values) };
  const userId = crypto.randomUUID(); const workspaceRepo = new PostgresWorkspaceRepository(db); const knowledge = new PostgresKnowledgeRepository(db); const vectors = new PortableVectorStore(db);
  let workspaceId: string | undefined;
  const report: Record<string, unknown> = { live, REAL_RAG_E2E_VERIFIED: false, checkedAt: new Date().toISOString(), configuration: { ...retrievalConfig, chunkVersion: CHUNK_VERSION, reranker: "deterministic", backend: "PortableVectorStore" } };
  try {
    const provider = live ? new DashScopeEmbeddingProvider({ apiKey: process.env.EMBEDDING_API_KEY || process.env.DASHSCOPE_API_KEY || "", baseURL: process.env.EMBEDDING_BASE_URL || "", model: process.env.EMBEDDING_MODEL || "", dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1024) }) : new MockEmbeddingProvider();
    report.embedding = provider.getModelInfo();
    const workspace = await workspaceRepo.create(userId, "Synthetic retrieval evaluation"); workspaceId = workspace.id;
    const docs = corpus.map(d => ({ id: crypto.randomUUID(), name: d.name, type: "md" as const, mimeType: "text/markdown", size: Buffer.byteLength(d.text), parseStatus: "completed" as const, metadata: { addedAt: new Date().toISOString() } }));
    await workspaceRepo.save(userId, { ...workspace, documents: docs, texts: Object.fromEntries(docs.map((d, i) => [d.id, corpus[i].text])) });
    const indexing = await new IndexingPipeline(knowledge, vectors, provider, process.env).indexLibrary({ userId, workspaceId });
    if (indexing.some(i => i.status !== "ready")) throw new Error("Evaluation indexing failed");
    const results = []; const rankMetrics = { vector: { hit1: 0, hit5: 0, reciprocal: 0 }, lexical: { hit1: 0, hit5: 0, reciprocal: 0 }, hybrid: { hit1: 0, hit5: 0, reciprocal: 0 } };
    let answerable = 0; let noAnswerCorrect = 0; let noAnswerCount = 0;
    for (const q of evaluationQueries) {
      const query = q.previous ? `${q.previous}\nFollow-up: ${q.query}` : q.query;
      const embedded = await provider.embedQuery(query);
      const vector = await vectors.searchSimilar({ userId, workspaceId }, embedded, retrievalConfig.vectorTopK);
      const lexical = await knowledge.lexicalSearch({ userId, workspaceId }, query); const hybrid = await new DeterministicReranker().rerank(query, rankFusion(vector, lexical).slice(0, retrievalConfig.candidateLimit));
      const selected = hybrid.filter(e => (e.semanticScore ?? 0) >= retrievalConfig.minimumCosine || (e.lexicalCoverage ?? 0) >= retrievalConfig.minimumLexicalCoverage);
      const ranks: Record<string, number> = {};
      if (q.noAnswer) { noAnswerCount++; if (!selected.length) noAnswerCorrect++; }
      else {
        answerable++;
        for (const [name, list] of Object.entries({ vector, lexical, hybrid })) {
          // Document-level dedup prevents multiple chunks consuming Hit@5 slots.
          const distinct = [...new Map(list.map(e => [e.documentId, e.documentName])).values()];
          const rank = distinct.findIndex(name => q.expected.includes(name)) + 1; ranks[name] = rank;
          const metric = rankMetrics[name as keyof typeof rankMetrics]; if (rank === 1) metric.hit1++; if (rank > 0 && rank <= 5) metric.hit5++; if (rank > 0) metric.reciprocal += 1 / rank;
        }
      }
      results.push({ query: q.query, kind: q.kind, expected: q.expected, noAnswer: q.noAnswer ?? false, predictedNoAnswer: !selected.length, ranks });
    }
    report.metrics = Object.fromEntries(Object.entries(rankMetrics).map(([name, m]) => [name, { hitAt1: m.hit1 / answerable, hitAt5: m.hit5 / answerable, mrr: m.reciprocal / answerable }]));
    report.retrievalNoAnswerAccuracy = noAnswerCorrect / noAnswerCount; report.noAnswerAccuracy = report.retrievalNoAnswerAccuracy; report.queries = results;
    report.sample = { documents: corpus.length, queries: evaluationQueries.length, answerableQueries: answerable, noAnswerQueries: noAnswerCount, evaluatedGroundedAnswers: live ? 1 : 0 };
    if (live) {
      const kimi = createKimiProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL, models: readModelConfig(process.env) });
      const retrieved = await new RetrievalEngine(provider, vectors, knowledge, new DeterministicReranker()).retrieve({ userId, workspaceId }, "Explain Query Key Value in my Transformer notes briefly.");
      const llmStarted = performance.now();
      const grounded = await generateGroundedAnswer("Explain Query Key Value briefly, citing my sources.", retrieved.evidence, { userId, workspaceId }, kimi, knowledge.getSource.bind(knowledge), AbortSignal.timeout(45000));
      const llmMs = performance.now() - llmStarted;
      const answer = grounded.answer;
      report.REAL_RAG_E2E_VERIFIED = Boolean(answer && !grounded.unavailable && !answer.insufficientEvidence && answer.citations.length);
      report.citationValidity = answer && !answer.insufficientEvidence ? 1 : null;
      report.liveCitationCount = answer?.citations.length ?? 0;
      report.answerErrorCode = grounded.errorCode ?? null;
      const noAnswerResults = [];
      for (const q of evaluationQueries.filter(q => q.noAnswer)) {
        const unmatched = await new RetrievalEngine(provider, vectors, knowledge, new DeterministicReranker()).retrieve({ userId, workspaceId }, q.query);
        const noAnswer = await generateGroundedAnswer(q.query, unmatched.evidence, { userId, workspaceId }, kimi, knowledge.getSource.bind(knowledge), AbortSignal.timeout(45000));
        noAnswerResults.push({ query: q.query, passed: noAnswer.answer?.insufficientEvidence === true, errorCode: noAnswer.errorCode ?? null });
      }
      report.liveNoAnswerPassed = noAnswerResults.every(r => r.passed); report.noAnswerAccuracy = noAnswerResults.filter(r => r.passed).length / noAnswerResults.length; report.noAnswerResults = noAnswerResults;
      report.latency = { ...retrieved.latency, llm: llmMs };
      if (!report.REAL_RAG_E2E_VERIFIED || !report.liveNoAnswerPassed) process.exitCode = 1;
    }
  } catch (error) { const safe = normalizeAIError(error); report.errorCode = safe.code; report.httpStatus = safe.status ?? null; process.exitCode = 1; }
  finally {
    if (workspaceId) await db.query(userId, "delete from filemind.workspaces where user_id=$1 and id=$2", [userId, workspaceId]);
    await db.query(userId, "delete from filemind.profiles where id=$1", [userId]); await pool.end();
  }
  await mkdir("docs/evaluation", { recursive: true });
  const output = resolve(`docs/evaluation/rag-${live ? "live" : "mock"}-results.json`); await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ live, verified: report.REAL_RAG_E2E_VERIFIED, embedding: report.embedding, metrics: report.metrics, noAnswerAccuracy: report.noAnswerAccuracy, citationValidity: report.citationValidity, liveNoAnswerPassed: report.liveNoAnswerPassed, errorCode: report.errorCode, httpStatus: report.httpStatus }, null, 2));
}
void main().catch(() => { console.error("Evaluation runner failed; no raw error logged."); process.exitCode = 1; });
