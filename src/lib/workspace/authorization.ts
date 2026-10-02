import type { OrganizationPlan } from "@/types/workspace";
import type { WorkspaceSnapshot } from "./schemas";
import { isDeepStrictEqual } from "node:util";

export class WorkspaceError extends Error {
  constructor(public code: "NOT_FOUND" | "CONFLICT" | "INVALID_STATE" | "UNAVAILABLE", message: string, public status = 400) { super(message); }
}
export function authorizeWorkspace(owner: string, userId: string) {
  if (owner !== userId) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
}
export function validateReview(snapshot: WorkspaceSnapshot, proposal: OrganizationPlan) {
  if (snapshot.run?.status !== "waiting_for_review" || !snapshot.proposal) throw new WorkspaceError("INVALID_STATE", "Workspace is not ready for review.", 409);
  const old = snapshot.proposal;
  const ids = new Set(old.documents.map(d => d.id));
  if (proposal.documents.length !== ids.size || proposal.documents.some(d => !ids.has(d.id))) throw new WorkspaceError("INVALID_STATE", "Review cannot add or remove documents.");
  for (const document of proposal.documents) {
    const original = old.documents.find(d => d.id === document.id)!;
    if (document.originalName !== original.originalName || document.suggestedName !== original.suggestedName || document.summary !== original.summary || !isDeepStrictEqual(document.document, original.document)) throw new WorkspaceError("INVALID_STATE", "Review may only change categories, tags and decisions.");
  }
  for (const key of ["duplicates", "relationships"] as const) {
    if (proposal[key].length !== old[key].length || proposal[key].some(item => !old[key].some(previous => previous.id === item.id && isDeepStrictEqual({ ...previous, decision: item.decision }, item)))) throw new WorkspaceError("INVALID_STATE", "Review cannot change suggestion references.");
  }
}
