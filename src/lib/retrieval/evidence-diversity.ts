import type { Evidence } from "./types";
// Identical text is one passage of evidence, even when stored in several files.
// Do not merge near matches or different source types (e.g. OCR vs AI reading).
export function uniquePassages(evidence: Evidence[]) {
  const seen = new Set<string>();
  return evidence.filter(e => { const key = JSON.stringify([e.chunkSource ?? "text", e.content]); if (seen.has(key)) return false; seen.add(key); return true; });
}
export function diversePassages(evidence: Evidence[], limit: number) {
  const unique = uniquePassages(evidence), documents = new Set<string>();
  const first = unique.filter(e => { if (documents.has(e.documentId)) return false; documents.add(e.documentId); return true; });
  const ids = new Set(first.map(e => e.id));
  return [...first, ...unique.filter(e => !ids.has(e.id))].slice(0, limit);
}
