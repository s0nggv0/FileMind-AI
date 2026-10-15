import { loadEnvConfig } from "@next/env";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DashScopeEmbeddingProvider } from "../../src/lib/retrieval/dashscope-provider";
import { cosineSimilarity } from "../../src/lib/retrieval/vector-store";
import { normalizeAIError } from "../../src/lib/ai/errors";
async function main() {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const report = { REAL_EMBEDDING_VERIFIED: false, checkedAt: new Date().toISOString(), provider: process.env.EMBEDDING_PROVIDER ?? "unconfigured", model: process.env.EMBEDDING_MODEL ?? "unconfigured", dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1024), httpStatus: null as number | null, errorCode: null as string | null, queryLatencyMs: 0, documentLatencyMs: 0, matchingDocumentFirst: false, responseShape: [] as { dataArray: boolean; count: number; indices: unknown[]; dimensions: number[] }[] };
  try {
    if (process.env.EMBEDDING_PROVIDER !== "dashscope") throw new Error("Configure DashScope");
    const provider = new DashScopeEmbeddingProvider({ apiKey: process.env.EMBEDDING_API_KEY || process.env.DASHSCOPE_API_KEY || "", baseURL: process.env.EMBEDDING_BASE_URL || "", model: report.model, dimensions: report.dimensions, fetch: async (url, init) => {
      const result = await fetch(url, init); report.httpStatus = result.status;
      if (result.ok) {
        const payload = await result.clone().json();
        report.responseShape.push({ dataArray: Array.isArray(payload.data), count: Array.isArray(payload.data) ? payload.data.length : 0, indices: Array.isArray(payload.data) ? payload.data.map((d: { index?: unknown }) => typeof d.index === "number" ? d.index : null) : [], dimensions: Array.isArray(payload.data) ? payload.data.map((d: { embedding?: unknown }) => Array.isArray(d.embedding) ? d.embedding.length : 0) : [] });
      }
      return result;
    } });
    let time = performance.now();
    const documents = await provider.embedDocuments(["Transformer self-attention uses query, key and value to relate tokens.", "Database B-tree indexes reduce row scanning for queries."]);
    report.documentLatencyMs = Math.round(performance.now() - time);
    time = performance.now();
    const query = await provider.embedQuery("How does attention relate tokens using QKV?");
    report.queryLatencyMs = Math.round(performance.now() - time);
    report.matchingDocumentFirst = cosineSimilarity(query.vector, documents[0].vector) > cosineSimilarity(query.vector, documents[1].vector);
    report.REAL_EMBEDDING_VERIFIED = report.httpStatus === 200 && documents.length === 2 && report.matchingDocumentFirst;
    if (!report.REAL_EMBEDDING_VERIFIED) report.errorCode = "RETRIEVAL_SMOKE_FAILED";
  } catch (error) { const safe = normalizeAIError(error, report.provider); report.httpStatus = safe.status ?? report.httpStatus; report.errorCode = safe.code; }
  await writeFile(resolve("docs/phase-checklists/embedding-live-verification.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.REAL_EMBEDDING_VERIFIED) process.exitCode = 1;
}
void main().catch(() => { console.error("Embedding verification runner failed; no raw error logged."); process.exitCode = 1; });
