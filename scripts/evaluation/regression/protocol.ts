import { createHash } from "node:crypto";
import { z } from "zod";
import { percentiles, retrievalMetrics } from "../blind-protocol";

export const PROTOCOL = "retrieval-qa-regression-v1";
export const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const EvidenceSchema = z.object({ id: z.string(), documentId: z.string(), text: z.string().min(1), charStart: z.number().int().nonnegative(), charEnd: z.number().int().positive() });
export const DatasetSchema = z.object({
  id: z.string(), kind: z.enum(["synthetic", "authorized-real"]),
  authorization: z.object({ reference: z.string().min(1), deidentified: z.literal(true), evaluationAllowed: z.literal(true) }).optional(),
  goldAuthor: z.string().min(1), goldMethod: z.literal("independently-authored"),
  documents: z.array(z.object({ id: z.string(), name: z.string(), text: z.string().min(1), version: z.string(), origin: z.enum(["text", "synthetic-ocr-transcript", "authorized-extracted-text"]) })).min(1),
  questions: z.array(z.object({
    id: z.string(), query: z.string().min(1), tags: z.array(z.string()), scope: z.array(z.string()).min(1),
    relevantDocuments: z.array(z.string()), evidence: z.array(EvidenceSchema),
    answerability: z.enum(["answerable", "no-answer", "conflict"]), answerableScope: z.string().min(1),
    requiredComparisonSources: z.array(z.string()), refusalConditions: z.array(z.string()).min(1),
    facts: z.array(z.object({ id: z.string(), statements: z.array(z.string().min(1)).min(1), evidenceIds: z.array(z.string()).min(1) })),
    conflictStatements: z.array(z.string()),
  })).min(1),
});
export type Dataset = z.infer<typeof DatasetSchema>;
export type Question = Dataset["questions"][number];
export interface Passage { chunkId: string; documentId: string; documentHash: string; content: string; charStart: number; charEnd: number }
export interface Claim { text: string; sourceIds: string[] }
export interface Observation {
  questionId: string; attempt: number; status: "answered" | "refused" | "verification-rejected" | "service-failure" | "stopped";
  retrieved: Passage[]; claims: Claim[];
  citations: { sourceId: string; chunkId: string; documentId: string }[];
  sourceMap: Record<string, string>; reason: string | null;
  conflictDetected: boolean; runtimeVerification: "accepted" | "rejected" | "not-run";
  latencyMs: number; requests: number; tokens: { prompt: number; completion: number; total: number } | null;
}

export function validateDataset(input: unknown, authorizationId?: string): Dataset {
  const data = DatasetSchema.parse(input);
  if (data.kind === "authorized-real" && (!data.authorization || authorizationId !== data.authorization.reference)) throw new Error("Explicit matching corpus authorization required");
  const docs = new Map(data.documents.map(d => [d.id, d]));
  if (docs.size !== data.documents.length || new Set(data.questions.map(q => q.id)).size !== data.questions.length) throw new Error("Duplicate fixture IDs");
  for (const q of data.questions) {
    if ([...q.scope, ...q.relevantDocuments, ...q.requiredComparisonSources].some(id => !docs.has(id) || !q.scope.includes(id))) throw new Error("Gold outside question scope");
    if (new Set(q.evidence.map(e => e.id)).size !== q.evidence.length || new Set(q.facts.map(f => f.id)).size !== q.facts.length) throw new Error("Duplicate gold IDs");
    for (const e of q.evidence) {
      if (!q.relevantDocuments.includes(e.documentId) || docs.get(e.documentId)?.text.slice(e.charStart, e.charEnd) !== e.text) throw new Error("Gold evidence position mismatch");
    }
    if (q.facts.some(f => f.evidenceIds.some(id => !q.evidence.some(e => e.id === id)))) throw new Error("Fact without gold evidence");
    if (q.answerability === "no-answer" ? q.facts.length > 0 : !q.facts.length || !q.relevantDocuments.length) throw new Error("Invalid answerability gold");
    if (q.requiredComparisonSources.some(id => !q.relevantDocuments.includes(id))) throw new Error("Comparison outside relevance gold");
    if (q.answerability === "conflict" && (q.requiredComparisonSources.length < 2 || !q.conflictStatements.length)) throw new Error("Conflict requires both sources and explicit disclosure gold");
  }
  return data;
}

