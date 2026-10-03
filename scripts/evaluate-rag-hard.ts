import { loadEnvConfig } from "@next/env";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { hardTextDocuments, hardQueries, type HardQuery } from "../tests/fixtures/rag-hard/corpus";
import { imageFixtures } from "./generate-image-fixtures";
import { runTenantQuery } from "../src/lib/workspace/tenant-query";
import { PostgresWorkspaceRepository, type TenantDatabase } from "../src/lib/workspace/postgres-repository";
import { PostgresKnowledgeRepository } from "../src/lib/retrieval/postgres-knowledge";
import { PortableVectorStore } from "../src/lib/retrieval/portable-vector-store";
import { DashScopeEmbeddingProvider } from "../src/lib/retrieval/dashscope-provider";
import { embeddingCacheKey, type EmbeddingProvider, type EmbeddingResult } from "../src/lib/retrieval/embedding-provider";
import { DocumentChunker, contentHash } from "../src/lib/retrieval/chunker";
import { CHUNK_VERSION, retrievalConfig } from "../src/lib/retrieval/config";
import { rankFusion, DeterministicReranker } from "../src/lib/retrieval/ranking";
import { KimiVisionProvider } from "../src/lib/multimodal/kimi-vision";
import { PortableOCRProvider } from "../src/lib/multimodal/portable-ocr";
import { MultimodalPipeline } from "../src/lib/multimodal/pipeline";
import { MultimodalRepository } from "../src/lib/multimodal/repository";
import { MultimodalRecordSchema } from "../src/lib/multimodal/repository";
import { analysisQueue } from "../src/lib/ai/analysis-queue";
import { createKimiProvider } from "../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../src/lib/ai/models";
import { generateGroundedAnswer } from "../src/lib/retrieval/rag";
import { normalizeAIError } from "../src/lib/ai/errors";
import type { Evidence } from "../src/lib/retrieval/types";

