// A saved file, a readable passage, and semantic search are separate capabilities.
export interface ReadinessDocument { id: string; workspaceId?: string; name: string; status: string; chunks: number; buildStatus?: string; storageStatus?: string; ocrStatus?: string; visionStatus?: string; fileType?: string }
export function readiness(documents: ReadinessDocument[]) {
  const searchable = documents.filter(d => d.chunks > 0 && ["ready", "failed"].includes(d.status)).length;
  const semantic = documents.filter(d => d.status === "ready" && d.chunks > 0).length;
  const processing = documents.filter(d => ["chunking", "embedding"].includes(d.buildStatus ?? "")).length;
  const partial = documents.filter(d => d.status === "failed" || ["failed", "interrupted"].includes(d.buildStatus ?? "") || (d.fileType === "image" && (d.ocrStatus !== "ready" || d.visionStatus !== "ready"))).length;
  return { total: documents.length, searchable, semantic, processing, partial };
}
