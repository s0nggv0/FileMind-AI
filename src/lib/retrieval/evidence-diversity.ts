import type { Evidence } from "./types";
// A shared paragraph does not prove two documents are copies. Collapse only
// matching passages at the same position in a verified whole-file copy. Without
// a file hash, keep each document's identity; never use the chunk hash instead.
export function uniquePassages(evidence: Evidence[]) {
  const seen = new Set<string>();
  return evidence.filter(e => {
    const key = passageIdentity(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function passageIdentity(e: Evidence) {
  const document = e.documentHash && /^[a-f0-9]{64}$/i.test(e.documentHash) ? ["file", e.documentHash] : ["document", e.documentId];
  return JSON.stringify([e.userId, document, e.fileType, e.chunkVersion, e.chunkSource ?? "text", e.chunkIndex, e.headingPath, e.content]);
}
// Used while recalling, before a global top-K can discard a whole document.
// The same fixed budget is shared in rounds, ordered by relevance within each round.
export function coverageCandidates(evidence: Evidence[], limit: number) {
  const counts = new Map<string, number>();
  return [...evidence].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map(e => { const round = counts.get(e.documentId) ?? 0; counts.set(e.documentId, round + 1); return { e, round }; })
    .sort((a, b) => a.round - b.round || b.e.score - a.e.score || a.e.id.localeCompare(b.e.id))
    .slice(0, limit).map(item => item.e);
}
export function diversePassages(evidence: Evidence[], limit: number) {
  const unique = uniquePassages(evidence), documents = new Set<string>();
  const first = unique.filter(e => { if (documents.has(e.documentId)) return false; documents.add(e.documentId); return true; });
  const ids = new Set(first.map(e => e.id));
  return [...first, ...unique.filter(e => !ids.has(e.id))].slice(0, limit);
}
