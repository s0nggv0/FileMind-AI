import { loadEnvConfig } from "@next/env";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticDataset } from "../../tests/fixtures/rag-regression/dataset";
import { scriptedResponses } from "../../tests/fixtures/rag-regression/responses";
import { isolatedKnowledge } from "../../tests/helpers/isolated-knowledge";
import { MockEmbeddingProvider, type EmbeddingProvider } from "../../src/lib/retrieval/embedding-provider";
import { DashScopeEmbeddingProvider } from "../../src/lib/retrieval/dashscope-provider";
import { IndexingPipeline } from "../../src/lib/retrieval/indexing";
import { RetrievalEngine } from "../../src/lib/retrieval/engine";
import { buildRAGContext, generateGroundedAnswer } from "../../src/lib/retrieval/rag";
import { answerUnits, VERIFIER_VERSION } from "../../src/lib/retrieval/answer-verifier";
import { CHUNK_VERSION, retrievalConfig } from "../../src/lib/retrieval/config";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../../src/lib/ai/models";
import { aiLimits } from "../../src/lib/ai/config";
import { hash, judge, PROTOCOL, summarize, validateDataset, type Observation, type Question } from "./regression/protocol";
import { assertComparable, assertPrivateInput, exclusiveJSON, readReport, RequestBudget, RunStore, selectAttempts } from "./regression/execution";

const FAULTS = ["retrieval-omission", "missing-citation", "false-refusal", "service-failure", "verification-rejection", "hidden-conflict"] as const;
function options(args: string[]) {
  const values = new Map<string, string>();
  const switches = new Set(["--live", "--inject-failures"]);
  const valued = new Set(["--dataset", "--authorization-id", "--max-requests", "--timeout-ms", "--run-timeout-ms", "--retry-run", "--question", "--compare"]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (values.has(key) || (!switches.has(key) && !valued.has(key))) throw new Error("Unknown or duplicate evaluation option");
    if (switches.has(key)) values.set(key, "true");
    else { const value = args[++i]; if (!value || value.startsWith("--")) throw new Error("Evaluation option value required"); values.set(key, value); }
  }
  if (values.has("--live") && !values.has("--max-requests")) throw new Error("Live evaluation requires explicit --max-requests (1..100)");
  if (values.has("--live") && values.has("--inject-failures")) throw new Error("Failure injection is offline only");
  if (values.has("--question") !== values.has("--retry-run")) throw new Error("Manual retry requires both --retry-run and --question");
  return values;
}
const stableUUID = (id: string) => { const h = hash(`regression:${id}`); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
function inject(row: Observation, q: Question) {
  if (row.attempt !== 1) return; // Only an explicit manual retry can recover.
  if (q.id === "compare") row.retrieved = row.retrieved.filter(p => p.documentId !== "south");
  if (q.id === "long-tail") row.citations = [];
  if (q.id === "shared") { row.status = "refused"; row.claims = []; row.citations = []; }
  if (q.id === "image-text") { row.status = "verification-rejected"; row.runtimeVerification = "rejected"; row.claims = []; row.citations = []; }
  if (q.id === "missing-fact") { row.status = "service-failure"; row.reason = "INJECTED_SERVICE_FAILURE"; }
  if (q.id === "conflict") row.claims = row.claims.filter(c => !c.text.includes("disagree"));
}
async function codeIdentity() {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();
  const paths = git("ls-files", "src/lib/retrieval", "src/lib/ai", "src/lib/workspace", "scripts/evaluation", "tests/helpers/isolated-knowledge.ts", "tests/fixtures/rag-regression", "package-lock.json").split(/\r?\n/).filter(Boolean);
  // Include current untracked harness code during the first development run.
  for (const path of git("ls-files", "--others", "--exclude-standard", "scripts/evaluation/regression", "scripts/evaluation/evaluate-regression.ts", "tests/fixtures/rag-regression").split(/\r?\n/).filter(Boolean)) paths.push(path);
  const files = Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path => [path, hash((await readFile(path, "utf8")).replaceAll("\r\n", "\n"))])));
  return { commit: git("rev-parse", "HEAD"), dirty: Boolean(git("status", "--porcelain")), sourceHash: hash(files), files };
}

