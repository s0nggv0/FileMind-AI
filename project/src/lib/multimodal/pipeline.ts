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
    const preserveVision = !this.vision && cached?.imageHash === contentHash && cached.vision && cached.visionPromptVersion;
    const info = this.vision?.getModelInfo() ?? (preserveVision ? { provider: cached.provider, model: cached.model, promptVersion: cached.visionPromptVersion! } : { provider: "unavailable", model: "none", promptVersion: "none" });
    const preserveOCR = !this.ocr && cached?.imageHash === contentHash && cached.ocr;
    const engine = this.ocr?.getEngineInfo() ?? (preserveOCR ? { engine: cached.ocrEngine, version: cached.ocrVersion ?? "none" } : { engine: "disabled", version: "none" });
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
      const freshVision = visual.status === "fulfilled" ? visual.value : null;
      const freshOCR = extracted.status === "fulfilled" ? extracted.value : null;
      const sameOriginal = cached?.imageHash === contentHash;
      const oldVision = !freshVision && sameOriginal ? cached?.vision : null;
      const oldOCR = !freshOCR && sameOriginal ? cached?.ocr : null;
      const vision = freshVision ?? oldVision ?? null;
      const ocr = freshOCR ?? oldOCR ?? null;
      await event(vision ? "Generating concepts" : ocr?.text.trim() ? "Visual understanding unavailable. Text extraction succeeded." : "Image saved. Not searchable by content.");
      const analysis: MultimodalAnalysis = { documentId, imageType: vision?.imageType ?? null, vision, ocr,
        visionStatus: oldVision ? "stale" : vision ? "ready" : this.vision ? "failed" : "disabled", ocrStatus: oldOCR ? "stale" : ocr ? "ready" : this.ocr ? "failed" : "disabled",
        provider: oldVision ? cached!.provider : info.provider, model: oldVision ? cached!.model : info.model, ocrEngine: oldOCR ? cached!.ocrEngine : engine.engine, analysisVersion: MULTIMODAL_INDEX_VERSION,
        visionCacheKey: oldVision ? cached!.visionCacheKey : visionCacheKey, ocrCacheKey: oldOCR ? cached!.ocrCacheKey : ocrCacheKey, createdAt: new Date().toISOString(), usage: { requests, latencyMs: Math.round(performance.now() - start), ...usage },
        imageHash: contentHash, visionPromptVersion: oldVision ? cached!.visionPromptVersion : info.promptVersion, ocrVersion: oldOCR ? cached!.ocrVersion : engine.version,
      };
      return { analysis, ...mergeKnowledge(analysis) };
    });
  }
}
