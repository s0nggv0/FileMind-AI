import { loadEnvConfig } from "@next/env";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { KimiVisionProvider } from "../../src/lib/multimodal/kimi-vision";
import { ImageAnalysisSchema } from "../../src/lib/multimodal/schemas";
import { normalizeAIError } from "../../src/lib/ai/errors";
async function main() {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const report: Record<string, unknown> = { VISION_VERIFIED: false, provider: "kimi", model: "kimi-k2.6", checkedAt: new Date().toISOString(), syntheticInput: "transformer-slide.png" };
  try {
    const provider = new KimiVisionProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL, fetch: async (url, init) => { const response = await fetch(url, init); report.httpStatus = response.status; return response; } });
    const started = performance.now();
    const result = await provider.analyzeImage({ bytes: await readFile("tests/fixtures/rag-hard/images/transformer-slide.png"), mimeType: "image/png", filename: "transformer-slide.png" }, AbortSignal.timeout(60000));
    const analysis = ImageAnalysisSchema.parse(result.analysis);
    report.latencyMs = Math.round(performance.now() - started); report.usage = result.usage; report.analysis = analysis;
    report.VISION_VERIFIED = report.httpStatus === 200 && /attention|transformer/i.test(JSON.stringify(analysis));
  } catch (e) { const error = normalizeAIError(e, "kimi"); report.errorCode = error.code; report.httpStatus ??= error.status ?? null; }
  await mkdir("docs/phase-checklists", { recursive: true });
  await mkdir(".filemind", { recursive: true });
  await writeFile(".filemind/vision-verification.json", JSON.stringify({ verified: report.VISION_VERIFIED, provider: "kimi", model: "kimi-k2.6", baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1", checkedAt: report.checkedAt }));
  await writeFile("docs/phase-checklists/vision-live-verification.md", `# Phase 6 Vision Gate 0\n\nVISION_VERIFIED=${report.VISION_VERIFIED}\n\nSelf-created learning slide; no user image. Current OpenAI-compatible adapter, instant mode, image bytes, Zod-validated output. No tools are supplied.\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n\nNo keys, raw errors or request headers are recorded. Reproduce: \`node --import tsx scripts/verification/verify-vision-live.ts\`. This makes a paid API call.\n`);
  console.log(JSON.stringify(report, null, 2)); if (!report.VISION_VERIFIED) process.exitCode = 1;
}
void main().catch(() => { console.error("Vision gate failed; raw errors suppressed."); process.exitCode = 1; });