export async function runRegression(args: string[]) {
  const opts = options(args), live = opts.has("--live"), injected = opts.has("--inject-failures");
  const data = validateDataset(opts.has("--dataset") ? JSON.parse(await readFile(assertPrivateInput(opts.get("--dataset")!), "utf8")) : syntheticDataset, opts.get("--authorization-id"));
  if (opts.has("--dataset") && !live) throw new Error("External corpus requires explicit live mode; scripted responses cover only the public synthetic regression");
  if (opts.has("--question") && !data.questions.some(q => q.id === opts.get("--question"))) throw new Error("Unknown retry question");
  if (live) loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const store = await RunStore.create(resolve("artifacts/retrieval-qa-regression"));
  let isolated: Awaited<ReturnType<typeof isolatedKnowledge>> | undefined;
  try {
    const budget = live ? new RequestBudget({ maxRequests: Number(opts.get("--max-requests")), timeoutMs: Number(opts.get("--timeout-ms") ?? 30000), runTimeoutMs: Number(opts.get("--run-timeout-ms") ?? 180000), stopAfterFailures: 2 }, event => store.event("transport", event)) : null;
    const embedding: EmbeddingProvider = live ? new DashScopeEmbeddingProvider({ apiKey: process.env.EMBEDDING_API_KEY || process.env.DASHSCOPE_API_KEY || "", baseURL: process.env.EMBEDDING_BASE_URL || "", model: process.env.EMBEDDING_MODEL || "", dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1024), fetch: budget!.fetch }) : new MockEmbeddingProvider();
    const models = live ? readModelConfig(process.env) : null;
    const provider = live ? createKimiProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL, models: models!, fetch: budget!.fetch }) : null;
    const endpoint = (value: string) => { const url = new URL(value); return url.origin + url.pathname.replace(/\/$/, ""); };
    const configuration = { protocol: PROTOCOL, retrievalConfig, chunkVersion: CHUNK_VERSION, verifierVersion: VERIFIER_VERSION, reranker: "disabled", embedding: embedding.getModelInfo(), answerAdapter: live ? "production-grounded-rag" : "scripted-test-double-v1", models, aiLimits: live ? aiLimits : null, endpoints: live ? { generation: endpoint(process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1"), embedding: endpoint(process.env.EMBEDDING_BASE_URL!) } : null, limits: budget?.limits ?? null, injection: injected ? FAULTS : [] };
    const corpusHashes = Object.fromEntries(data.documents.map(d => [d.id, hash(d.text)]));
    const fingerprint = hash({ configuration, dataset: data });
    const identity = { protocol: PROTOCOL, fingerprint, code: await codeIdentity(), runtime: { node: process.version, platform: process.platform, arch: process.arch }, configuration, corpusHashes, corpusHash: hash(data.documents), goldHash: hash(data.questions), dataset: { id: data.id, kind: data.kind, goldAuthor: data.goldAuthor, goldMethod: data.goldMethod, authorizationReference: data.authorization?.reference ?? null }, startedAt: new Date().toISOString(), live, realCorpusExecuted: data.kind === "authorized-real" && live, outputPrivacy: "local ignored artifacts; never commit private inputs or outputs" };
    await exclusiveJSON(join(store.root, "manifest.json"), identity);
    await store.event("run-start", identity);
    const comparison = opts.has("--compare") ? await readReport(opts.get("--compare")!) : null;
    if (comparison) assertComparable({ protocol: PROTOCOL, fingerprint, rows: [] }, comparison);
    let rows: Observation[] = [];
    if (opts.has("--retry-run")) {
      const parent = await readReport(opts.get("--retry-run")!);
      assertComparable({ protocol: PROTOCOL, fingerprint, rows: [] }, parent);
      rows = parent.rows;
      await store.event("manual-retry-parent", { path: resolve(opts.get("--retry-run")!), sha256: hash(await readFile(opts.get("--retry-run")!, "utf8")), rows });
    }
    isolated = await isolatedKnowledge();
    const { knowledge, vectors, workspaces } = isolated;
    const userId = stableUUID("owner"), workspace = await workspaces.create(userId, "Disposable regression corpus");
    const externalId = new Map(data.documents.map(d => [stableUUID(d.id), d.id]));
    await workspaces.save(userId, { ...workspace, documents: data.documents.map(d => ({ id: stableUUID(d.id), name: d.name, type: "txt" as const, mimeType: "text/plain", size: Buffer.byteLength(d.text), contentHash: hash(d.text), parseStatus: "completed" as const, metadata: { addedAt: "2026-10-27T00:00:00.000Z", structure: d.origin === "synthetic-ocr-transcript" ? { knowledgeSections: [{ charStart: 0, charEnd: d.text.length, source: "ocr" as const }] } : undefined } })), texts: Object.fromEntries(data.documents.map(d => [stableUUID(d.id), d.text])) });
    let offlineEmbeddingCalls = 0;
    const countedEmbedding: EmbeddingProvider = { getModelInfo: () => embedding.getModelInfo(), embedQuery: async text => { if (!live) offlineEmbeddingCalls++; return embedding.embedQuery(text); }, embedDocuments: async texts => { if (!live) offlineEmbeddingCalls++; return embedding.embedDocuments(texts); } };
    const indexStart = performance.now();
    const indexed = await new IndexingPipeline(knowledge, vectors, countedEmbedding, {}, { storageRoot: join(store.root, "index-storage") }).indexLibrary({ userId, workspaceId: workspace.id });
    const indexUnavailable = new Set(indexed.filter(d => d.status !== "ready").map(d => externalId.get(d.documentId)));
    await store.event("indexing", { indexed, latencyMs: performance.now() - indexStart, offlineEmbeddingCalls });
    const engine = new RetrievalEngine(countedEmbedding, vectors, knowledge, null);
    const queryList = opts.has("--question") ? data.questions.filter(q => q.id === opts.get("--question")) : data.questions;
    for (const q of queryList) {
      const started = performance.now(), eventsBefore = budget?.events.length ?? 0;
      const attempt = Math.max(0, ...rows.filter(r => r.questionId === q.id).map(r => r.attempt)) + 1;
      const row: Observation = { questionId: q.id, attempt, status: "service-failure", retrieved: [], claims: [], citations: [], sourceMap: {}, reason: null, conflictDetected: false, runtimeVerification: "not-run", latencyMs: 0, requests: 0, tokens: null };
      row.origin = { run: store.root, commit: identity.code.commit, sourceHash: identity.code.sourceHash, fingerprint, startedAt: new Date().toISOString() };
      row.serviceFaults = q.scope.some(id => indexUnavailable.has(id)) ? ["INDEX_UNAVAILABLE"] : [];
      await store.event("attempt-start", { questionId: q.id, attempt, scope: q.scope });
      if (budget) budget.phase = `${q.id}:attempt-${attempt}`;
      try {
        if (budget?.stopped()) { row.status = "stopped"; row.reason = "REQUEST_BUDGET_OR_STOP_CONDITION"; }
        else {
          const scope = { userId, workspaceId: workspace.id, documentIds: q.scope.map(stableUUID) };
          const retrieved = await engine.retrieve(scope, q.query);
          row.retrieved = retrieved.evidence.map(p => ({ chunkId: p.id, documentId: externalId.get(p.documentId)!, documentHash: p.documentHash ?? "", content: p.content, charStart: p.charStart, charEnd: p.charEnd }));
          const context = buildRAGContext(retrieved.evidence);
          row.sourceMap = Object.fromEntries(context.sources.map(s => [s.sourceId, s.id]));
          await store.event("retrieval", { questionId: q.id, attempt, scope: q.scope, route: retrieved.route, latency: retrieved.latency, semanticUnavailable: retrieved.semanticUnavailable, evidence: row.retrieved });
          if (live) {
            const result = await generateGroundedAnswer(q.query, retrieved.evidence, scope, provider, knowledge.getSource.bind(knowledge), AbortSignal.timeout(budget!.limits.timeoutMs));
            row.reason = result.reason ?? null;
            row.runtimeVerification = result.verification?.accepted ? "accepted" : result.verificationAttempts?.some(a => !a.accepted) ? "rejected" : "not-run";
            row.status = result.reason === "VERIFICATION_FAILED" ? "verification-rejected" : result.unavailable || !result.answer ? "service-failure" : result.answer.insufficientEvidence ? "refused" : "answered";
            row.conflictDetected = result.answer?.conflict?.detected ?? false;
            if (row.status === "answered" && result.answer) {
              row.claims = answerUnits(result.answer.answer).map(u => ({ text: u.text, sourceIds: u.citedSourceIds }));
              row.citations = result.answer.citations.map(c => ({ ...c, documentId: externalId.get(c.documentId)! }));
            }
            await store.event("runtime-verification", { questionId: q.id, attempt, status: row.runtimeVerification, attempts: result.verificationAttempts?.map(v => ({ accepted: v.accepted, completeness: v.completeness, faithfulness: v.faithfulness, version: v.version })) ?? [] });
          } else {
            const scripted = scriptedResponses[q.id];
            row.status = scripted.length ? "answered" : "refused";
            row.claims = scripted.map(c => { const s = context.sources.find(s => externalId.get(s.documentId) === c.documentId && s.content.includes(c.text)) ?? context.sources.find(s => externalId.get(s.documentId) === c.documentId); return { text: c.text, sourceIds: s ? [s.sourceId] : [] }; });
            row.citations = context.sources.filter(s => row.claims.some(c => c.sourceIds.includes(s.sourceId))).map(s => ({ sourceId: s.sourceId, chunkId: s.id, documentId: externalId.get(s.documentId)! }));
            row.conflictDetected = q.id === "conflict";
            if (injected) { inject(row, q); if (attempt === 1) await store.event("fault-calibration", { questionId: q.id, intentional: true, boundary: "scripted adapter observation; original retrieval retained" }); }
          }
          if (retrieved.semanticUnavailable) row.serviceFaults.push("EMBEDDING_SERVICE_UNAVAILABLE");
        }
      } catch { row.reason = "EVALUATION_OPERATION_UNAVAILABLE"; row.status = "service-failure"; }
      row.latencyMs = performance.now() - started;
      const events = budget?.events.slice(eventsBefore) ?? [], measured = events.filter(e => e.state !== "started" && e.tokens);
      row.requests = events.filter(e => e.state === "started").length;
      const tokenSum = (key: "prompt" | "completion" | "total") => measured.some(e => e.tokens?.[key] != null) ? measured.reduce((sum, e) => sum + (e.tokens?.[key] ?? 0), 0) : null;
      row.tokens = measured.length ? { prompt: tokenSum("prompt"), completion: tokenSum("completion"), total: tokenSum("total") } : null;
      await store.attempt(row); rows.push(row);
      console.log(`${q.id} attempt ${attempt}: ${row.status}; ${judge(data, q, row).failures.join(", ") || "no rule failure"}`);
    }
    const report = { ...identity, completedAt: new Date().toISOString(), rows, first: summarize(data, selectAttempts(rows, "first")), final: summarize(data, selectAttempts(rows, "final")), allAttempts: summarize(data, rows), offlineEmbeddingCalls, transport: budget ? { limits: budget.limits, stopped: budget.stopped(), requests: budget.events.filter(e => e.state === "started").length, usageAvailableRequests: budget.events.filter(e => e.tokens != null).length, tokensTotal: budget.events.some(e => e.tokens != null) ? budget.events.reduce((s, e) => s + (e.tokens?.total ?? 0), 0) : null } : { requests: 0, tokensTotal: null } };
    await exclusiveJSON(join(store.root, "report.json"), report);
    await exclusiveJSON(join(store.root, "human-review-template.json"), { reportHash: hash(report), fingerprint, reviewer: "", reviews: rows.map(row => ({ questionId: row.questionId, attempt: row.attempt, factualSupport: null, citationSupport: null, refusalCorrect: null, conflictDisclosed: null })) });
    if (comparison) {
      await exclusiveJSON(join(store.root, "comparison.json"), { previous: resolve(opts.get("--compare")!), current: join(store.root, "report.json"), first: { previous: summarize(data, selectAttempts(comparison.rows, "first")), current: report.first }, final: { previous: summarize(data, selectAttempts(comparison.rows, "final")), current: report.final } });
    }
    const failures = Object.values(report.final.failureCounts).reduce((s, n) => s + n, 0);
    console.log(JSON.stringify({ report: join(store.root, "report.json"), corpus: data.kind, live, firstFailures: report.first.failureCounts, finalFailures: report.final.failureCounts, realCorpusExecuted: report.realCorpusExecuted, humanReview: "pending" }, null, 2));
    if (injected && !opts.has("--retry-run")) {
      for (const failure of ["retrieval-omission", "generation-error", "false-refusal", "verification-rejection", "service-failure"]) if (!report.first.failureCounts[failure]) throw new Error("Fault calibration did not detect required failure");
    } else if (failures || report.final.reviewRequiredSamples) process.exitCode = 1;
    return { root: store.root, report };
  } catch {
    await store.event("run-failed", { reason: "EVALUATION_FAILED", historicalAttemptsPreserved: true });
    throw new Error(`Evaluation failed; inspect local receipts at ${store.root}`);
  } finally { await isolated?.db.close(); await store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runRegression(process.argv.slice(2)).catch(error => { console.error(error instanceof Error && error.message.startsWith("Evaluation failed;") ? error.message : "Evaluation did not start: check flags, corpus authorization and provider configuration. Live mode requires --live --max-requests N."); process.exitCode = 1; });
}
