import type { OrganizationPlan } from "@/types/workspace";
import { sanitizeFilename } from "@/lib/ai/input-guard";
import type { WorkspaceSnapshot } from "./schemas";
import { validateMockSave, validateReview, validateWorkspaceRevision, WorkspaceError } from "./authorization";

// Business transformations only. Callers supply parsed, tenant-owned snapshots;
// persistence, optimistic locking and recovery journals remain separate.
export function prepareMockWorkspaceSave(snapshot: WorkspaceSnapshot, submitted: WorkspaceSnapshot): WorkspaceSnapshot {
  validateMockSave(snapshot, submitted);
  const next = structuredClone(submitted);
  if (next.run?.status === "completed" && next.proposal) {
    next.proposal.relationships = next.proposal.relationships.filter(r => r.decision === "accepted");
    next.run.result = structuredClone(next.proposal);
  }
  return next;
}

export function resumeWorkspace(snapshot: WorkspaceSnapshot, revision: number): WorkspaceSnapshot {
  validateWorkspaceRevision(snapshot, revision);
  if (!snapshot.run || !["running", "planning", "failed", "cancelled"].includes(snapshot.run.status)) throw new WorkspaceError("INVALID_STATE", "此整理记录无法继续，请重新开始。", 409);
  return { ...structuredClone(snapshot), run: null, proposal: null };
}

export function reviewWorkspace(snapshot: WorkspaceSnapshot, revision: number, proposal: OrganizationPlan | undefined): WorkspaceSnapshot {
  validateWorkspaceRevision(snapshot, revision);
  if (!proposal) throw new WorkspaceError("INVALID_STATE", "缺少整理方案。");
  validateReview(snapshot, proposal);
  return { ...structuredClone(snapshot), proposal: structuredClone(proposal) };
}

export function applyWorkspacePlan(snapshot: WorkspaceSnapshot, revision: number, proposal: OrganizationPlan | undefined, completedAt = Date.now()): WorkspaceSnapshot {
  // Validate the complete last edit before filtering suggestions. Do not apply a
  // possibly older snapshot.proposal or run.result in place of the request plan.
  const next = reviewWorkspace(snapshot, revision, proposal);
  const applied = next.proposal!;
  applied.documents = applied.documents.map(d => ({ ...d,
    name: d.renameDecision === "accepted" && d.suggestedName ? sanitizeFilename(d.suggestedName, d.originalName) : d.originalName,
  }));
  applied.relationships = applied.relationships.filter(r => r.decision === "accepted");
  next.run!.status = "completed";
  next.run!.completedAt = completedAt;
  next.run!.result = structuredClone(applied);
  return next;
}
