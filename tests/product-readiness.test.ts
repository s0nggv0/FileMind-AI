import { test } from "node:test";
import assert from "node:assert/strict";
import { documentReadiness, readiness, type ReadinessDocument } from "../src/lib/retrieval/readiness";
const d = (id: string, status: string, chunks: number, extra = {}): ReadinessDocument => ({ id, name: id, status, chunks, ...extra });
test("saved, lexical, semantic, processing and partial image states are independent", () => {
  assert.deepEqual(readiness([]), { total: 0, searchable: 0, semantic: 0, processing: 0, partial: 0, retryable: 0, replacementFailed: 0, partialCapabilities: 0 });
  assert.deepEqual(readiness([
    d("saved", "not_indexed", 0), d("empty", "failed", 0), d("ocr", "failed", 2, { fileType: "image", ocrStatus: "ready", visionStatus: "failed" }),
    d("ready", "ready", 3, { buildStatus: "embedding" }), d("stale", "stale", 2),
  ]), { total: 5, searchable: 2, semantic: 1, processing: 1, partial: 2, retryable: 4, replacementFailed: 0, partialCapabilities: 1 });
});
test("ready replacements, empty indices and partial image capabilities share one retry predicate", () => {
  for (const buildStatus of ["failed", "interrupted"]) {
    const state = documentReadiness(d("old", "ready", 2, { buildStatus }));
    assert.equal(state.searchable, true); assert.equal(state.semantic, true); assert.equal(state.retryable, true); assert.equal(state.replacementFailed, true);
  }
  for (const doc of [d("empty", "ready", 0), d("stale", "stale", 2)]) {
    assert.equal(documentReadiness(doc).searchable, false); assert.equal(documentReadiness(doc).retryable, true);
  }
  for (const buildStatus of ["chunking", "embedding"]) assert.equal(documentReadiness(d("building", "ready", 2, { buildStatus })).retryable, false);
  assert.equal(documentReadiness(d("image", "ready", 2, { fileType: "image", ocrStatus: "ready", visionStatus: "failed" })).retryable, true);
  assert.equal(documentReadiness(d("done", "ready", 2)).retryable, false);
});
