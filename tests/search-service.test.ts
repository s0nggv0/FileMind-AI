import { test } from "node:test";
import assert from "node:assert/strict";
import { SearchService } from "../src/lib/retrieval/search-service";
import type { SearchResult } from "../src/lib/retrieval/search-contract";
import type { SavedSearch, SearchDiagnostics, SearchHistory } from "../src/lib/retrieval/search-history";
import type { Evidence, RetrievalScope } from "../src/lib/retrieval/types";
import type { VectorStore } from "../src/lib/retrieval/vector-store";
import type { AIProvider } from "../src/lib/ai/provider";
import { WorkspaceError } from "../src/lib/workspace/authorization";
import { verifierFixtureResponse } from "./helpers/verifier-fixture";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../scripts/database/migrate-database.mjs";
import { PostgresSearchHistory } from "../src/lib/retrieval/postgres-search-history";
import { runTenantQuery } from "../src/lib/workspace/tenant-query";

const userId = crypto.randomUUID(), workspaceId = crypto.randomUUID();
const sample = (): Evidence => ({
  id: crypto.randomUUID(), userId, workspaceId, documentId: crypto.randomUUID(), chunkIndex: 0,
  content: "Retention is 6 hours.", contentHash: "fixture", tokenEstimate: 8, chunkVersion: "chunk-v1",
  pageStart: null, pageEnd: null, lineStart: 1, lineEnd: 1, paragraphStart: null, paragraphEnd: null,
  headingPath: [], charStart: 0, charEnd: 21, documentName: "retention.txt", fileType: "txt",
  summary: "", tags: [], score: 0.9, lexicalCoverage: 1,
});
const vectors: VectorStore = {
  async upsertEmbedding() {}, async deleteDocumentEmbeddings() {},
  async searchSimilar() { throw new Error("No embedding configured"); },
  async getEmbeddingStatus() { return new Map(); },
};
function fixture(evidence = [sample()]) {
  const runs = new Map<string, SavedSearch>();
  const writes: { scope: RetrievalScope; result: SearchResult; diagnostics: SearchDiagnostics }[] = [];
  const reads: RetrievalScope[] = [], refreshes: RetrievalScope[] = [], queries: string[] = [];
  const history: SearchHistory = {
    async get(scope, id) { reads.push(scope); return scope.userId === userId && (!scope.workspaceId || scope.workspaceId === workspaceId) ? runs.get(id) : undefined; },
    async list() { return []; },
    async save(scope, result, diagnostics) { writes.push({ scope, result, diagnostics }); runs.set(result.id, { query: result.rewrittenQuery, result }); },
  };
  let debug = false, provider: AIProvider | null = null;
  const service = new SearchService({
    history, vectors, embedding: () => null, rerankEnabled: () => false,
    refreshIndexVersions: async scope => { refreshes.push(scope); },
    provider: () => provider, realAIRequired: () => true, developmentControls: () => debug,
    log: async () => true,
    knowledge: {
      async lexicalSearch(_scope, query) { queries.push(query); return evidence; },
      async getSource(scope, id) { return evidence.find(source => source.id === id && source.userId === scope.userId) ?? null; },
    },
  });
  return { service, runs, reads, writes, refreshes, queries, evidence,
    setDebug: (value: boolean) => { debug = value; }, setProvider: (value: AIProvider) => { provider = value; } };
}
const missing = (error: unknown) => error instanceof WorkspaceError && error.code === "NOT_FOUND" && error.status === 404;

