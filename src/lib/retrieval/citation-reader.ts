import type { TenantDatabase } from "../workspace/postgres-repository";
import { ParsedStructureSchema } from "../workspace/schemas";
import { contentHash } from "./chunker";
import { EvidenceSchema, evidenceColumns } from "./postgres-knowledge";
import { SearchFailure } from "./search-failure";
import { CitationAnchorSchema, type CitationAnchor, type CitationSource } from "./citation-contract";
import { locationLabel } from "./types";

export class CitationReader {
  constructor(private db: TenantDatabase) {}
  async get(userId: string, input: CitationAnchor, view: "context" | "full" = "context"): Promise<CitationSource> {
    const anchor = CitationAnchorSchema.parse(input);
    // Source and body come from one authorized statement/snapshot, never a list.
    const result = await this.db.query(userId, `select ${evidenceColumns},0::float as score,d.text_content as text,d.metadata
      from filemind.document_chunks c join filemind.documents d on d.id=c.document_id and d.user_id=c.user_id
      where c.user_id=$1 and d.user_id=$1 and c.id=$2 and d.id=$3`, [userId, anchor.chunkId, anchor.documentId]);
    if (!result.rows.length) throw new SearchFailure("SOURCES_CHANGED");
    const row = result.rows[0] as { text: string; metadata: { structure?: unknown } };
    const source = EvidenceSchema.parse(row);
    const textVersion = contentHash(row.text);
    if (anchor.contentHash !== undefined && anchor.contentHash !== source.contentHash ||
      anchor.chunkVersion !== undefined && anchor.chunkVersion !== source.chunkVersion ||
      anchor.documentHash !== undefined && anchor.documentHash !== source.documentHash ||
      anchor.textVersion !== undefined && anchor.textVersion !== textVersion ||
      anchor.charStart !== undefined && anchor.charStart !== source.charStart ||
      anchor.charEnd !== undefined && anchor.charEnd !== source.charEnd) throw new SearchFailure("SOURCES_CHANGED", 409);
    const validRange = source.charStart >= 0 && source.charEnd > source.charStart && source.charEnd <= row.text.length;
    if (!validRange || row.text.slice(source.charStart, source.charEnd) !== source.content || contentHash(source.content) !== source.contentHash) throw new SearchFailure("SOURCES_CHANGED", 409);
    // Missing old anchor metadata cannot establish an exact historical location.
    const located = anchor.contentHash !== undefined && anchor.chunkVersion !== undefined && anchor.charStart !== undefined && anchor.charEnd !== undefined;
    const structure = ParsedStructureSchema.safeParse(row.metadata?.structure);
    const pages = structure.success ? structure.data.pages?.filter(p => p.charStart < source.charEnd && p.charEnd > source.charStart) : undefined;
    const realPage = located && source.fileType === "pdf" && pages?.length && pages[0].charStart <= source.charStart && pages.at(-1)!.charEnd >= source.charEnd &&
      pages.every(p => p.page > 0) && source.pageStart === pages[0].page && source.pageEnd === pages.at(-1)!.page ? pages[0].page : null;
    const label = source.fileType === "pdf" ? realPage ? `第 ${source.pageStart}${source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ""} 页` : "缺少可靠页码 · 仅核对提取文字" :
      source.fileType === "image" ? source.chunkSource === "ocr" ? "图片 · OCR 文字" : "图片 · AI 解读" : locationLabel({ ...source, pageStart: null, pageEnd: null });
    return { ...source, citation: {
      status: located ? "located" : "unavailable", label,
      before: located ? row.text.slice(Math.max(0, source.charStart - 400), source.charStart) : "",
      after: located ? row.text.slice(source.charEnd, source.charEnd + 400) : "",
      range: located ? { start: source.charStart, end: source.charEnd } : null,
      pdfPage: realPage, textVersion, ...(view === "full" ? { text: row.text } : {}),
    } };
  }
}
