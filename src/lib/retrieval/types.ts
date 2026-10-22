export interface ChunkLocation {
  pageStart: number | null; pageEnd: number | null;
  lineStart: number | null; lineEnd: number | null;
  paragraphStart: number | null; paragraphEnd: number | null;
  headingPath: string[]; charStart: number; charEnd: number;
}
export interface DocumentChunk extends ChunkLocation {
  chunkSource?: "text" | "ocr" | "vision_summary" | "concepts" | "mixed";
  id: string; userId: string; workspaceId: string; documentId: string;
  chunkIndex: number; content: string; contentHash: string; tokenEstimate: number; chunkVersion: string;
}
export interface Evidence extends DocumentChunk {
  documentHash?: string | null;
  storageStatus?: "available" | "missing" | "not_stored";
  documentUpdatedAt?: string;
  documentName: string; fileType: string; summary: string; tags: string[];
  score: number; lexicalCoverage?: number; semanticScore?: number;
  retrievalSource?: "semantic" | "lexical" | "both"; fusedRank?: number;
}
export interface RetrievalScope { userId: string; workspaceId?: string; documentIds?: string[] }
export interface ParsedStructure {
  knowledgeSections?: { charStart: number; charEnd: number; source: "ocr" | "vision_summary" | "concepts" | "mixed" }[];
  pages?: { page: number; charStart: number; charEnd: number }[];
  paragraphs?: { index: number; charStart: number; charEnd: number; heading?: string; level?: number }[];
}
export interface IndexDocument extends RetrievalScope {
  workspaceId: string; id: string; text: string; fileType: string; structure?: ParsedStructure;
}
export function locationLabel(chunk: ChunkLocation & { fileType?: string; chunkSource?: string }) {
  if (chunk.fileType === "image" || (chunk.chunkSource && chunk.chunkSource !== "text")) return chunk.chunkSource === "ocr" ? "Image · OCR text" : "Image";
  if (chunk.pageStart !== null) return chunk.pageStart === chunk.pageEnd ? `P${chunk.pageStart}` : `P${chunk.pageStart}–P${chunk.pageEnd}`;
  const heading = chunk.headingPath.join(" / ");
  if (chunk.paragraphStart !== null) return `${heading ? heading + " · " : ""}Paragraph ${chunk.paragraphStart}–${chunk.paragraphEnd}`;
  if (chunk.lineStart !== null) return `${heading ? heading + " · " : ""}L${chunk.lineStart}–L${chunk.lineEnd}`;
  return `Characters ${chunk.charStart + 1}–${chunk.charEnd}`;
}
