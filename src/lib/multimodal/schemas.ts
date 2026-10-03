import { z } from "zod";

export const ImageAnalysisSchema = z.object({
  imageType: z.enum(["screenshot", "whiteboard", "slide", "diagram", "document", "photo", "other"]),
  summary: z.string().trim().min(1).max(1200),
  topics: z.array(z.string().trim().min(1).max(80)).max(8),
  visibleConcepts: z.array(z.string().trim().min(1).max(120)).max(12),
  tags: z.array(z.string().trim().min(1).max(40)).max(8),
  suggestedCategory: z.string().trim().min(1).max(80).nullable().optional(),
  suggestedFilename: z.string().max(255).nullable().optional(),
  confidence: z.number().min(0).max(1),
}).strict();
export const OCRResultSchema = z.object({
  text: z.string().max(180000), confidence: z.number().min(0).max(1),
  blocks: z.array(z.object({ text: z.string(), confidence: z.number().min(0).max(1),
    box: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().nonnegative(), height: z.number().nonnegative() }).optional(),
  })).max(10000),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;
export type OCRResult = z.infer<typeof OCRResultSchema>;
export type AnalysisStatus = "pending" | "ready" | "failed" | "disabled" | "stale";
export interface MultimodalAnalysis {
  documentId: string; imageType: ImageAnalysis["imageType"] | null;
  vision: ImageAnalysis | null; ocr: OCRResult | null;
  visionStatus: AnalysisStatus; ocrStatus: AnalysisStatus;
  provider: string; model: string; ocrEngine: string; analysisVersion: string;
  visionCacheKey: string; ocrCacheKey: string; createdAt: string;
  usage: { requests: number; latencyMs: number; inputTokens?: number; outputTokens?: number; totalTokens?: number };
}
