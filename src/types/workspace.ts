import type { DocumentType } from "./documents";
import type { WorkspaceSnapshot } from "@/lib/workspace/schemas";

export type ParseStatus = "ready" | "processing" | "completed" | "failed" | "skipped";
// Native Files and extracted text live in the parser service, never in this contract.
export interface ParsedDocument {
  id: string; name: string; type: DocumentType; mimeType: string; size: number;
  contentRef?: string; pageCount?: number; parseStatus: ParseStatus; parseError?: string;
  contentHash?: string; normalizedTextHash?: string; storagePath?: string;
  metadata: { addedAt: string; characters?: number; width?: number; height?: number; truncated?: boolean; warnings?: string[] };
}
export type RunStatus = "idle" | "planning" | "running" | "waiting_for_review" | "applying" | "completed" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type AgentTool = "read_document" | "analyze_document" | "summarize_document" | "classify_document" | "generate_tags" | "generate_filename" | "detect_duplicates" | "build_relationships" | "generate_organization_plan";
export interface AgentStep {
  id: string; title: string; description: string; tool: AgentTool; status: StepStatus; progress: number;
  startedAt?: number; completedAt?: number; input: { documentId?: string }; output?: string; error?: string;
}
export type Decision = "pending" | "accepted" | "ignored";
export interface ProposalDocument {
  id: string; originalName: string; name: string; category: string; tags: string[]; summary: string;
  suggestedName?: string; renameDecision: Decision; document: ParsedDocument;
}
export interface DuplicateCandidate { id: string; documentIds: string[]; reason: string; decision: Decision; kind?: "exact" | "text" | "name" }
export interface KnowledgeConnection { id: string; source: string; target: string; reason: string; decision: Decision; kind?: "rule-based" | "ai-inferred" }
export interface OrganizationPlan { documents: ProposalDocument[]; duplicates: DuplicateCandidate[]; relationships: KnowledgeConnection[]; simulation: boolean; summary?: string }
export interface AgentRun {
  id: string; status: RunStatus; simulation: boolean; startedAt: number; completedAt?: number;
  engine?: "mock" | "llm"; model?: string; promptVersion?: string; interrupted?: boolean; fallback?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  documents: ParsedDocument[]; steps: AgentStep[]; progress: number;
  activity: { id: string; at: number; message: string }[]; result?: OrganizationPlan; error?: string;
}
export type DemoFault = "none" | "parse" | "tool" | "agent";
export type RunListener = (run: AgentRun) => void;
export interface AgentEngine {
  initialize?(workspaceId?: string): Promise<{ snapshot: WorkspaceSnapshot | null; persistent: boolean; label: string }>;
  saveProposal?(plan: OrganizationPlan): Promise<void>;
  continueLocally?(documents: ParsedDocument[], onUpdate: RunListener): Promise<void>;
  resetWorkspace?(): void;
  getWorkspaceId?(): string | undefined;
  createRun(documents: ParsedDocument[], fault?: DemoFault): AgentRun;
  executeRun(runId: string, onUpdate: RunListener): Promise<void>;
  cancelRun(runId: string): void;
  retryStep(runId: string, stepId: string, onUpdate: RunListener): Promise<void>;
  skipStep(runId: string, stepId: string, onUpdate: RunListener): Promise<void>;
  applyPlan(runId: string, plan: OrganizationPlan, onUpdate: RunListener): Promise<void>;
  disposeRun(runId: string): void;
}
