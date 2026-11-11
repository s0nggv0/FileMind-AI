// A saved file, a readable passage, and semantic search are separate capabilities.
export interface ReadinessDocument { id: string; workspaceId?: string; name: string; status: string; chunks: number; buildStatus?: string; storageStatus?: string; ocrStatus?: string; visionStatus?: string; fileType?: string }
export function documentReadiness(document: ReadinessDocument) {
  const searchable = document.chunks > 0 && ["ready", "failed"].includes(document.status);
  const semantic = searchable && document.status === "ready";
  const processing = ["chunking", "embedding"].includes(document.buildStatus ?? "") || ["chunking", "embedding"].includes(document.status) ||
    [document.ocrStatus, document.visionStatus].some(status => status === "running" || status === "processing");
  const replacementFailed = ["failed", "interrupted"].includes(document.buildStatus ?? "");
  const partialCapabilities = document.fileType === "image" && (document.ocrStatus !== "ready" || document.visionStatus !== "ready");
  return { searchable, semantic, processing, replacementFailed, partialCapabilities,
    retryable: !processing && (!semantic || replacementFailed || partialCapabilities),
    partial: document.status === "failed" || replacementFailed || partialCapabilities };
}
export function readiness(documents: ReadinessDocument[]) {
  const states = documents.map(documentReadiness);
  const count = (key: keyof ReturnType<typeof documentReadiness>) => states.filter(state => state[key]).length;
  return { total: documents.length, searchable: count("searchable"), semantic: count("semantic"), processing: count("processing"), partial: count("partial"), retryable: count("retryable"), replacementFailed: count("replacementFailed"), partialCapabilities: count("partialCapabilities") };
}
