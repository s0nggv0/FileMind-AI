import type { Evidence } from "./types";
export interface StructuredEvidenceDecision { supported: boolean; missingInformation: string[] }
export interface EvidenceAssessment {
  sufficient: boolean;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  evidenceCount: number;
  documentDiversity: number;
  topSemanticScore: number | null;
  topEvidenceGap: number | null;
  topLexicalCoverage: number;
}
export class EvidenceSufficiencyEvaluator {
  evaluate(evidence: Evidence[], decision?: StructuredEvidenceDecision): EvidenceAssessment {
    const scores = evidence.map(e => e.semanticScore ?? (e.retrievalSource !== "lexical" && e.fusedRank === undefined ? e.score : undefined)).filter((s): s is number => s !== undefined).sort((a, b) => b - a);
    const top = scores[0] ?? null;
    const coverage = Math.max(0, ...evidence.map(e => e.lexicalCoverage ?? 0));
    const diversity = new Set(evidence.map(e => e.documentId)).size;
    const gap = scores.length >= 2 ? scores[0] - scores[1] : null;
    const reasons: string[] = [];
    if (!evidence.length) reasons.push("No usable evidence was retrieved.");
    if (evidence.length && (top === null || top < 0.5) && coverage < 0.5) reasons.push("Retrieved evidence has weak semantic similarity and limited exact-term coverage.");
    if (decision && (!decision.supported || decision.missingInformation.length)) reasons.push("The structured source decision identifies unsupported requested information.");
    const sufficient = !reasons.length;
    // Count, diversity and gap describe support breadth; none proves correctness.
    const confidence = !sufficient ? "low" : top !== null && top >= 0.7 && (gap === null || gap >= 0.05 || diversity > 1) ? "high" : "medium";
    if (sufficient) reasons.push(diversity > 1 ? "Usable support spans multiple documents." : "Usable support comes from one document.");
    return { sufficient, confidence, reasons, evidenceCount: evidence.length, documentDiversity: diversity, topSemanticScore: top, topEvidenceGap: gap, topLexicalCoverage: coverage };
  }
}
