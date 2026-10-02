import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentChunker, contentHash, estimateTokens } from "../src/lib/retrieval/chunker";
import { embeddingCacheKey, MockEmbeddingProvider } from "../src/lib/retrieval/embedding-provider";
import { lexicalTokens } from "../src/lib/retrieval/lexical-tokens";
import { retrievalConfig } from "../src/lib/retrieval/config";
import type { IndexDocument } from "../src/lib/retrieval/types";
const base = { id: crypto.randomUUID(), userId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), fileType: "txt", text: "" };
const chunker = new DocumentChunker();
test("Markdown preserves hierarchy and exact persisted offsets and line numbers", () => {
  const text = "# Transformer\nIntro.\n## Self Attention\nAttention.\n### Query Key Value\nQKV.\n";
  const chunks = chunker.chunk({ ...base, fileType: "md", text });
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[2].headingPath, ["Transformer", "Self Attention", "Query Key Value"]);
  assert.equal(chunks[2].lineStart, 5); assert.equal(chunks[2].lineEnd, 6);
  for (const chunk of chunks) assert.equal(chunk.content, text.slice(chunk.charStart, chunk.charEnd));
});
test("PDF chunks stay on their actual mapped page; legacy plain text never invents a page", () => {
  const doc: IndexDocument = { ...base, fileType: "pdf", text: "Page twelve\nPage thirteen", structure: { pages: [{ page: 12, charStart: 0, charEnd: 11 }, { page: 13, charStart: 12, charEnd: 25 }] } };
  const chunks = chunker.chunk(doc);
  assert.deepEqual(chunks.map(c => c.pageStart), [12, 13]);
  assert.ok(chunks.every(c => c.pageStart === c.pageEnd));
  assert.equal(chunker.chunk({ ...doc, structure: undefined })[0].pageStart, null);
});
test("DOCX paragraph ranges and heading metadata never pretend to be pages", () => {
  const text = "Methodology\n\nA study.\n\nAnother paragraph.";
  const chunks = chunker.chunk({ ...base, fileType: "docx", text, structure: { paragraphs: [{ index: 1, charStart: 0, charEnd: 11, heading: "Methodology", level: 1 }, { index: 2, charStart: 13, charEnd: 21 }, { index: 3, charStart: 23, charEnd: text.length }] } });
  assert.equal(chunks.length, 1); assert.deepEqual(chunks[0].headingPath, ["Methodology"]);
  assert.equal(chunks[0].paragraphStart, 1); assert.equal(chunks[0].paragraphEnd, 3); assert.equal(chunks[0].pageStart, null);
});
test("large multilingual TXT obeys bounds, overlaps and preserves full source coverage", () => {
  const text = ("数据库索引优化减少扫描开销。\nA covering index avoids reading table rows.\n\n").repeat(130);
  const chunks = chunker.chunk({ ...base, text });
  assert.ok(chunks.length > 1); assert.equal(chunks[0].charStart, 0); assert.equal(chunks.at(-1)?.charEnd, text.length);
  assert.ok(chunks.every(c => c.tokenEstimate <= retrievalConfig.chunkMaxTokens));
  for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i].charStart < chunks[i - 1].charEnd);
  assert.equal(estimateTokens("中英中文"), 4);
});
test("hashes and stable chunk identities invalidate content, provider, model and version changes", () => {
  const doc = { ...base, text: "Original." };
  assert.deepEqual(chunker.chunk(doc), chunker.chunk(doc));
  assert.notEqual(chunker.chunk(doc)[0].id, chunker.chunk({ ...doc, text: "Changed." })[0].id);
  assert.notEqual(chunker.chunk(doc)[0].id, chunker.chunk({ ...doc, userId: crypto.randomUUID() })[0].id);
  const hash = contentHash(doc.text); const key = embeddingCacheKey(hash, "p", "m", "v1");
  for (const args of [[hash, "p2", "m", "v1"], [hash, "p", "m2", "v1"], [hash, "p", "m", "v2"]]) assert.notEqual(key, embeddingCacheKey(...args as [string, string, string, string]));
});
test("Chinese bigrams and English normalization are explicit; mock vectors are marked mock", async () => {
  assert.deepEqual(lexicalTokens("数据库 INDEX index"), ["index", "数据", "据库"]);
  const result = await new MockEmbeddingProvider().embedQuery("Database index");
  assert.equal(result.mock, true); assert.equal(result.vector.length, result.dimensions);
});
