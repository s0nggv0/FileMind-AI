import { test } from "node:test";
import assert from "node:assert/strict";
import { retrievalMetrics,answerOutcome,percentiles } from "../scripts/blind-protocol";
test("blind protocol deduplicates document ranks, scores all relevant documents, and keeps outages distinct from refusal",()=>{
  const metrics=retrievalMetrics(["irrelevant","a","a","b"].map(documentName=>({documentName})),["a","b"]);
  assert.equal(metrics?.mrr,.5);assert.equal(metrics?.recallAt10,1);assert.ok(metrics!.ndcgAt10<1);assert.equal(retrievalMetrics([],[]),null);
  const input={expected:"no-answer" as const,unavailable:true,refused:null,goldCorrect:null,conflictDetected:false,clarification:false};
  assert.equal(answerOutcome(input),"Unavailable");assert.equal(answerOutcome({...input,unavailable:false,refused:true}),"Correct Refusal");
  assert.equal(answerOutcome({...input,unavailable:false,refused:true,expected:"answerable"}),"False Refusal");
  assert.deepEqual(percentiles(Array.from({length:20},(_,i)=>i+1)),{samples:20,p50:10,p95:19});
});