test("clarification stays scoped, limits evidence to the selected subject, and carries it into follow-ups", async () => {
  const f = fixture([sample(), sample()]);
  const previousRunId = crypto.randomUUID(), selected = f.evidence[1].documentId;
  const initial = await f.service.prepare(userId, { query: "Retention?", mode: "find", workspaceId });
  const saved = await f.service.execute(initial, new AbortController().signal, () => {});
  f.runs.set(previousRunId, { query: "x".repeat(3500), result: {
    ...saved, answerState: "needs_clarification", answer: {
      answer: "Which document?", citations: [], confidence: "low", insufficientEvidence: false,
      clarification: { required: true, options: [{ label: "Second policy", documentIds: [selected] }] },
    },
  } });
  const prepared = await f.service.prepare(userId, { query: "Retention?", mode: "find", workspaceId, previousRunId, clarificationOption: 0 });
  assert.equal(prepared.rewrittenQuery, `${"x".repeat(3000)}\nSelected subject: Second policy`);
  assert.deepEqual(f.reads.at(-1), { userId, workspaceId });
  const result = await f.service.execute(prepared, new AbortController().signal, () => {});
  assert.deepEqual(result.sources.map(source => source.documentId), [selected]);
  assert.deepEqual(result.nearest.map(source => source.documentId), [selected]);
  assert.equal(result.candidateCount, 2);
  assert.deepEqual(result.selectedDocumentIds, [selected]);
  assert.deepEqual(f.writes.at(-1)?.scope, { userId, workspaceId, documentIds: [selected] });
  const followUp = await f.service.prepare(userId, { query: "What about it?", mode: "ask", workspaceId, previousRunId: result.id });
  assert.match(followUp.rewrittenQuery, /Follow-up: What about it\?/);
  assert.deepEqual(followUp.selectedDocumentIds, [selected]);
  const unrelated = await f.service.prepare(userId, { query: "Independent question", mode: "ask", workspaceId, previousRunId: result.id });
  assert.equal(unrelated.rewrittenQuery, "Independent question");
  assert.equal(unrelated.selectedDocumentIds, undefined);
  await assert.rejects(f.service.prepare(crypto.randomUUID(), { query: "Retention?", mode: "ask", previousRunId, clarificationOption: 0 }), missing);
  await assert.rejects(f.service.prepare(userId, { query: "Retention?", mode: "ask", workspaceId: crypto.randomUUID(), previousRunId, clarificationOption: 0 }), missing);
});

test("missing and invalid clarification options fail before search execution", async () => {
  const f = fixture();
  for (const input of [
    { clarificationOption: 0 },
    { previousRunId: crypto.randomUUID(), clarificationOption: 0 },
  ]) await assert.rejects(f.service.prepare(userId, { query: "Retention?", mode: "ask", ...input }), missing);
  assert.equal(f.queries.length, 0);
  assert.equal(f.writes.length, 0);
});

test("find and unavailable answers retain sources; history only exposes debug in development", async () => {
  const f = fixture(); f.setDebug(true);
  const prepared = await f.service.prepare(userId, { query: "Retention?", mode: "find", workspaceId });
  const found = await f.service.execute(prepared, new AbortController().signal, () => {});
  assert.equal(found.answer, null); assert.equal(found.verification, undefined); assert.ok(found.debug);
  f.setDebug(false);
  const saved = await f.service.getRun(userId, found.id);
  assert.equal(saved.debug, undefined); assert.ok(f.runs.get(found.id)?.result.debug);
  const unavailable = await f.service.execute({ ...prepared, input: { ...prepared.input, mode: "ask" } }, new AbortController().signal, () => {});
  assert.equal(unavailable.answer, null); assert.equal(unavailable.answerState, "error");
  assert.equal(unavailable.verification?.status, "unavailable"); assert.equal(unavailable.sources.length, 1);
  assert.equal(unavailable.debug, undefined);
  assert.equal((await f.service.getSource(userId, f.evidence[0].id)).id, f.evidence[0].id);
  await assert.rejects(f.service.getSource(crypto.randomUUID(), f.evidence[0].id), missing);
  await assert.rejects(f.service.getRun(crypto.randomUUID(), found.id), missing);
});

