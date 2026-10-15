import { loadEnvConfig } from "@next/env";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../../src/lib/ai/models";
import { generateGroundedAnswer } from "../../src/lib/retrieval/rag";
import type { Evidence } from "../../src/lib/retrieval/types";

async function main() {
  if (!process.argv.includes("--live")) throw new Error("Explicit --live is required.");
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  await mkdir("artifacts", { recursive: true });
  const budgetPath = "artifacts/release-provider-budget.json", limit = 24;
  const recorded = await readFile("docs/evaluation/release-provider.json", "utf8").then(text => JSON.parse(text).callsUsed as number, () => 0);
  const previous = Math.max(recorded, await readFile(budgetPath, "utf8").then(text => JSON.parse(text).used as number, () => 0));
  if (!Number.isInteger(previous) || previous < 0 || previous >= limit) throw new Error("Release provider budget exhausted.");
  let used = previous;
  const retained = process.argv.includes("--conflict-only") ? JSON.parse(await readFile("docs/evaluation/release-provider.json", "utf8")) : null;
  const calls: { number: number; status: number; durationMs: number; flatContextSchema: boolean; usage?: unknown }[] = retained?.calls ?? [];
  const provider = createKimiProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL, models: readModelConfig(process.env), fetch: async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!["api.moonshot.cn", "api.moonshot.ai"].includes(url.hostname) || used >= limit) throw new Error("Release provider endpoint or budget rejected.");
    const request = JSON.parse(String(init?.body ?? "{}"));
    const properties = request.response_format?.json_schema?.schema?.properties;
    const flatContextSchema = !!properties?.needsClarification && !!properties?.question && !!properties?.options && !!properties?.conflicts && !properties?.clarification;
    used++;
    await writeFile(budgetPath, JSON.stringify({ limit, used, updatedAt: new Date().toISOString(), historicalPhase9BudgetUnchanged: true }) + "\n");
    const start = performance.now();
    try {
      const response = await fetch(input, init);
      const body = await response.clone().json().catch(() => null);
      calls.push({ number: used, status: response.status, durationMs: performance.now() - start, flatContextSchema, usage: body?.usage });
      return response;
    } catch {
      calls.push({ number: used, status: 0, durationMs: performance.now() - start, flatContextSchema });
      throw new Error("Synthetic release provider request unavailable.");
    }
  } });
  const scope = { userId: randomUUID(), workspaceId: randomUUID() };
  function source(content: string, documentName: string): Evidence {
    return { ...scope, id: randomUUID(), documentId: randomUUID(), documentName, content, contentHash: createHash("sha256").update(content).digest("hex"), chunkIndex: 0, chunkVersion: "chunk-v1", tokenEstimate: 30, pageStart: null, pageEnd: null, lineStart: 1, lineEnd: 1, paragraphStart: null, paragraphEnd: null, headingPath: [], charStart: 0, charEnd: content.length, fileType: "txt", summary: "", tags: [], score: 0.9, semanticScore: 0.9 };
  }
  const rows: { name: string; passed: boolean; result: unknown }[] = retained?.rows.filter((row: { name: string }) => row.name !== "conflict") ?? [];
  async function run(name: string, query: string, evidence: Evidence[], accepts: (result: Awaited<ReturnType<typeof generateGroundedAnswer>>) => boolean) {
    const result = await generateGroundedAnswer(query, evidence, scope, provider, async (_, id) => evidence.find(s => s.id === id) ?? null, AbortSignal.timeout(240000));
    const passed = !result.unavailable && accepts(result);
    rows.push({ name, passed, result });
    console.log(JSON.stringify({ name, passed, state: result.answer?.answerState, errorCode: result.errorCode, callsUsed: used }));
  }
  if (!retained) await run("ambiguity", "那个项目什么时候截止？", [source("AI Competition project deadline is June 10.", "ai-project.txt"), source("Database Course Project deadline is June 15.", "course-project.txt"), source("Research Proposal project deadline is June 20.", "research-project.txt")], r => r.answer?.answerState === "needs_clarification" && r.answer.clarification?.options?.length === 3 && new Set(r.answer.clarification.options.flatMap(o => o.documentIds)).size === 3);
  await run("conflict", "Compare the two Orion policy retention periods, cite both versions and explain their update relationship.", [source("Orion policy edition 2028-01 specifies that temporary records last 3 hours.", "orion-policy-old.txt"), source("Orion policy edition 2028-03 explicitly replaces the prior temporary-record retention clause. Temporary records now last 8 hours.", "orion-policy-update.txt")], r => r.answer?.answerState === "conflicting" && r.answer.conflict?.detected === true && r.answer.citations.length === 2 && r.verification?.accepted === true && r.verification.conflicts.some(c => c.versionRelationship === "explicit_superseded" && c.disclosed));
  const flatWireLiveVerified = calls.filter(c => c.flatContextSchema && c.status === 200).length >= 2 && rows.every(r => r.passed);
  const sourceHashes = Object.fromEntries(await Promise.all(["src/lib/retrieval/rag.ts", "src/lib/retrieval/answer-context.ts", "src/lib/retrieval/answer-verifier.ts"].map(async path => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
  const report = { version: "release-provider-v1", checkedAt: new Date().toISOString(), live: true, syntheticSources: true, retrievalTested: false, pipeline: "Actual grounded answer, clarification ownership checks, conflict draft, citation freshness, atomic claims and semantic release verification", sourceHashes, model: provider.models.main, callLimit: limit, callsUsed: used, calls, flatWireLiveVerified, rows, passed: rows.every(r => r.passed) && flatWireLiveVerified };
  await writeFile("docs/evaluation/release-provider.json", JSON.stringify(report, null, 2) + "\n");
  if (!report.passed) process.exitCode = 1;
}
void main().catch(() => { console.error("Release provider acceptance failed; credentials and raw errors suppressed."); process.exitCode = 1; });
