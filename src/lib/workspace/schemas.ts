import { z } from "zod";
import { uploadConfig } from "@/config/upload";
export const DatabaseTimestampSchema = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
export const ParsedStructureSchema = z.object({
  knowledgeSections: z.array(z.object({ charStart: z.number().int().nonnegative(), charEnd: z.number().int().nonnegative(), source: z.enum(["ocr", "vision_summary", "concepts", "mixed"]) })).max(100).optional(),
  pages: z.array(z.object({ page: z.number().int().positive(), charStart: z.number().int().nonnegative(), charEnd: z.number().int().nonnegative() })).max(uploadConfig.maxPdfPages).optional(),
  paragraphs: z.array(z.object({ index: z.number().int().positive(), charStart: z.number().int().nonnegative(), charEnd: z.number().int().nonnegative(), heading: z.string().max(uploadConfig.maxContentCharacters).optional(), level: z.number().int().min(1).max(6).optional() })).max(uploadConfig.maxContentCharacters).optional(),
});

export const DocumentSchema = z.object({
  id: z.uuid(), name: z.string().min(1).max(255), type: z.enum(["pdf", "docx", "txt", "md", "image"]),
  mimeType: z.string().max(160), size: z.number().int().min(0).max(uploadConfig.maxFileBytes),
  contentRef: z.string().max(100).optional(), pageCount: z.number().int().positive().optional(),
  parseStatus: z.enum(["ready", "processing", "completed", "failed", "skipped"]), parseError: z.string().max(1000).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), normalizedTextHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), storagePath: z.string().max(600).optional(),
  metadata: z.object({ addedAt: z.iso.datetime(), characters: z.number().int().nonnegative().max(uploadConfig.maxContentCharacters).optional(), width: z.number().positive().optional(), height: z.number().positive().optional(), truncated: z.boolean().optional(), warnings: z.array(z.string().max(1000)).max(100).optional(), structure: ParsedStructureSchema.optional() }),
});
const decision = z.enum(["pending", "accepted", "ignored"]);
export const OrganizationProposalSchema = z.object({
  documents: z.array(z.object({ id: z.uuid(), originalName: z.string().min(1).max(255), name: z.string().min(1).max(255), category: z.string().trim().min(1).max(80), tags: z.array(z.string().trim().min(1).max(40)).max(8), summary: z.string().max(3000), suggestedName: z.string().max(255).optional(), renameDecision: decision, document: DocumentSchema })).max(30),
  duplicates: z.array(z.object({ id: z.string().max(100), documentIds: z.array(z.uuid()).min(2).max(30), reason: z.string().max(500), decision, kind: z.enum(["exact", "text", "name"]).optional() })).max(90),
  relationships: z.array(z.object({ id: z.string().max(100), source: z.uuid(), target: z.uuid(), reason: z.string().max(500), decision, kind: z.enum(["rule-based", "ai-inferred", "shared_concept", "semantic"]).optional() })).max(435),
  simulation: z.boolean(), summary: z.string().max(1500).optional(),
}).superRefine((plan, ctx) => {
  const ids = new Set(plan.documents.map(d => d.id));
  if (ids.size !== plan.documents.length || plan.documents.some(d => d.id !== d.document.id)) ctx.addIssue({ code: "custom", message: "Invalid document identity" });
  if (plan.duplicates.some(d => d.documentIds.some(id => !ids.has(id))) || plan.relationships.some(r => !ids.has(r.source) || !ids.has(r.target) || r.source === r.target)) ctx.addIssue({ code: "custom", message: "References must belong to this proposal" });
});
export const RunSchema = z.object({
  visionUsage: z.object({ requests: z.number().nonnegative(), latencyMs: z.number().nonnegative(), inputTokens: z.number().nonnegative().optional(), outputTokens: z.number().nonnegative().optional(), totalTokens: z.number().nonnegative().optional() }).optional(),
  id: z.uuid(), status: z.enum(["idle", "planning", "running", "waiting_for_review", "applying", "completed", "failed", "cancelled"]), simulation: z.boolean(), startedAt: z.number(), completedAt: z.number().optional(),
  documents: z.array(DocumentSchema).max(30), steps: z.array(z.object({ id: z.uuid(), title: z.string().max(160), description: z.string().max(500), tool: z.enum(["read_document", "analyze_document", "analyze_image", "summarize_document", "classify_document", "generate_tags", "generate_filename", "detect_duplicates", "build_relationships", "generate_organization_plan"]), status: z.enum(["pending", "running", "completed", "failed", "skipped"]), progress: z.number().min(0).max(100), startedAt: z.number().optional(), completedAt: z.number().optional(), input: z.object({ documentId: z.uuid().optional() }), output: z.string().max(3000).optional(), error: z.string().max(1000).optional() })).max(200),
  progress: z.number().min(0).max(100), activity: z.array(z.object({ id: z.uuid(), at: z.number(), message: z.string().max(1000) })).max(1000), result: OrganizationProposalSchema.optional(), error: z.string().max(1000).optional(),
  engine: z.enum(["mock", "llm"]).optional(), model: z.string().max(120).optional(), promptVersion: z.string().max(160).optional(), interrupted: z.boolean().optional(), fallback: z.string().max(1000).optional(), usage: z.object({ promptTokens: z.number().nonnegative(), completionTokens: z.number().nonnegative(), totalTokens: z.number().nonnegative() }).optional(),
});
export const WorkspaceSnapshotSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(120), revision: z.number().int().nonnegative(), documents: z.array(DocumentSchema).max(30), run: RunSchema.nullable(), proposal: OrganizationProposalSchema.nullable(), texts: z.record(z.uuid(), z.string().max(uploadConfig.maxContentCharacters)), updatedAt: z.iso.datetime() }).superRefine((s, ctx) => {
  const ids = new Set(s.documents.map(d => d.id));
  if (ids.size !== s.documents.length || Object.keys(s.texts).some(id => !ids.has(id)) || s.run?.documents.some(d => !ids.has(d.id)) || s.proposal?.documents.some(d => !ids.has(d.id))) ctx.addIssue({ code: "custom", message: "Workspace references are invalid" });
});
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;
export function recoverSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const recovered = structuredClone(snapshot);
  if (recovered.run && ["planning", "running", "applying"].includes(recovered.run.status)) {
    recovered.run.interrupted = true; recovered.run.status = "failed";
    recovered.run.error = "Run interrupted. Resume analysis to continue; no background job is running.";
  }
  return recovered;
}