test("ask publishes a verified answer with source metadata and records the same final result", async () => {
  const f = fixture(), stages: string[] = [];
  f.setProvider({
    name: "fixture", models: { main: "fixture", small: "fixture" },
    async generateObject(input) {
      const response = verifierFixtureResponse(input.prompt) ?? {
        statements: [{ text: "Retention is 6 hours.", sourceIds: ["S1"] }],
        confidence: "high", insufficientEvidence: false, evidenceDecision: { supported: true, missingInformation: [] },
      };
      return { object: input.schema.parse(response), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    },
    async generateText() { throw new Error("Unexpected text generation"); },
    async *streamText() { throw new Error("Unverified drafts must never stream"); },
    async callTools() { throw new Error("Search has no tools"); },
  });
  const prepared = await f.service.prepare(userId, { query: "Retention?", mode: "ask", workspaceId });
  const result = await f.service.execute(prepared, new AbortController().signal, stage => stages.push(stage));
  assert.equal(result.verification?.status, "verified"); assert.equal(result.answerState, "answered");
  assert.match(result.answer!.answer, /Retention is 6 hours/);
  assert.equal(result.answer!.citations[0].chunkId, f.evidence[0].id);
  assert.deepEqual(f.writes[0].result, result);
  assert.ok(stages.includes("正在生成回答"));
});

test("an aborted search never saves or returns its result", async () => {
  const f = fixture(), controller = new AbortController();
  const prepared = await f.service.prepare(userId, { query: "Retention?", mode: "find" });
  controller.abort();
  await assert.rejects(f.service.execute(prepared, controller.signal, () => {}), { name: "AbortError" });
  assert.equal(f.writes.length, 0);
});

test("PostgreSQL search history preserves results, diagnostics, tenant isolation and workspace scope", async () => {
  const db = new PGlite();
  try {
    await applyMigrations({ async query(sql: string, values?: unknown[]) {
      return values ? db.query(sql, values) : (await db.exec(sql)).at(-1)!;
    } });
    await db.exec(`create role search_test_user;
      grant usage on schema filemind to search_test_user;
      grant select,insert on all tables in schema filemind to search_test_user;`);
    await db.query("insert into filemind.profiles(id) values($1)", [userId]);
    await db.query("insert into filemind.workspaces(id,user_id,name,snapshot) values($1,$2,'fixture','{}')", [workspaceId, userId]);
    const history = new PostgresSearchHistory({ query: (owner, sql, values) => runTenantQuery({
      async query(statement, parameters) {
        const result = await db.query(statement, parameters);
        if (statement === "begin") await db.exec("set local role search_test_user");
        return result;
      }, release() {},
    }, owner, sql, values) });
    const f = fixture(), prepared = await f.service.prepare(userId, { query: "Retention?", mode: "find", workspaceId });
    const result = await f.service.execute(prepared, new AbortController().signal, () => {});
    const diagnostics = { ...f.writes[0].diagnostics, embedding: { provider: "fixture", model: "fixture-model", dimensions: 64, mock: false } };
    await history.save({ userId, workspaceId }, result, diagnostics);
    assert.deepEqual((await history.get({ userId, workspaceId }, result.id))?.result, JSON.parse(JSON.stringify(result)));
    assert.equal((await history.get({ userId }, result.id))?.query, result.rewrittenQuery);
    assert.equal(await history.get({ userId: crypto.randomUUID() }, result.id), undefined);
    assert.equal(await history.get({ userId, workspaceId: crypto.randomUUID() }, result.id), undefined);
    assert.equal((await history.list(userId)).length, 1);
    assert.deepEqual(await history.list(crypto.randomUUID()), []);
    const row = (await db.query<{ vector_model: string; evidence_ids: string[]; retrieved_chunk_ids: string[] }>(
      "select vector_model,evidence_ids,retrieved_chunk_ids from filemind.retrieval_runs where id=$1", [result.id])).rows[0];
    assert.equal(row.vector_model, "fixture-model");
    assert.deepEqual(row.evidence_ids, result.sources.map(source => source.id));
    assert.deepEqual(row.retrieved_chunk_ids, diagnostics.candidateIds);
  } finally { await db.close(); }
});
