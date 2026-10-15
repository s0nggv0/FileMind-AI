import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { normalizeAIError, AIError } from "../../src/lib/ai/errors";
import { readModelConfig } from "../../src/lib/ai/models";
import { DocumentAnalysisSchema } from "../../src/lib/ai/schemas";
import { ToolRegistry } from "../../src/lib/ai/tool-registry";
import { aiLimits } from "../../src/lib/ai/config";

const fixture = "Transformer uses self-attention to process relationships between tokens.";
const documentId = "00000000-0000-4000-8000-000000000005";
type Transport = NonNullable<Parameters<typeof createKimiProvider>[0]["fetch"]>;
export interface GateStep {
  step: "A: text" | "B: structured analysis" | "C: tool registry";
  passed: boolean;
  httpStatus: number | null;
  code: string | null;
  latencyMs: number;
  totalTokens: number | null;
}
export interface GateReport {
  REAL_KIMI_VERIFIED: boolean;
  model: string;
  checkedAt: string;
  timeoutMs: number;
  steps: GateStep[];
}

// Only safe, explicitly selected fields leave this harness. Never serialize SDK errors,
// request headers/bodies, configuration, response payloads or model output.
export async function verifyKimiLive(env: Record<string, string | undefined>, transport: Transport = fetch): Promise<GateReport> {
  const models = readModelConfig(env);
  const report: GateReport = { REAL_KIMI_VERIFIED: false, model: models.main, checkedAt: new Date().toISOString(), timeoutMs: aiLimits.providerTimeoutMs, steps: [] };
  let httpStatus: number | null = null;
  let instantMode = false;
  const observedFetch: Transport = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as { thinking?: { type?: string }; model?: string };
    instantMode = body.thinking?.type === "disabled" && body.model === models.main;
    const response = await transport(url, init);
    httpStatus = response.status;
    return response;
  };
  let provider: ReturnType<typeof createKimiProvider>;
  try {
    if (models.provider !== "kimi") throw new AIError("CONFIGURATION", "Kimi must be selected for the live gate.", false, "kimi");
    provider = createKimiProvider({ apiKey: env.KIMI_API_KEY, baseURL: env.KIMI_BASE_URL, models, fetch: observedFetch });
  } catch (error) {
    report.steps.push({ step: "A: text", passed: false, httpStatus: null, code: normalizeAIError(error, "kimi").code, latencyMs: 0, totalTokens: null });
    return report;
  }
  const inputSchema = z.object({ documentId: z.literal(documentId) });
  const registry = new ToolRegistry([
    { name: "read_document", description: "Read the single synthetic test document.", inputSchema, execute: async () => ({ documentId, content: fixture }) },
    { name: "analyze_document", description: "Retrieve the analysis of the single synthetic test document.", inputSchema, execute: async () => ({ documentId, summary: "Transformer self-attention relates tokens." }) },
  ]);
  const signal = () => AbortSignal.timeout(aiLimits.providerTimeoutMs);
  const probes: { step: GateStep["step"]; run: () => Promise<number> }[] = [
    { step: "A: text", run: async () => {
      const result = await provider.generateText({ system: "Reply briefly.", prompt: "Reply with OK.", signal: signal() });
      if (!result.text.trim()) throw new AIError("STRUCTURED_OUTPUT", "Empty reply.", false, "kimi");
      return result.usage.totalTokens;
    } },
    { step: "B: structured analysis", run: async () => {
      const result = await provider.generateObject({ system: "Analyze only the given text. Return the required JSON schema. Keep summary and reasons to one short sentence, use 3 tags, category AI, keep the filename and set isNewCategory false.", prompt: fixture, schema: DocumentAnalysisSchema, signal: signal() });
      DocumentAnalysisSchema.parse(result.object);
      return result.usage.totalTokens;
    } },
    { step: "C: tool registry", run: async () => {
      const result = await provider.callTools({ system: "Choose read_document or analyze_document for the given document. Do not invent IDs.", messages: [{ role: "user", content: `Read document ${documentId}.` }], tools: registry.forModel(), signal: signal() });
      if (!result.calls.length) throw new AIError("STRUCTURED_OUTPUT", "No tool selected.", false, "kimi");
      for (const call of result.calls) {
        const output = await registry.execute(call.name, call.input);
        z.object({ documentId: z.literal(documentId) }).parse(output);
      }
      return result.usage.totalTokens;
    } },
  ];
  for (const probe of probes) {
    httpStatus = null; instantMode = false;
    const started = performance.now();
    try {
      const totalTokens = await probe.run();
      if (!instantMode || httpStatus !== 200 || !Number.isFinite(totalTokens) || totalTokens <= 0) throw new AIError("STRUCTURED_OUTPUT", "Live protocol checks failed.", false, "kimi");
      report.steps.push({ step: probe.step, passed: true, httpStatus, code: null, latencyMs: Math.round(performance.now() - started), totalTokens });
    } catch (error) {
      const normalized = normalizeAIError(error, "kimi");
      report.steps.push({ step: probe.step, passed: false, httpStatus: normalized.status ?? httpStatus, code: normalized.code, latencyMs: Math.round(performance.now() - started), totalTokens: null });
      return report; // Fail closed: do not spend tokens on the remaining probes.
    }
  }
  report.REAL_KIMI_VERIFIED = true;
  return report;
}

export function renderGateReport(report: GateReport) {
  return `# Kimi live verification — Phase 5 Gate 0\n\nREAL_KIMI_VERIFIED=${report.REAL_KIMI_VERIFIED}\n\n- Checked at: ${report.checkedAt}\n- Model: ${report.model}\n- Provider: Kimi (current project adapter, no mock fallback)\n- Request timeout: ${report.timeoutMs} ms\n- Inputs: synthetic, minimal; no personal documents\n\n| Step | Passed | HTTP status | Error code | Latency (ms) | Total tokens |\n| --- | --- | --- | --- | --- | --- |\n${report.steps.map(step => `| ${step.step} | ${step.passed} | ${step.httpStatus ?? "unavailable"} | ${step.code ?? "none"} | ${step.latencyMs} | ${step.totalTokens ?? "unavailable"} |`).join("\n")}\n\n${report.REAL_KIMI_VERIFIED ? "All three live probes passed: instant mode, positive usage, domain Zod validation, and execution through ToolRegistry." : "Gate failed. Subsequent probes were not run. Phase 5 AI integration must stop until a new live gate passes."}\n\nThe timeout is attached to every live request; cancellation behavior is also covered by offline transport tests. Successful requests alone do not prove that an actual 45-second timeout occurred.\n\nNo credentials, raw errors, provider response bodies, model output, or hidden reasoning are included.\n\nReproduce: ` + "`node --import tsx scripts/verification/verify-kimi-live.ts`" + ". This explicitly calls the paid API and overwrites this report.\n";
}

async function main() {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const report = await verifyKimiLive(process.env);
  const directory = resolve("docs/phase-checklists");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "kimi-live-verification.md"), renderGateReport(report));
  console.log(JSON.stringify(report, null, 2));
  if (!report.REAL_KIMI_VERIFIED) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/verification/verify-kimi-live.ts")) {
  void main().catch(() => { console.error("Live gate runner failed; no raw error was logged."); process.exitCode = 1; });
}
