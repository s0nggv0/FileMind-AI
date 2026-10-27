import { z } from "zod";
import type { Evidence } from "./types";

export const CitationAnchorSchema = z.object({
  chunkId: z.uuid(), documentId: z.uuid(),
  contentHash: z.string().min(1).max(128).optional(), chunkVersion: z.string().min(1).max(128).optional(),
  documentHash: z.string().min(1).max(128).optional(), textVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  charStart: z.coerce.number().int().nonnegative().optional(), charEnd: z.coerce.number().int().positive().optional(),
}).strict();
export type CitationAnchor = z.infer<typeof CitationAnchorSchema>;
export interface CitationPosition {
  status: "located" | "unavailable";
  label: string; before: string; after: string;
  range: { start: number; end: number } | null;
  pdfPage: number | null;
  textVersion: string;
  text?: string;
}
export interface CitationSource extends Evidence { citation?: CitationPosition }

export function citationAnchor(source: Evidence, textVersion?: string): CitationAnchor {
  return CitationAnchorSchema.parse({ chunkId: source.id, documentId: source.documentId,
    ...(source.contentHash ? { contentHash: source.contentHash } : {}),
    ...(source.chunkVersion ? { chunkVersion: source.chunkVersion } : {}),
    ...(source.documentHash ? { documentHash: source.documentHash } : {}),
    ...(Number.isInteger(source.charStart) ? { charStart: source.charStart } : {}),
    ...(Number.isInteger(source.charEnd) && source.charEnd > 0 ? { charEnd: source.charEnd } : {}),
    ...(textVersion ? { textVersion } : {}),
  });
}
export function citationParams(anchor: CitationAnchor) {
  return new URLSearchParams(Object.entries(anchor).map(([key, value]) => [key, String(value)]));
}
export function parseCitationAnchor(params: URLSearchParams) {
  return CitationAnchorSchema.parse(Object.fromEntries(["chunkId", "documentId", "contentHash", "chunkVersion", "documentHash", "textVersion", "charStart", "charEnd"].filter(key => params.has(key)).map(key => [key, params.get(key)])));
}
export function citationURL(anchor: CitationAnchor, view: "context" | "full") {
  const params = citationParams(anchor); params.set("view", view);
  return `/api/search?${params}`;
}
export function citationLibraryURL(anchor: CitationAnchor, runId?: string) {
  const params = citationParams(anchor); params.set("source", "workspace"); params.set("document", anchor.documentId);
  if (runId && z.uuid().safeParse(runId).success) params.set("run", runId);
  return `/library?${params}`;
}
export function returnToSearchURL(runId: string, chunkId?: string) {
  const params = new URLSearchParams({ run: z.uuid().parse(runId) });
  if (chunkId && z.uuid().safeParse(chunkId).success) params.set("focusChunk", chunkId);
  return `/search?${params}`;
}
