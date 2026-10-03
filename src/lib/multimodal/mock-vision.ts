import { ImageAnalysisSchema, type ImageAnalysis } from "./schemas";
import type { ImageInput, VisionProvider } from "./provider";
// Explicit, injected fixtures only. Never infer knowledge from filenames or
// silently substitute this provider when the real Vision Gate is unavailable.
export class MockVisionProvider implements VisionProvider {
  constructor(private fixture: ImageAnalysis) { ImageAnalysisSchema.parse(fixture); }
  getModelInfo() { return { provider: "mock", model: "fixture-vision", promptVersion: "mock-v1" }; }
  async analyzeImage(_image: ImageInput, signal: AbortSignal) { signal.throwIfAborted(); return { analysis: ImageAnalysisSchema.parse(this.fixture) }; }
  async extractSemanticContent(image: ImageInput, signal: AbortSignal) { return this.analyzeImage(image, signal); }
}
