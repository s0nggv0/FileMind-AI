import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyKimiLive, renderGateReport } from "../scripts/verify-kimi-live";

const env = { KIMI_API_KEY: "synthetic-secret-only", AI_PROVIDER: "kimi" };
function completion(content: string, toolCalls?: unknown[]) {
  return Response.json({ id: "fixture", object: "chat.completion", created: 1, model: "kimi-k2.6", choices: [{ index: 0, finish_reason: toolCalls ? "tool_calls" : "stop", message: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } });
}
test("live gate checks all three protocols using the existing adapter and registry", async () => {
  let requests = 0;
  const report = await verifyKimiLive(env, async (_url, init) => {
    requests++;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.model, "kimi-k2.6");
    assert.ok(init?.signal);
    if (body.tools) return completion("", [{ id: "call-1", type: "function", function: { name: "read_document", arguments: JSON.stringify({ documentId: "00000000-0000-4000-8000-000000000005" }) } }]);
    if (body.response_format) return completion(JSON.stringify({ summary: "Self-attention relates tokens.", category: "AI", tags: ["Transformer", "tokens", "attention"], confidence: 0.9, isNewCategory: false, reason: "AI topic.", filenameSuggestion: { shouldRename: false, suggestedFilename: null, reason: "Keep." } }));
    return completion("OK");
  });
  assert.equal(requests, 3); assert.equal(report.REAL_KIMI_VERIFIED, true);
  assert.ok(report.steps.every(step => step.passed && step.httpStatus === 200 && step.totalTokens === 8));
});
test("live gate stops immediately and never logs credentials or raw provider errors", async () => {
  let requests = 0;
  const report = await verifyKimiLive(env, async () => { requests++; return Response.json({ error: { message: env.KIMI_API_KEY } }, { status: 401 }); });
  assert.equal(requests, 1); assert.equal(report.REAL_KIMI_VERIFIED, false);
  assert.equal(report.steps[0].httpStatus, 401); assert.equal(report.steps[0].code, "INVALID_KEY");
  assert.ok(!renderGateReport(report).includes(env.KIMI_API_KEY));
});
test("live gate refuses missing credentials without making a request", async () => {
  const report = await verifyKimiLive({}, async () => { throw new Error("Should not request"); });
  assert.equal(report.REAL_KIMI_VERIFIED, false); assert.equal(report.steps[0].code, "CONFIGURATION");
});
test("live gate reports cancellation and never advances to the next probe", async () => {
  const report = await verifyKimiLive(env, async () => { throw new DOMException("timeout", "TimeoutError"); });
  assert.equal(report.steps.length, 1); assert.equal(report.steps[0].code, "TIMEOUT");
});
