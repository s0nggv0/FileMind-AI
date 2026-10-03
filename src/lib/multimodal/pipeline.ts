import { createHash } from "node:crypto";
import { ImageAnalysisSchema, OCRResultSchema, type MultimodalAnalysis } from "./schemas";
import { MULTIMODAL_INDEX_VERSION, multimodalConfig } from "./config";
import type { ImageInput, OCRProvider, VisionProvider } from "./provider";
import type { ParsedStructure } from "../retrieval/types";

export function imageCacheKey(hash: string, provider: string, model: string, version: string) {
  return createHash("sha256").update(JSON.stringify([hash, provider, model, version])).digest("hex");
}
export function mergeKnowledge(analysis: Pick<MultimodalAnalysis, "ocr" | "vision">) {
  let text = ""; const sections: NonNullable<ParsedStructure["knowledgeSections"]> = [];
  const add = (label: string, value: string, source: "ocr" | "vision_summary" | "concepts") => {
    if (!value.trim()) return; if (text) text += "\n\n";
    const charStart = text.length; text += `<${label}>\n${value}`; sections.push({ charStart, charEnd: text.length, source });
  };
  add("Image OCR · extracted text", analysis.ocr?.text ?? "", "ocr");
  add("Image Semantic Summary · AI interpretation", analysis.vision?.summary ?? "", "vision_summary");
  if (analysis.vision) add("Detected Concepts · AI interpretation", [...analysis.vision.topics, ...analysis.vision.visibleConcepts, ...analysis.vision.tags].join("\n"), "concepts");
  return { text, structure: { knowledgeSections: sections } as ParsedStructure };
}
// One process-wide semaphore bounds all UI, agent and reindex callers.
let active = 0; const waiting: (() => void)[] = [];
async function limited<T>(limit: number, signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  while (active >= limit) await new Promise<void>(resolve => waiting.push(resolve));
  active++;
  try { signal.throwIfAborted(); return await action(); }
  finally { active--; waiting.shift()?.(); }
}
export class MultimodalPipeline {
  constructor(private vision: VisionProvider | null, private ocr: OCRProvider | null, private env: Record<string, string | undefined> = {}) {}
  async analyze(documentId: string, image: ImageInput, contentHash: string, signal: AbortSignal, cached?: MultimodalAnalysis | null, event: (message: string) => Promise<void> = async () => {}) {
    const info = this.vision?.getModelInfo() ?? { provider: "unavailable", model: "none", promptVersion: "none" };
    const engine = this.ocr?.getEngineInfo() ?? { engine: "disabled", version: "none" };
    const visionCacheKey = imageCacheKey(contentHash, info.provider, info.model, info.promptVersion);
    const ocrCacheKey = imageCacheKey(contentHash, engine.engine, engine.version, "ocr-v1");
    return limited(multimodalConfig(this.env).concurrency, signal, async () => {
      const start = performance.now(); let requests = 0; let usage = {};
      await event("Reading image metadata");
      const [visual, extracted] = await Promise.allSettled([
        (async () => {
          if (cached?.visionCacheKey === visionCacheKey && cached.vision) return ImageAnalysisSchema.parse(cached.vision);
          if (!this.vision) return null;
          await event("Understanding image"); requests++;
          const result = await this.vision.analyzeImage(image, signal); usage = result.usage ?? {};
          return ImageAnalysisSchema.parse(result.analysis);
        })(),
        (async () => {
          if (cached?.ocrCacheKey === ocrCacheKey && cached.ocr) return OCRResultSchema.parse(cached.ocr);
          if (!this.ocr) return null;
          await event("Extracting visible text");
          return OCRResultSchema.parse(await this.ocr.extractText(image, signal));
        })(),
      ]);
      signal.throwIfAborted();
      const vision = visual.status === "fulfilled" ? visual.value : null;
      const ocr = extracted.status === "fulfilled" ? extracted.value : null;
      await event(vision ? "Generating concepts" : ocr?.text.trim() ? "Visual understanding unavailable. Text extraction succeeded." : "Image saved. Not searchable by content.");
      const analysis: MultimodalAnalysis = { documentId, imageType: vision?.imageType ?? null, vision, ocr,
        visionStatus: vision ? "ready" : this.vision ? "failed" : "disabled", ocrStatus: ocr ? "ready" : this.ocr ? "failed" : "disabled",
        provider: info.provider, model: info.model, ocrEngine: engine.engine, analysisVersion: MULTIMODAL_INDEX_VERSION,
        visionCacheKey, ocrCacheKey, createdAt: new Date().toISOString(), usage: { requests, latencyMs: Math.round(performance.now() - start), ...usage },
      };
      return { analysis, ...mergeKnowledge(analysis) };
    });
  }
}
