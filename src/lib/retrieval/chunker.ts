import { createHash } from "node:crypto";
import { CHUNK_VERSION, retrievalConfig } from "./config";
import type { ChunkLocation, DocumentChunk, IndexDocument } from "./types";

export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");
export function estimateTokens(text: string) {
  const han = [...text.matchAll(/\p{Script=Han}/gu)].length;
  return Math.ceil(han + (text.length - han) / 4);
}
interface Unit { start: number; end: number; headingPath: string[]; page: number | null; paragraph: number | null }
function units(document: IndexDocument): Unit[] {
  const { text, structure, fileType } = document;
  if (fileType === "pdf" && structure?.pages?.length) return structure.pages.map(p => ({ start: p.charStart, end: p.charEnd, page: p.page, headingPath: [], paragraph: null }));
  if (fileType === "docx" && structure?.paragraphs?.length) {
    const headings: string[] = [];
    return structure.paragraphs.map(p => {
      if (p.heading && p.level) { headings.length = p.level - 1; headings[p.level - 1] = p.heading; }
      return { start: p.charStart, end: p.charEnd, headingPath: headings.filter(Boolean), page: null, paragraph: p.index };
    });
  }
  const result: Unit[] = []; const headings: string[] = [];
  let start = 0; let position = 0; let currentHeading: string[] = [];
  let fenced = false;
  for (const line of text.split(/(?<=\n)/)) {
    const heading = fileType === "md" && !fenced ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trimEnd()) : null;
    if (heading) {
      if (position > start) result.push({ start, end: position, headingPath: currentHeading, page: null, paragraph: null });
      headings.length = heading[1].length - 1; headings[heading[1].length - 1] = heading[2];
      currentHeading = headings.filter(Boolean); start = position;
    }
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    position += line.length;
  }
  if (position > start) result.push({ start, end: position, headingPath: currentHeading, page: null, paragraph: null });
  return result;
}
function splitUnit(text: string, unit: Unit): Unit[] {
  const pieces: Unit[] = []; let start = unit.start;
  while (start < unit.end) {
    let end = start;
    while (end < unit.end && estimateTokens(text.slice(start, end + 100)) < retrievalConfig.chunkTargetTokens) end = Math.min(end + 100, unit.end);
    end = Math.min(Math.max(start + 1, end), unit.end);
    if (end < unit.end) {
      const candidate = text.slice(start, end);
      const boundaries = [...candidate.matchAll(/\n\s*\n|[。！？.!?](?:\s|$)/g)];
      const boundary = boundaries.at(-1);
      if (boundary && boundary.index > candidate.length / 2) end = start + boundary.index + boundary[0].length;
    }
    // A CJK-heavy slice may exceed the target. Bound even without sentence breaks.
    while (estimateTokens(text.slice(start, end)) > retrievalConfig.chunkMaxTokens && end > start + 1) end--;
    pieces.push({ ...unit, start, end });
    if (end === unit.end) break;
    let next = end;
    while (next > start && estimateTokens(text.slice(next - 1, end)) <= retrievalConfig.overlapTokens) next--;
    start = Math.max(start + 1, next);
  }
  return pieces;
}
export class DocumentChunker {
  chunk(document: IndexDocument): DocumentChunk[] {
    if (document.fileType === "image" || !document.text.trim()) return [];
    const lines = (offset: number) => document.text.slice(0, offset).split("\n").length;
    let spans = units(document).flatMap(unit => splitUnit(document.text, unit));
    // DOCX paragraphs merge within a section; PDF pages and Markdown sections
    // stay separate. Offsets always point into the persisted extracted text.
    if (document.fileType === "docx") {
      const merged: Unit[] = [];
      for (const span of spans) {
        const previous = merged.at(-1);
        if (previous && JSON.stringify(previous.headingPath) === JSON.stringify(span.headingPath) && estimateTokens(document.text.slice(previous.start, span.end)) <= retrievalConfig.chunkTargetTokens) previous.end = span.end;
        else merged.push({ ...span });
      }
      spans = merged;
    }
    return spans.filter(s => document.text.slice(s.start, s.end).trim()).map((span, chunkIndex) => {
      const content = document.text.slice(span.start, span.end); const hash = contentHash(content);
      const paragraphs = document.structure?.paragraphs?.filter(p => p.charStart < span.end && p.charEnd > span.start);
      const location: ChunkLocation = {
        pageStart: span.page, pageEnd: span.page,
        lineStart: ["md", "txt"].includes(document.fileType) ? lines(span.start) : null,
        lineEnd: ["md", "txt"].includes(document.fileType) ? lines(Math.max(span.start, span.end - 1)) : null,
        paragraphStart: paragraphs?.[0]?.index ?? null, paragraphEnd: paragraphs?.at(-1)?.index ?? null,
        headingPath: span.headingPath, charStart: span.start, charEnd: span.end,
      };
      // Deterministic per owner/document/version/position. Does not alias identical
      // text in two different locations or two tenants.
      const hex = contentHash(`${document.userId}:${document.id}:${CHUNK_VERSION}:${chunkIndex}:${hash}`).slice(0, 32).split("");
      hex[12] = "4"; hex[16] = "8";
      const id = `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
      return { ...location, id, userId: document.userId, workspaceId: document.workspaceId, documentId: document.id, chunkIndex, content, contentHash: hash, tokenEstimate: estimateTokens(content), chunkVersion: CHUNK_VERSION };
    });
  }
}
