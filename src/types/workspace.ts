import type { DocumentType } from "./documents";

export type ParseStatus = "ready" | "processing" | "completed" | "failed" | "skipped";
// Native Files and extracted text live in the parser service, never in this contract.
export interface ParsedDocument {
  id: string; name: string; type: DocumentType; mimeType: string; size: number;
  contentRef?: string; pageCount?: number; parseStatus: ParseStatus; parseError?: string;
  metadata: { addedAt: string; characters?: number; width?: number; height?: number; truncated?: boolean; warnings?: string[] };
}
export type RunStatus = "idle" | "planning" | "running" | "waiting_for_review" | "applying" | "completed" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type AgentTool = "read_document" | "summarize_document" | "classify_document" | "generate_tags" | "detect_duplicates" | "build_relationships" | "generate_organization_plan";
export interface AgentStep {
  id: string; title: string; description: string; tool: AgentTool; status: StepStatus; progress: number;
  startedAt?: number; completedAt?: number; input: { documentId?: string }; output?: string; error?: string;
}
export type Decision = "pending" | "accepted" | "ignored";
export interface ProposalDocument {
  id: string; originalName: string; name: string; category: string; tags: string[]; summary: string;
  suggestedName?: string; renameDecision: Decision; document: ParsedDocument;
}
export interface DuplicateCandidate { id: string; documentIds: string[]; reason: string; decision: Decision }
export interface KnowledgeConnection { id: string; source: string; target: string; reason: string; decision: Decision }
export interface OrganizationPlan { documents: ProposalDocument[]; duplicates: DuplicateCandidate[]; relationships: KnowledgeConnection[]; simulation: true }
export interface AgentRun {
  id: string; status: RunStatus; simulation: true; startedAt: number; completedAt?: number;
  documents: ParsedDocument[]; steps: AgentStep[]; progress: number;
  activity: { id: string; at: number; message: string }[]; result?: OrganizationPlan; error?: string;
}
export type DemoFault = "none" | "parse" | "tool" | "agent";
export type RunListener = (run: AgentRun) => void;
export interface AgentEngine {
  createRun(documents: ParsedDocument[], fault?: DemoFault): AgentRun;
  executeRun(runId: string, onUpdate: RunListener): Promise<void>;
  cancelRun(runId: string): void;
  retryStep(runId: string, stepId: string, onUpdate: RunListener): Promise<void>;
  skipStep(runId: string, stepId: string, onUpdate: RunListener): Promise<void>;
  applyPlan(runId: string, plan: OrganizationPlan, onUpdate: RunListener): Promise<void>;
  disposeRun(runId: string): void;
}
