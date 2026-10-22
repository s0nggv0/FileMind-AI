import type { Evidence } from "./types";
// A shared paragraph does not prove two documents are copies. Collapse only
// matching passages at the same position in a verified whole-file copy. Without
// a file hash, keep each document's identity; never use the chunk hash instead.
export function uniquePassages(evidence: Evidence[]) {
  const seen = new Set<string>();
  return evidence.filter(e => {
    const document = e.documentHash ? ["file", e.documentHash] : ["document", e.documentId];
    const key = JSON.stringify([e.userId, document, e.fileType, e.chunkVersion, e.chunkSource ?? "text", e.chunkIndex, e.headingPath, e.content]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function diversePassages(evidence: Evidence[], limit: number) {
  const unique = uniquePassages(evidence), documents = new Set<string>();
  const first = unique.filter(e => { if (documents.has(e.documentId)) return false; documents.add(e.documentId); return true; });
  const ids = new Set(first.map(e => e.id));
  return [...first, ...unique.filter(e => !ids.has(e.id))].slice(0, limit);
}