const normalize = (text: string) => text.replace(/\[S\d+\]/g, "").replace(/\s+/g, " ").trim().replace(/[。.!！]+$/, "");
export function judge(data: Dataset, q: Question, row: Observation) {
  const docs = new Map(data.documents.map(d => [d.id, d]));
  const matching = (p: Passage, e: Question["evidence"][number]) => p.documentId === e.documentId && p.documentHash === hash(docs.get(e.documentId)!.text) && p.charStart <= e.charStart && p.charEnd >= e.charEnd && p.content.includes(e.text);
  const recalled = q.evidence.filter(e => row.retrieved.some(p => matching(p, e)));
  const validCitations = row.citations.filter(c => row.sourceMap[c.sourceId] === c.chunkId && row.retrieved.some(p => p.chunkId === c.chunkId && p.documentId === c.documentId && p.documentHash === hash(docs.get(p.documentId)?.text ?? "") && q.scope.includes(p.documentId)));
  const factsFor = (claim: Claim) => q.facts.filter(f => f.statements.some(s => normalize(s) === normalize(claim.text)));
  const supportedClaims = row.claims.filter(c => factsFor(c).some(f => f.evidenceIds.some(id => recalled.some(e => e.id === id))));
  const citedClaims = row.claims.filter(c => factsFor(c).some(f => f.evidenceIds.some(id => q.evidence.some(e => e.id === id && row.retrieved.some(p => matching(p, e) && validCitations.some(ref => c.sourceIds.includes(ref.sourceId) && ref.chunkId === p.chunkId))))));
  const matchedFacts = q.facts.filter(f => row.claims.some(c => factsFor(c).includes(f)));
  const retrievedDocs = new Set(row.retrieved.map(p => p.documentId));
  const comparisonComplete = q.requiredComparisonSources.every(id => retrievedDocs.has(id));
  const conflictDisclosed = row.status === "answered" && comparisonComplete && matchedFacts.length === q.facts.length && row.claims.some(c => q.conflictStatements.some(s => normalize(s) === normalize(c.text)));
  const disclosureClaims = row.claims.filter(c => q.conflictStatements.some(s => normalize(s) === normalize(c.text)));
  const unassessedClaims = row.claims.length - supportedClaims.length - disclosureClaims.length;
  const failures: string[] = [];
  if (recalled.length < q.evidence.length || q.relevantDocuments.some(id => !retrievedDocs.has(id))) failures.push("retrieval-omission");
  if (row.status === "service-failure" || row.status === "stopped") failures.push("service-failure");
  if (row.status === "verification-rejected") failures.push("verification-rejection");
  if (row.status === "refused" && q.answerability !== "no-answer") failures.push("false-refusal");
  if (row.status === "answered" && (q.answerability === "no-answer" || matchedFacts.length !== q.facts.length || citedClaims.length !== supportedClaims.length || unassessedClaims > 0 || !validCitations.length || (q.answerability === "conflict" && !conflictDisclosed))) failures.push("generation-error");
  return {
    failures, recalledEvidence: recalled.length, expectedEvidence: q.evidence.length,
    recalledDocuments: q.relevantDocuments.filter(id => retrievedDocs.has(id)).length, expectedDocuments: q.relevantDocuments.length,
    comparisonComplete, conflictDisclosed, matchedFacts: matchedFacts.length, expectedFacts: q.facts.length,
    supportedClaims: supportedClaims.length, factualClaims: row.claims.length - disclosureClaims.length, citedClaims: citedClaims.length,
    unassessedClaims, validCitations: validCitations.length, citations: row.citations.length,
    rank: retrievalMetrics(row.retrieved.map(p => ({ documentName: p.documentId })), q.relevantDocuments),
  };
}

