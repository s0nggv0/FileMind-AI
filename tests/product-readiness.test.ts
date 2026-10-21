import { test } from "node:test";
import assert from "node:assert/strict";
import { readiness, type ReadinessDocument } from "../src/lib/retrieval/readiness";
test("saved, lexical, semantic, processing and partial image states are independent", () => {
  const d = (id: string, status: string, chunks: number, extra = {}): ReadinessDocument => ({ id, name: id, status, chunks, ...extra });
  assert.deepEqual(readiness([]), { total: 0, searchable: 0, semantic: 0, processing: 0, partial: 0 });
  assert.deepEqual(readiness([
    d("saved", "not_indexed", 0), d("empty", "failed", 0), d("ocr", "failed", 2, { fileType: "image", ocrStatus: "ready", visionStatus: "failed" }),
    d("ready", "ready", 3, { buildStatus: "embedding" }), d("stale", "stale", 2),
  ]), { total: 5, searchable: 2, semantic: 1, processing: 1, partial: 2 });
});
