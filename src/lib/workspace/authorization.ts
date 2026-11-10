import type { OrganizationPlan } from "@/types/workspace";
import type { WorkspaceSnapshot } from "./schemas";
import { isDeepStrictEqual } from "node:util";

export class WorkspaceError extends Error {
  constructor(public code: "NOT_FOUND" | "CONFLICT" | "INVALID_STATE" | "UNAVAILABLE", message: string, public status = 400) { super(message); }
}
export function authorizeWorkspace(owner: string, userId: string) {
  if (owner !== userId) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
}
export function validateWorkspaceRevision(snapshot: WorkspaceSnapshot, revision: number, id = snapshot.id) {
  if (id !== snapshot.id || revision !== snapshot.revision) throw new WorkspaceError("CONFLICT", "工作区已更新，请刷新后再保存。", 409);
}
export function validateMockSave(snapshot: WorkspaceSnapshot, next: WorkspaceSnapshot) {
  validateWorkspaceRevision(snapshot, next.revision, next.id);
  // Browser snapshots are only permitted for mock runs. LLM results are server-owned.
  if (next.run?.engine === "llm" || snapshot.run?.engine === "llm") throw new WorkspaceError("INVALID_STATE", "AI 整理记录由服务器保存。", 403);
  if (snapshot.run?.status === "completed" && next.run?.id === snapshot.run.id) throw new WorkspaceError("INVALID_STATE", "已完成的整理记录不能修改。", 409);
  if (snapshot.documents.length && (snapshot.documents.length !== next.documents.length || snapshot.documents.some(d => !next.documents.some(item => item.id === d.id)))) throw new WorkspaceError("INVALID_STATE", "已保存资料的标识不能修改。");
  if (next.documents.some(d => { const old = snapshot.documents.find(p => p.id === d.id); return old && (old.name !== d.name || old.type !== d.type || old.size !== d.size || old.mimeType !== d.mimeType); })) throw new WorkspaceError("INVALID_STATE", "原文件信息不能修改。");
  if (next.documents.some(d => d.storagePath && d.storagePath !== snapshot.documents.find(p => p.id === d.id)?.storagePath)) throw new WorkspaceError("INVALID_STATE", "文件存储位置由服务器管理。");
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
