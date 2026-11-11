import { z } from "zod";
import type { Evidence } from "./types";

// Public answer data. Keep generation, provider calls and verification in the cores.
export const AnswerStateSchema = z.enum(["answered", "no_answer", "needs_clarification", "conflicting", "error"]);
export const ConflictSchema = z.object({ detected: z.boolean(), claims: z.array(z.object({ topic: z.string(), sourceIds: z.array(z.string()), values: z.array(z.string()) })) });
export const ClarificationSchema = z.object({ required: z.boolean(), question: z.string().optional(), options: z.array(z.object({ label: z.string(), documentIds: z.array(z.uuid()) })).optional() });
export const RAGAnswerSchema = z.object({ answer: z.string().min(1).max(16000), citations: z.array(z.object({ sourceId: z.string().regex(/^S[1-9]\d*$/), chunkId: z.uuid(), documentId: z.uuid() })).max(20), confidence: z.enum(["high", "medium", "low"]), insufficientEvidence: z.boolean(), evidenceDecision: z.object({ supported: z.boolean(), missingInformation: z.array(z.string().max(300)).max(10) }).optional(), answerState: AnswerStateSchema.optional(), conflict: ConflictSchema.optional(), clarification: ClarificationSchema.optional() });
export type RAGAnswer = z.infer<typeof RAGAnswerSchema>;
export interface RAGSource extends Evidence { sourceId: string; location: string }

export interface AnswerVerificationSummary {
  version: string; accepted: boolean; reason?: string;
  completeness: number | null; faithfulness: number | null;
}
