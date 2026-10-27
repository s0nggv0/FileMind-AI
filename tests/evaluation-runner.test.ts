import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runRegression } from "../scripts/evaluation/evaluate-regression";
import { humanReview } from "../scripts/evaluation/review-regression";
import { hash } from "../scripts/evaluation/regression/protocol";

test("actual isolated retrieval repeats, fault calibration detects failures, manual retry retains first failure", async () => {
  const baseline = await runRegression([]);
  assert.equal(baseline.report.transport.requests, 0);
  assert.equal(baseline.report.first.automatedRuleJudgment.evidenceRecall.value, 1);
  assert.equal(baseline.report.first.automatedRuleJudgment.claimCitationSupport.value, 1);
  const repeated = await runRegression(["--compare", join(baseline.root, "report.json")]);
  assert.deepEqual(baseline.report.first.automatedRuleJudgment, repeated.report.first.automatedRuleJudgment);
  assert.notEqual(baseline.root, repeated.root);
  const bad = await runRegression(["--inject-failures"]);
  assert.equal(bad.report.first.failureCounts["retrieval-omission"], 1);
  assert.equal(bad.report.first.failureCounts["false-refusal"], 1);
  assert.equal(bad.report.first.failureCounts["service-failure"], 1);
  assert.equal(bad.report.first.failureCounts["verification-rejection"], 1);
  assert.equal(bad.report.first.automatedRuleJudgment.conflictDisclosure.value, 0);
  const preserved = await readFile(join(bad.root, "report.json"), "utf8"), exitCode = process.exitCode;
  try {
    const retry = await runRegression(["--inject-failures", "--retry-run", join(bad.root, "report.json"), "--question", "missing-fact"]);
    assert.equal(retry.report.rows.filter(r => r.questionId === "missing-fact").length, 2);
    assert.equal(retry.report.rows.find(r => r.questionId === "missing-fact" && r.attempt === 1)?.origin?.run, bad.root);
    assert.equal(retry.report.rows.find(r => r.questionId === "missing-fact" && r.attempt === 2)?.origin?.run, retry.root);
    assert.equal(retry.report.rows.find(r => r.questionId === "missing-fact" && r.attempt === 2)?.origin?.sourceHash, retry.report.code.sourceHash);
    assert.equal(retry.report.first.failureCounts["service-failure"], 1);
    assert.equal(retry.report.final.failureCounts["service-failure"], 0);
    assert.equal(await readFile(join(bad.root, "report.json"), "utf8"), preserved);
    assert.equal(process.exitCode, 1, "other unresolved injected failures still fail a manual retry run");
  } finally { process.exitCode = exitCode; }
  await assert.rejects(runRegression(["--live"]), /max-requests/);
  await assert.rejects(runRegression(["--compare", join(bad.root, "report.json")]), /Evaluation failed/);
  const template = JSON.parse(await readFile(join(baseline.root, "human-review-template.json"), "utf8"));
  assert.throws(() => humanReview(baseline.report, template));
  template.reviewer = "Synthetic test reviewer";
  template.reviews[0].factualSupport = true;
  const reviewed = humanReview(baseline.report, template);
  assert.equal(reviewed.metrics.factualSupport.denominator, 1);
  assert.equal(reviewed.metrics.citationSupport.value, null);
  assert.throws(() => humanReview({ ...baseline.report, fingerprint: hash("other") }, template), /different report/);
});