const distinct = (items: Evidence[]) => [...new Map(items.map(e => [e.documentName, e.documentName])).values()];
function metrics(names: string[], expected: string[]) {
  const relevant = new Set(expected); const rank = names.findIndex(n => relevant.has(n)) + 1;
  const dcg = names.slice(0, 10).reduce((sum, n, i) => sum + (relevant.has(n) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = expected.slice(0, 10).reduce((sum, _, i) => sum + 1 / Math.log2(i + 2), 0);
  return { hitAt1: Number(rank === 1), hitAt5: Number(rank > 0 && rank <= 5), mrr: rank > 0 ? 1 / rank : 0,
    recallAt10: names.slice(0, 10).filter(n => relevant.has(n)).length / expected.length, ndcgAt10: ideal ? dcg / ideal : 0,
    evidenceRecall: names.slice(0, 7).filter(n => relevant.has(n)).length / expected.length };
}
type Metrics = ReturnType<typeof metrics>;
function average(values: Metrics[]) { return Object.fromEntries(Object.keys(values[0] ?? {}).map(key => [key, values.reduce((sum, value) => sum + value[key as keyof Metrics], 0) / values.length])); }
const composed = (q: HardQuery) => q.previous ? `${q.previous}\nFollow-up: ${q.query}` : q.query;
async function main() {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  if (!process.argv.includes("--live")) throw new Error("Hard evaluation requires explicit --live. No mock metrics are presented as semantic retrieval.");
  const uri = new URL(process.env.DATABASE_URL!); const instance = JSON.parse(await readFile(".filemind/postgresql/instance.json", "utf8"));
  if (uri.hostname !== "127.0.0.1" || Number(uri.port) !== instance.port || uri.pathname !== "/filemind_ai" || uri.username !== "filemind_user") throw new Error("Dedicated FileMind database required");
  if (!(await readFile("docs/phase-checklists/vision-live-verification.md", "utf8")).includes("VISION_VERIFIED=true")) throw new Error("Vision Gate required");
  await mkdir(".filemind/evaluation", { recursive: true }); await mkdir("docs/evaluation", { recursive: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 });
  const db: TenantDatabase = { query: async (user, sql, values) => runTenantQuery(await pool.connect(), user, sql, values) };
  const userId = randomUUID(); const workspaces: string[] = []; const scope = { userId };
  const workspaceRepo = new PostgresWorkspaceRepository(db); const vectors = new PortableVectorStore(db); const mm = new MultimodalRepository(db);
  const real = new DashScopeEmbeddingProvider({ apiKey: process.env.EMBEDDING_API_KEY || process.env.DASHSCOPE_API_KEY || "", baseURL: process.env.EMBEDDING_BASE_URL || "", model: process.env.EMBEDDING_MODEL || "", dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1024) });
  const cachePath = ".filemind/evaluation/hard-embeddings.json";
  const cache: Record<string, EmbeddingResult> = await readFile(cachePath, "utf8").then(JSON.parse, () => ({}));
  const key = (text: string, kind: string) => contentHash(JSON.stringify([real.getModelInfo(), kind, text]));
  const provider: EmbeddingProvider = { getModelInfo: () => real.getModelInfo(),
    async embedQuery(text) { const k = key(text, "query"); if (!cache[k]) { cache[k] = await real.embedQuery(text); await writeFile(cachePath, JSON.stringify(cache)); } return cache[k]; },
    async embedDocuments(texts) {
      const missing = [...new Set(texts.filter(t => !cache[key(t, "document")]))];
      for (let i = 0; i < missing.length; i += 16) { const batch = missing.slice(i, i + 16); const results = await real.embedDocuments(batch); batch.forEach((t, j) => { cache[key(t, "document")] = results[j]; }); }
      await writeFile(cachePath, JSON.stringify(cache)); return texts.map(t => cache[key(t, "document")]);
    },
  };
  const report: Record<string, unknown> = { live: true, completed: false, checkedAt: new Date().toISOString(), sample: { documents: hardTextDocuments.length + imageFixtures.length, images: imageFixtures.length, queries: hardQueries.length, answerable: hardQueries.filter(q => q.expected.length).length, noAnswer: hardQueries.filter(q => !q.expected.length).length }, embedding: real.getModelInfo(), configuration: { ...retrievalConfig, chunkVersion: CHUNK_VERSION } };
  try {
    const imagesCachePath = ".filemind/evaluation/hard-images.json"; const imageCache = await readFile(imagesCachePath, "utf8").then(JSON.parse).catch(() => ({}));
    const multimodal = new MultimodalPipeline(new KimiVisionProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL }), new PortableOCRProvider(), process.env);
    const imageKnowledge = await analysisQueue([...imageFixtures], async ([name]) => {
      const bytes = await readFile(`tests/fixtures/rag-hard/images/${name}`); const hash = contentHash(bytes.toString("base64"));
      const cached = MultimodalRecordSchema.safeParse(imageCache[name]);
      const result = await multimodal.analyze(randomUUID(), { bytes, filename: name, mimeType: name.endsWith("jpg") ? "image/jpeg" : "image/png" }, hash, AbortSignal.timeout(90000), cached.success ? cached.data : null);
      if (!result.analysis.vision || !result.analysis.ocr) throw new Error("Real image analysis failed");
      imageCache[name] = result.analysis;
      return { name, text: result.text, structure: result.structure, analysis: result.analysis };
    }, new AbortController().signal, 2);
    await writeFile(imagesCachePath, JSON.stringify(imageCache));
    console.log("Real Vision + OCR: 12 synthetic images analyzed.");
    report.visionUsage = imageKnowledge.map(d => ({ name: d.name, ...d.analysis.usage }));
    const sources = [...hardTextDocuments.map(d => ({ ...d, type: "txt" as const, structure: undefined })), ...imageKnowledge.map(d => ({ ...d, type: "image" as const }))];
    for (let offset = 0; offset < sources.length; offset += 24) {
      const workspace = await workspaceRepo.create(userId, `Phase 6 synthetic hard benchmark ${offset / 24 + 1}`); workspaces.push(workspace.id);
      const batch = sources.slice(offset, offset + 24); const documents = batch.map(d => ({ id: randomUUID(), name: d.name, type: d.type, mimeType: d.type === "image" ? d.name.endsWith("jpg") ? "image/jpeg" : "image/png" : "text/plain", size: Buffer.byteLength(d.text), parseStatus: "completed" as const, metadata: { addedAt: new Date().toISOString(), structure: d.structure } }));
      await workspaceRepo.save(userId, { ...workspace, documents, texts: Object.fromEntries(documents.map((d, i) => [d.id, batch[i].text])) });
      for (let i = 0; i < batch.length; i++) {
        const source = batch[i]; if ("analysis" in source) await mm.save({ userId, workspaceId: workspace.id }, { ...source.analysis, documentId: documents[i].id });
      }
    }
    async function build(target = 800) {
      const repository = new PostgresKnowledgeRepository(db, new DocumentChunker({ chunkTargetTokens: target, chunkMaxTokens: target === 800 ? 1000 : target + 200, overlapTokens: 100 }));
      const documents = await repository.documents(scope); let count = 0;
      // A single request queue batches all sources; cached unchanged text avoids repeat API use.
      const pending = [];
      for (const d of documents) { const generation = randomUUID(); const chunks = await repository.prepareChunks(d, generation); count += chunks.length; pending.push({ d, generation, chunks }); }
      const all = pending.flatMap(p => p.chunks); const embeddings = await provider.embedDocuments(all.map(c => c.content));
      for (let i = 0; i < all.length; i++) await vectors.upsertEmbedding(scope, all[i], embeddings[i], embeddingCacheKey(all[i].contentHash, embeddings[i].provider, embeddings[i].model, CHUNK_VERSION));
      for (const item of pending) await repository.setStatus(item.d, item.generation, "ready", provider.getModelInfo());
      return { repository, chunks: count };
    }
    let built = await build(); report.chunkCount = built.chunks; console.log(`Indexed ${sources.length} sources, ${built.chunks} chunks with real DashScope.`);
    const reranker = new DeterministicReranker();
    async function retrieve(q: HardQuery, repository = built.repository) {
      const query = composed(q); const vector = await vectors.searchSimilar(scope, await provider.embedQuery(query), 20); const lexical = await repository.lexicalSearch(scope, query);
      const hybridRRF = rankFusion(vector, lexical); const hybrid = await reranker.rerank(query, hybridRRF.slice(0, retrievalConfig.candidateLimit));
      return { query, vector, lexical, hybridRRF, hybrid };
    }
    const rows = [];
    const kimi = createKimiProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL, models: readModelConfig(process.env) });
    let noCorrect = 0; let citationCount = 0; let imageAnswers = 0; const noAnswerResults = []; const imageAnswersReport = [];
    for (let i = 0; i < hardQueries.length; i++) {
      const q = hardQueries[i]; const lists = await retrieve(q); const selected = lists.hybrid.filter(e => (e.semanticScore ?? 0) >= retrievalConfig.minimumCosine || (e.lexicalCoverage ?? 0) >= retrievalConfig.minimumLexicalCoverage).slice(0, 7);
      const ranked = { vector: distinct(lists.vector), lexical: distinct(lists.lexical), hybridRRF: distinct(lists.hybridRRF), hybrid: distinct(lists.hybrid) };
      const scores = q.expected.length ? Object.fromEntries(Object.entries(ranked).map(([name, names]) => [name, metrics(names, q.expected)])) : null;
      rows.push({ ...q, ranks: Object.fromEntries(Object.entries(ranked).map(([name, names]) => [name, q.expected.map(e => ({ document: e, rank: names.indexOf(e) + 1 }))])), top5: Object.fromEntries(Object.entries(ranked).map(([name, names]) => [name, names.slice(0, 5)])), scores, predictedNoAnswerByThreshold: !selected.length });
      if (!q.expected.length || q.imageOnly) {
        const answer = await generateGroundedAnswer(composed(q), selected, scope, kimi, built.repository.getSource.bind(built.repository), AbortSignal.timeout(60000));
        if (!q.expected.length) { const passed = answer.answer?.insufficientEvidence === true && !answer.unavailable; if (passed) noCorrect++; noAnswerResults.push({ id: q.id, query: q.query, passed, errorCode: answer.errorCode ?? null }); }
        else { const passed = Boolean(answer.answer && !answer.answer.insufficientEvidence && answer.answer.citations.some(c => selected.some(e => e.id === c.chunkId && q.expected.includes(e.documentName)))); if (passed) imageAnswers++; citationCount += answer.answer?.citations.length ?? 0; imageAnswersReport.push({ id: q.id, passed, citations: answer.answer?.citations.length ?? 0, unavailable: answer.unavailable, repaired: answer.repaired ?? false, errorCode: answer.errorCode ?? null, validationReason: answer.validationReason ?? null }); }
      }
      if ((i + 1) % 12 === 0) console.log(`Evaluated ${i + 1}/${hardQueries.length} queries.`);
    }
    const answered = rows.filter(r => r.scores); const modes = ["vector", "lexical", "hybridRRF", "hybrid"];
    report.metrics = Object.fromEntries(modes.map(mode => [mode, average(answered.map(r => r.scores![mode]))]));
    report.byType = Object.fromEntries([...new Set(answered.map(r => r.kind)), "Chinese", "English"].map(kind => {
      const group = answered.filter(r => kind === "Chinese" ? /\p{Script=Han}/u.test(r.query) : kind === "English" ? !/\p{Script=Han}/u.test(r.query) : r.kind === kind);
      return [kind, { count: group.length, ...Object.fromEntries(modes.map(mode => [mode, average(group.map(r => r.scores![mode]))])) }];
    }));
    report.noAnswerAccuracy = noCorrect / noAnswerResults.length; report.noAnswerResults = noAnswerResults;
    report.multimodalHitAt5 = average(answered.filter(r => r.imageOnly).map(r => r.scores!.hybrid)).hitAt5;
    report.imageGroundedAnswers = { passed: imageAnswers, attempted: imageAnswersReport.length, results: imageAnswersReport };
    report.citationValidity = { validatedCitations: citationCount, returnedCitations: citationCount, ratio: citationCount ? 1 : null, limitation: "Returned citations passed live source identity/content validation; unavailable or rejected generation is separately counted. This is not factual answer accuracy." };
    report.failureCases = answered.filter(r => modes.some(m => r.scores![m].hitAt5 === 0)).map(r => ({ ...r, failureType: r.kind === "ambiguous" ? "query-ambiguity" : r.kind === "cross-language" ? "cross-language-ranking" : r.imageOnly ? "image-evidence-ranking" : "retrieval-ranking" }));
    report.queries = rows;
    const difficult = hardQueries.filter(q => ["hard-negative", "cross-language", "multi-document", "follow-up"].includes(q.kind)).slice(0, 24);
    const rrf = [];
    for (const k of [20, 60, 100]) { const values = []; for (const q of difficult) { const lists = await retrieve(q); values.push(metrics(distinct(await reranker.rerank(lists.query, rankFusion(lists.vector, lists.lexical, k).slice(0, 15))), q.expected)); } rrf.push({ k, queries: difficult.length, ...average(values) }); }
    report.rrfExperiment = rrf;
    const chunks = [];
    for (const target of [400, 800, 1200]) { built = await build(target); const values = []; for (const q of difficult) { const lists = await retrieve(q, built.repository); values.push(metrics(distinct(lists.hybrid), q.expected)); } chunks.push({ targetTokens: target, chunks: built.chunks, queries: difficult.length, ...average(values) }); console.log(`Chunk experiment ${target} completed.`); }
    report.chunkExperiment = chunks; report.completed = true;
  } catch (e) { report.errorCode = normalizeAIError(e).code; process.exitCode = 1; }
  finally {
    for (const id of workspaces) await db.query(userId, "delete from filemind.workspaces where user_id=$1 and id=$2", [userId, id]);
    await db.query(userId, "delete from filemind.profiles where id=$1", [userId]); await pool.end();
    await writeFile("docs/evaluation/rag-hard-results.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ completed: report.completed, sample: report.sample, metrics: report.metrics, noAnswerAccuracy: report.noAnswerAccuracy, multimodalHitAt5: report.multimodalHitAt5, errorCode: report.errorCode }, null, 2));
  }
}
void main().catch(() => { console.error("Hard evaluation failed; raw errors suppressed."); process.exitCode = 1; });
