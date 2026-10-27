import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syntheticDataset } from "./fixtures/rag-regression/dataset";
import { hash, judge, summarize, validateDataset, PROTOCOL, type Observation } from "../scripts/evaluation/regression/protocol";
import { assertComparable, assertPrivateInput, exclusiveJSON, RequestBudget, RunStore, selectAttempts } from "../scripts/evaluation/regression/execution";

const data = validateDataset(syntheticDataset);
function observation(id = "compare"): Observation {
  const q = data.questions.find(q => q.id === id)!;
  const retrieved = q.relevantDocuments.map(documentId => {
    const d = data.documents.find(d => d.id === documentId)!;
    return { chunkId: `chunk-${documentId}`, documentId, documentHash: hash(d.text), content: d.text, charStart: 0, charEnd: d.text.length };
  });
  const citations = retrieved.map((p, i) => ({ sourceId: `S${i + 1}`, chunkId: p.chunkId, documentId: p.documentId }));
  return { questionId: id, attempt: 1, status: q.answerability === "no-answer" ? "refused" : "answered", retrieved, claims: [...q.facts.map(f => ({ text: f.statements[0], sourceIds: citations.filter(c => q.evidence.some(e => f.evidenceIds.includes(e.id) && e.documentId === c.documentId)).map(c => c.sourceId) })), ...q.conflictStatements.map(text => ({ text, sourceIds: citations.map(c => c.sourceId) }))], citations, sourceMap: Object.fromEntries(citations.map(c => [c.sourceId, c.chunkId])), conflictDetected: id === "conflict", runtimeVerification: "not-run", reason: null, latencyMs: 10, requests: 0, tokens: null };
}
test("independent synthetic gold has valid positions, scopes and coverage categories", () => {
  assert.equal(data.kind, "synthetic");
  assert.ok(data.documents.find(d => d.id === "long")!.text.length > 7000);
  assert.ok(data.questions.some(q => q.tags.includes("image-text-transcript")));
  const bad = structuredClone(data); bad.questions[0].evidence[0].charStart++;
  assert.throws(() => validateDataset(bad), /position/);
  assert.throws(() => validateDataset({ ...data, kind: "authorized-real" }), /authorization/);
  const authorized = { ...data, kind: "authorized-real", authorization: { reference: "operator-record-1", deidentified: true, evaluationAllowed: true } };
  assert.throws(() => validateDataset(authorized, "wrong-record"), /authorization/);
  assert.equal(validateDataset(authorized, "operator-record-1").kind, "authorized-real");
  assert.throws(() => assertPrivateInput("tests/private.json"));
  assert.ok(assertPrivateInput(".filemind/evaluation-input/authorized.json"));
});
test("micro metrics expose sample counts and denominators independently", () => {
  const summary = summarize(data, data.questions.map(q => observation(q.id)));
  assert.equal(summary.automatedRuleJudgment.documentRecall.value, 1);
  assert.equal(summary.automatedRuleJudgment.correctRefusal.denominator, 2);
  assert.equal(summary.automatedRuleJudgment.falseRefusal.denominator, 5);
  assert.equal(summary.automatedRuleJudgment.comparisonSourceCompleteness.denominator, 2);
  assert.equal(summary.automatedRuleJudgment.conflictDisclosure.value, 1);
  assert.equal(summary.modelJudgment.performed, false);
  assert.equal(summary.humanReview.reviewed, 0);
  assert.equal(summary.tokens.total, null);
});
test("deliberate missed retrieval and incomplete comparisons are identified", () => {
  const row = observation(); row.retrieved = row.retrieved.slice(0, 1);
  const result = judge(data, data.questions.find(q => q.id === row.questionId)!, row);
  assert.equal(result.recalledDocuments, 1); assert.equal(result.comparisonComplete, false);
  assert.ok(result.failures.includes("retrieval-omission"));
});
test("missing and wrong citations are distinct from supported literal facts", () => {
  const row = observation(); row.citations = [];
  let result = judge(data, data.questions.find(q => q.id === row.questionId)!, row);
  assert.equal(result.supportedClaims, 2); assert.equal(result.citedClaims, 0);
  assert.ok(result.failures.includes("generation-error"));
  row.citations = [{ sourceId: "S1", chunkId: "chunk-south", documentId: "north" }];
  result = judge(data, data.questions.find(q => q.id === row.questionId)!, row);
  assert.equal(result.validCitations, 0);
});
test("false refusal, verifier rejection and outage never become correct refusals", () => {
  const row = observation(); row.status = "refused"; row.claims = []; row.citations = [];
  assert.ok(judge(data, data.questions.find(q => q.id === row.questionId)!, row).failures.includes("false-refusal"));
  const missing = observation("missing-fact"); missing.status = "service-failure";
  assert.equal(summarize(data, [missing]).automatedRuleJudgment.correctRefusal.numerator, 0);
  missing.status = "verification-rejected";
  assert.equal(summarize(data, [missing]).failureCounts["verification-rejection"], 1);
  assert.equal(summarize(data, [missing]).automatedRuleJudgment.correctRefusal.numerator, 0);
});
test("repeated text must match document version and offset; a keyword is not factual proof", () => {
  const row = observation("shared"), q = data.questions.find(q => q.id === "shared")!;
  row.retrieved[0].charStart = q.evidence[0].charEnd;
  assert.equal(judge(data, q, row).recalledEvidence, 0);
  row.retrieved[0].charStart = 0; row.retrieved[0].documentHash = "old-version";
  assert.equal(judge(data, q, row).recalledEvidence, 0);
  row.claims[0].text = "All transfers require a signed receipt, and insurance costs 900 dollars.";
  assert.equal(judge(data, q, row).unassessedClaims, 1);
});
test("conflict requires visible disclosure and both attributed facts, not a model flag", () => {
  const row = observation("conflict"), q = data.questions.find(q => q.id === "conflict")!;
  row.claims.pop(); assert.equal(judge(data, q, row).conflictDisclosed, false);
});
test("immutable attempt files preserve first failure after successful manual retry", async () => {
  const base = await mkdtemp(join(tmpdir(), "filemind-eval-")), store = await RunStore.create(base);
  try {
    const first = observation(); first.status = "service-failure";
    const final = observation(); final.attempt = 2;
    await store.attempt(first); await store.attempt(final);
    await assert.rejects(store.attempt(first), /EEXIST/);
    assert.equal(selectAttempts([first, final], "first")[0].status, "service-failure");
    assert.equal(selectAttempts([first, final], "final")[0].status, "answered");
    await exclusiveJSON(join(store.root, "summary.json"), { first, final });
    await assert.rejects(exclusiveJSON(join(store.root, "summary.json"), {}), /EEXIST/);
    assert.match(await readFile(join(store.root, "events.jsonl"), "utf8"), /service-failure/);
  } finally { await store.close(); await rm(base, { recursive: true, force: true }); }
});
test("version comparison rejects changed corpus/configuration and allows code-only changes", () => {
  const a = { protocol: PROTOCOL, fingerprint: "same", rows: [] };
  assert.doesNotThrow(() => assertComparable(a, { ...a }));
  assert.throws(() => assertComparable(a, { ...a, fingerprint: "different" }), /Cannot compare/);
});
test("live request budget counts failures, usage, transport attempts and stops without retry", async () => {
  let calls = 0;
  const budget = new RequestBudget({ maxRequests: 3, timeoutMs: 1000, runTimeoutMs: 5000, stopAfterFailures: 2 }, async () => {}, async () => { calls++; return Response.json({ usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }, { status: calls === 1 ? 200 : 503 }); });
  for (let i = 0; i < 3; i++) await budget.fetch("https://api.moonshot.cn/v1/chat/completions");
  await assert.rejects(budget.fetch("https://api.moonshot.cn/v1/chat/completions"), /stopped/);
  assert.equal(calls, 3); assert.equal(budget.events.filter(e => e.state === "started").length, 3);
  assert.equal(budget.events[1].tokens?.total, 5);
  await assert.rejects(budget.fetch("https://untrusted.invalid/v1"), /Untrusted/);
});
test("live authentication and timeout stop conditions are recorded safely", async () => {
  const auth = new RequestBudget({ maxRequests: 5, timeoutMs: 5, runTimeoutMs: 100, stopAfterFailures: 1 }, async () => {}, async () => new Response("private secret", { status: 401 }));
  await auth.fetch("https://api.moonshot.cn/v1"); assert.equal(auth.stopped(), true);
  assert.doesNotMatch(JSON.stringify(auth.events), /private secret/);
  const timeout = new RequestBudget({ maxRequests: 5, timeoutMs: 5, runTimeoutMs: 100, stopAfterFailures: 1 }, async () => {}, async (_url, init) => new Promise((_resolve, reject) => { init!.signal!.addEventListener("abort", () => reject(new Error("secret stack")), { once: true }); }));
  const keepAlive = setTimeout(() => {}, 30);
  try { await assert.rejects(timeout.fetch("https://api.moonshot.cn/v1"), /unavailable/); assert.equal(timeout.stopped(), true); }
  finally { clearTimeout(keepAlive); }
});
