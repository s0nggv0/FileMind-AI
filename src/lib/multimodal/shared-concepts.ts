import type { ImageAnalysis } from "./schemas";
export function normalizeConcept(value: string) { return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " "); }
export function imageConcepts(vision: ImageAnalysis | null) {
  if (!vision) return [];
  return [...new Set([...vision.topics, ...vision.tags].map(normalizeConcept))].filter(c => c.length >= 3 && !["image", "document", "screenshot", "slide", "photo", "education", "synthetic", "synthetic image"].includes(c)).slice(0, 16);
}
