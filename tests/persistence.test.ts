import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseTimestampSchema, WorkspaceSnapshotSchema, OrganizationProposalSchema, recoverSnapshot, type WorkspaceSnapshot } from "../src/lib/workspace/schemas";
import { authorizeWorkspace, validateReview } from "../src/lib/workspace/authorization";
import type { AgentRun } from "../src/types/workspace";
const id = crypto.randomUUID(); const documentId = crypto.randomUUID();
const document = { id: documentId, name: "notes.txt", type: "txt" as const, mimeType: "text/plain", size: 5, parseStatus: "completed" as const, metadata: { addedAt: new Date().toISOString() } };
const proposal = { documents: [{ id: documentId, document, originalName: "notes.txt", name: "notes.txt", category: "Study", tags: ["Notes"], summary: "Some notes.", renameDecision: "pending" as const }], duplicates: [], relationships: [], simulation: true };
function snapshot(status: AgentRun["status"] = "waiting_for_review"): WorkspaceSnapshot {
  return WorkspaceSnapshotSchema.parse({ id, name: "Test", revision: 0, updatedAt: new Date().toISOString(), documents: [document], texts: { [documentId]: "notes" }, proposal, run: { id: crypto.randomUUID(), status, simulation: true, startedAt: Date.now(), documents: [document], steps: [], activity: [], progress: 100, result: proposal } });
}
test("snapshot rejects foreign IDs, oversize text and invalid proposals", () => {
  assert.throws(() => WorkspaceSnapshotSchema.parse({ ...snapshot(), texts: { [crypto.randomUUID()]: "foreign" } }));
  assert.throws(() => WorkspaceSnapshotSchema.parse({ ...snapshot(), texts: { [documentId]: "x".repeat(250001) } }));
  assert.throws(() => OrganizationProposalSchema.parse({ ...proposal, relationships: [{ id: "bad", source: documentId, target: crypto.randomUUID(), reason: "Foreign", decision: "pending" }] }));
});
test("review and completed refresh preserve decisions; running refresh is interrupted", () => {
  for (const status of ["waiting_for_review", "completed"] as const) { const value = snapshot(status); assert.deepEqual(recoverSnapshot(value), value); }
});
test("interrupted recovery is explicit and does not mutate stored state", () => {
  for (const status of ["planning", "running", "applying"] as const) {
    const original = snapshot(status); const restored = recoverSnapshot(original);
    assert.equal(restored.run?.status, "failed"); assert.equal(restored.run?.interrupted, true); assert.equal(original.run?.status, status);
  }
});
test("authorization hides foreign workspace and review cannot forge references or names", () => {
  assert.throws(() => authorizeWorkspace("owner", "attacker"), /not found/);
  authorizeWorkspace("owner", "owner");
  const state = snapshot(); const edited = structuredClone(proposal); edited.documents[0].category = "Research"; validateReview(state, edited);
  edited.documents[0].originalName = "forged.txt"; assert.throws(() => validateReview(state, edited));
  assert.throws(() => validateReview(snapshot("completed"), proposal));
});
test("PostgreSQL timestamp offsets normalize before domain snapshot validation", () => {
  assert.equal(DatabaseTimestampSchema.parse("2026-10-02T12:30:00+08:00"), "2026-10-02T04:30:00.000Z");
  assert.equal(DatabaseTimestampSchema.parse("2026-10-02T04:30:00+00:00"), "2026-10-02T04:30:00.000Z");
  const value = snapshot(); WorkspaceSnapshotSchema.parse({ ...value, updatedAt: DatabaseTimestampSchema.parse("2026-10-02T04:30:00+00:00") });
});
