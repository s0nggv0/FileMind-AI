import type { ImageAnalysis, OCRResult } from "./schemas";
export interface ImageInput { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; filename: string }
export interface VisionResult { analysis: ImageAnalysis; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }
export interface VisionProvider {
  analyzeImage(image: ImageInput, signal: AbortSignal): Promise<VisionResult>;
  extractSemanticContent(image: ImageInput, signal: AbortSignal): Promise<VisionResult>;
  getModelInfo(): { provider: string; model: string; promptVersion: string };
}
export interface OCRProvider {
  extractText(image: ImageInput, signal: AbortSignal): Promise<OCRResult>;
  getEngineInfo(): { engine: string; version: string };
}