export function summarize(data: Dataset, rows: Observation[]) {
  const judged = rows.map(row => ({ row, q: data.questions.find(q => q.id === row.questionId)!, value: judge(data, data.questions.find(q => q.id === row.questionId)!, row) }));
  const ratio = (samples: typeof judged, numerator: (r: typeof judged[number]) => number, denominator: (r: typeof judged[number]) => number, rule: string) => {
    const n = samples.reduce((s, r) => s + numerator(r), 0), d = samples.reduce((s, r) => s + denominator(r), 0);
    return { samples: samples.length, numerator: n, denominator: d, value: d ? n / d : null, rule };
  };
  const relevant = judged.filter(r => r.q.relevantDocuments.length), answerable = judged.filter(r => r.q.answerability !== "no-answer"), noAnswer = judged.filter(r => r.q.answerability === "no-answer");
  const released = judged.filter(r => r.row.status === "answered"), comparisons = judged.filter(r => r.q.requiredComparisonSources.length), conflicts = judged.filter(r => r.q.answerability === "conflict");
  return {
    automatedRuleJudgment: {
      documentRecall: ratio(relevant, r => r.value.recalledDocuments, r => r.value.expectedDocuments, "micro: distinct relevant documents in released retrieval evidence / gold documents"),
      evidenceRecall: ratio(relevant, r => r.value.recalledEvidence, r => r.value.expectedEvidence, "micro: gold span covered in same document hash and position / gold spans"),
      comparisonSourceCompleteness: ratio(comparisons, r => Number(r.value.comparisonComplete), () => 1, "all required comparison documents retrieved / comparison questions"),
      citationValidity: ratio(released, r => r.value.validCitations, r => r.value.citations, "identity, scope and corpus hash valid / returned citation records; no citations yields null"),
      claimCitationSupport: ratio(released, r => r.value.citedClaims, r => r.value.factualClaims, "exact gold factual claim has supporting cited gold span / released factual claims"),
      factualSupportEstablished: ratio(released, r => r.value.supportedClaims, r => r.value.factualClaims, "exact independently authored statement and retrieved gold evidence / released factual claims; unmatched is unassessed, not proven false"),
      requestedFactCoverage: ratio(answerable, r => r.value.matchedFacts, r => r.value.expectedFacts, "exact gold statements present / requested facts; refusals and outages remain in denominator"),
      correctRefusal: ratio(noAnswer, r => Number(r.row.status === "refused"), () => 1, "explicit refusal / no-answer questions; outage/verifier rejection never a correct refusal"),
      falseRefusal: ratio(answerable, r => Number(r.row.status === "refused"), () => 1, "explicit refusal / answerable or conflict questions; failures reported separately"),
      conflictDisclosure: ratio(conflicts, r => Number(r.value.conflictDisclosed), () => 1, "explicit gold disclosure plus both sides and required sources / conflict questions"),
    },
    unassessedClaims: judged.reduce((s, r) => s + r.value.unassessedClaims, 0),
    failureCounts: Object.fromEntries(["retrieval-omission", "generation-error", "false-refusal", "verification-rejection", "service-failure"].map(kind => [kind, judged.filter(r => r.value.failures.includes(kind)).length])),
    latencyMs: { all: percentiles(rows.map(r => r.latencyMs)), failures: percentiles(judged.filter(r => r.value.failures.length).map(r => r.row.latencyMs)) },
    requests: { samples: rows.length, total: rows.reduce((s, r) => s + r.requests, 0) },
    tokens: { samples: rows.length, availableSamples: rows.filter(r => r.tokens !== null).length, total: rows.some(r => r.tokens !== null) ? rows.reduce((s, r) => s + (r.tokens?.total ?? 0), 0) : null },
    modelJudgment: { performed: false, samples: 0 }, humanReview: { status: "pending", reviewed: 0, samples: rows.length },
  };
}
