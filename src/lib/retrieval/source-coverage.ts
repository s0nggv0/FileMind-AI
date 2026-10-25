import { passageIdentity } from "./evidence-diversity";
import type { Evidence } from "./types";
import { documentReadiness, type ReadinessDocument } from "./readiness";

export type CoverageSelection = { documents: ReadinessDocument[]; total: number };
export interface SourceCoverage {
  selectedCount: number;
  evidenceDocumentIds: string[];
  citedDocumentIds: string[];
  mergedCopies: { documentId: string; intoDocumentId: string }[];
  uncovered: { documentId: string; name: string; reason: "not_ready" | "no_relevant_evidence" | "budget" | "not_cited" | "missing_facts"; detail?: string }[];
  unlistedCount: number;
  complete: boolean;
}
export function sourceCoverage(selection: CoverageSelection, candidates: Evidence[], sources: Evidence[], citedIds?: string[], factGaps: { documentId: string; detail: string }[] = []): SourceCoverage {
  const evidenceDocumentIds = [...new Set(sources.map(s => s.documentId))];
  const citedDocumentIds = [...new Set(sources.filter(s => citedIds?.includes(s.id)).map(s => s.documentId))];
  const mergedCopies: SourceCoverage["mergedCopies"] = [], uncovered: SourceCoverage["uncovered"] = [];
  for (const document of selection.documents) {
    if (evidenceDocumentIds.includes(document.id)) {
      const gap = factGaps.find(g => g.documentId === document.id);
      if (gap) uncovered.push({ documentId: document.id, name: document.name, reason: "missing_facts", detail: gap.detail });
      else if (citedIds && !citedDocumentIds.includes(document.id)) uncovered.push({ documentId: document.id, name: document.name, reason: "not_cited" });
      continue;
    }
    const candidate = candidates.find(c => c.documentId === document.id && sources.some(s => s.documentId !== c.documentId && passageIdentity(s) === passageIdentity(c)));
    if (candidate) {
      const representative = sources.find(s => passageIdentity(s) === passageIdentity(candidate))!;
      mergedCopies.push({ documentId: document.id, intoDocumentId: representative.documentId });
      continue;
    }
    uncovered.push({ documentId: document.id, name: document.name,
      reason: !documentReadiness(document).searchable ? "not_ready" : candidates.some(c => c.documentId === document.id) ? "budget" : "no_relevant_evidence" });
  }
  const unlistedCount = Math.max(0, selection.total - selection.documents.length);
  return { selectedCount: selection.total, evidenceDocumentIds, citedDocumentIds, mergedCopies, uncovered, unlistedCount,
    complete: selection.total > 0 && !uncovered.length && !unlistedCount };
}
