import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "../src/lib/workspace/schemas";
import { WorkspaceError } from "../src/lib/workspace/authorization";
import { applyWorkspacePlan, prepareMockWorkspaceSave, resumeWorkspace, reviewWorkspace } from "../src/lib/workspace/workspace-updates";
import type { AgentRun } from "../src/types/workspace";
import type { TransactionalTenantDatabase } from "../src/lib/workspace/postgres-repository";
import { isolatedKnowledge } from "./helpers/isolated-knowledge";
import { PersistenceClient } from "../src/features/workspace/services/persistence-client";

function fixture(status: AgentRun["status"] = "waiting_for_review", engine: "mock" | "llm" = "mock"): WorkspaceSnapshot {
  const documents = Array.from({ length: 3 }, (_, i) => ({ id: crypto.randomUUID(), name: `untitled${i}.txt`,
    type: "txt", mimeType: "text/plain", size: 5, parseStatus: "completed", metadata: { addedAt: "2026-10-01T00:00:00.000Z" } }));
  const proposal = { documents: documents.map(d => ({ id: d.id, document: d, originalName: d.name, name: d.name,
    suggestedName: "../../final?.md", category: "Study", tags: ["Original"], summary: "Synthetic server summary", renameDecision: "pending" })),
    duplicates: [{ id: "duplicate", documentIds: documents.slice(0, 2).map(d => d.id), reason: "Synthetic reason", decision: "pending", kind: "name" }],
    relationships: ["pending", "accepted", "ignored"].map((decision, i) => ({ id: `edge-${i}`, source: documents[i].id, target: documents[(i + 1) % 3].id, reason: "Synthetic relation", decision })), simulation: true };
  return WorkspaceSnapshotSchema.parse({ id: crypto.randomUUID(), name: "Synthetic workspace", revision: 3,
    documents, texts: Object.fromEntries(documents.map(d => [d.id, "notes"])), proposal, updatedAt: "2026-10-01T00:00:00.000Z",
    run: { id: crypto.randomUUID(), engine, status, simulation: engine === "mock", startedAt: 100,
      documents, steps: [], activity: [], progress: 100, result: structuredClone(proposal) } });
}
function unchanged<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) unchanged(child); }
  return value;
}
const errorIs = (status: number, code: WorkspaceError["code"]) => (error: unknown) => error instanceof WorkspaceError && error.status === status && error.code === code;

test("mock saves preserve originals, reject server-owned runs and version mismatches", () => {
  const current = unchanged(fixture("running")), next = structuredClone(current);
  next.run!.progress = 60;
  assert.equal(prepareMockWorkspaceSave(current, unchanged(next)).run!.progress, 60);
  assert.equal(current.run!.progress, 100);
  for (const change of [(s: WorkspaceSnapshot) => { s.id = crypto.randomUUID(); }, (s: WorkspaceSnapshot) => { s.revision--; }]) {
    const invalid = structuredClone(next); change(invalid);
    assert.throws(() => prepareMockWorkspaceSave(current, invalid), errorIs(409, "CONFLICT"));
  }
  for (const field of ["name", "type", "size", "mimeType"] as const) {
    const invalid = structuredClone(next);
    Object.assign(invalid.documents[0], { [field]: field === "size" ? 6 : field === "type" ? "md" : "changed" });
    assert.throws(() => prepareMockWorkspaceSave(current, invalid), errorIs(400, "INVALID_STATE"));
  }
  for (const change of [(s: WorkspaceSnapshot) => { s.documents.pop(); }, (s: WorkspaceSnapshot) => { s.documents[0].id = crypto.randomUUID(); }, (s: WorkspaceSnapshot) => { s.documents[0].storagePath = "synthetic/forged.txt"; }]) {
    const invalid = structuredClone(next); change(invalid);
    assert.throws(() => prepareMockWorkspaceSave(current, invalid), errorIs(400, "INVALID_STATE"));
  }
  const llm = fixture("running", "llm");
  assert.throws(() => prepareMockWorkspaceSave(llm, { ...llm, run: null }), errorIs(403, "INVALID_STATE"));
  assert.throws(() => prepareMockWorkspaceSave(current, { ...next, run: { ...next.run!, engine: "llm" } }), errorIs(403, "INVALID_STATE"));
});

test("mock completion keeps legacy accepted-edge behavior and completed-run protection", () => {
  const current = unchanged(fixture()), next = structuredClone(current); next.run!.status = "completed";
  const saved = prepareMockWorkspaceSave(current, unchanged(next));
  assert.deepEqual(saved.proposal!.relationships.map(r => r.id), ["edge-1"]);
  assert.deepEqual(saved.run!.result, saved.proposal); assert.notEqual(saved.run!.result, saved.proposal);
  assert.throws(() => prepareMockWorkspaceSave(saved, saved), errorIs(409, "INVALID_STATE"));
  // Existing mock PUT permits replacement runs and the initial document save;
  // extraction must not invent a narrower mock progress-transition matrix.
  const restarted = { ...saved, run: { ...saved.run!, id: crypto.randomUUID(), status: "planning" as const } };
  assert.equal(prepareMockWorkspaceSave(saved, restarted).run!.status, "planning");
  const empty = { ...current, run: null, proposal: null, documents: [], texts: {} };
  assert.equal(prepareMockWorkspaceSave(empty, current).documents.length, 3);
});

test("resume clears only retryable runs and keeps source documents/texts/version unchanged", () => {
  for (const status of ["running", "planning", "failed", "cancelled"] as const) for (const engine of ["mock", "llm"] as const) {
    const current = unchanged(fixture(status, engine)), next = resumeWorkspace(current, current.revision);
    assert.equal(next.run, null); assert.equal(next.proposal, null);
    assert.deepEqual(next.documents, current.documents); assert.deepEqual(next.texts, current.texts);
    assert.equal(next.revision, current.revision); assert.equal(current.run!.status, status);
  }
  for (const status of ["idle", "waiting_for_review", "applying", "completed"] as const) {
    const current = fixture(status); assert.throws(() => resumeWorkspace(current, current.revision), errorIs(409, "INVALID_STATE"));
  }
  const current = fixture();
  assert.throws(() => resumeWorkspace({ ...current, run: null }, current.revision), errorIs(409, "INVALID_STATE"));
  assert.throws(() => resumeWorkspace(current, current.revision - 1), errorIs(409, "CONFLICT"));
});

test("review retains server analysis and references while permitting categories, tags and decisions", () => {
  const current = unchanged(fixture("waiting_for_review", "llm")), proposal = structuredClone(current.proposal!);
  proposal.documents[0].category = "Research"; proposal.documents[0].tags = ["Latest"];
  proposal.duplicates[0].decision = "ignored"; proposal.relationships[0].decision = "accepted";
  const reviewed = reviewWorkspace(current, current.revision, unchanged(proposal));
  assert.deepEqual(reviewed.proposal, proposal); assert.deepEqual(reviewed.run, current.run);
  assert.notEqual(reviewed.proposal, proposal);
  for (const field of ["originalName", "suggestedName", "summary"] as const) {
    const forged = structuredClone(proposal); forged.documents[0][field] = "forged";
    assert.throws(() => reviewWorkspace(current, current.revision, forged), errorIs(400, "INVALID_STATE"));
  }
  const forged = structuredClone(proposal); forged.documents[0].document.size++;
  assert.throws(() => reviewWorkspace(current, current.revision, forged), errorIs(400, "INVALID_STATE"));
  const references = structuredClone(proposal); references.relationships[0].target = references.relationships[0].source;
  assert.throws(() => reviewWorkspace(current, current.revision, references), errorIs(400, "INVALID_STATE"));
});

test("apply uses the last submitted edit, sanitizes names and leaves input snapshots untouched", () => {
  const current = unchanged(fixture("waiting_for_review", "llm"));
  const earlier = structuredClone(current.proposal!); earlier.documents[0].category = "Earlier review";
  const reviewed = unchanged(reviewWorkspace(current, current.revision, earlier));
  const latest = structuredClone(earlier); latest.documents[0].category = "Final edit";
  latest.documents[0].tags = ["Final"]; latest.documents[0].renameDecision = "accepted";
  latest.documents[0].name = "untrusted client display name";
  latest.relationships[0].decision = "accepted"; latest.relationships[1].decision = "ignored";
  latest.duplicates[0].decision = "accepted";
  const applied = applyWorkspacePlan(reviewed, reviewed.revision, unchanged(latest), 1234);
  assert.equal(applied.run!.status, "completed"); assert.equal(applied.run!.completedAt, 1234);
  assert.equal(applied.run!.engine, "llm"); assert.equal(applied.revision, current.revision);
  assert.equal(applied.proposal!.documents[0].category, "Final edit");
  assert.deepEqual(applied.proposal!.documents[0].tags, ["Final"]);
  assert.equal(applied.proposal!.documents[0].name, "final-.txt");
  assert.equal(applied.proposal!.documents[1].name, current.documents[1].name);
  assert.deepEqual(applied.proposal!.relationships.map(r => r.id), ["edge-0"]);
  assert.equal(applied.proposal!.duplicates[0].decision, "accepted");
  assert.deepEqual(applied.run!.result, applied.proposal); assert.notEqual(applied.run!.result, applied.proposal);
  assert.deepEqual(applied.documents, current.documents); assert.deepEqual(applied.texts, current.texts);
  assert.equal(reviewed.proposal!.documents[0].category, "Earlier review");
});

test("review/apply reject missing plans, stale revisions and non-reviewable states", () => {
  for (const transform of [reviewWorkspace, applyWorkspacePlan]) {
    const current = fixture();
    assert.throws(() => transform(current, current.revision, undefined), errorIs(400, "INVALID_STATE"));
    assert.throws(() => transform(current, current.revision - 1, undefined), errorIs(409, "CONFLICT"));
    for (const status of ["idle", "planning", "running", "applying", "completed", "failed", "cancelled"] as const) {
      const invalid = fixture(status);
      assert.throws(() => transform(invalid, invalid.revision, invalid.proposal!), errorIs(409, "INVALID_STATE"));
    }
    assert.throws(() => transform({ ...current, proposal: null }, current.revision, current.proposal!), errorIs(409, "INVALID_STATE"));
  }
});

test("HTTP updates preserve ownership, errors, last edits and atomic revision/journal saves", async t => {
  const f = await isolatedKnowledge(), storageRoot = await mkdtemp(join(tmpdir(), "filemind-update-test-"));
  const require = createRequire(import.meta.url), replaced: [string, NodeJS.Module | undefined][] = [];
  const previousOrigin = process.env.WORKSPACE_ORIGIN; process.env.WORKSPACE_ORIGIN = "http://synthetic.local";
  const user = crypto.randomUUID(), foreign = crypto.randomUUID(); let activeUser: string | null = user;
  let raceAfterRead = false, failJournalCommit = false;
  const indexed: unknown[] = [];
  function substitute(id: string, exports: unknown) {
    const filename = require.resolve(id); replaced.push([filename, require.cache[filename]]);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as NodeJS.Module;
  }
  const tenant: TransactionalTenantDatabase = { query: f.tenant.query, transaction: (owner, work, read) => f.tenant.transaction(owner, tx => work({ query: async (sql, values) => {
    if (failJournalCommit && sql.includes("set status='committed'")) throw new Error("Synthetic journal failure");
    return tx.query(sql, values);
  } }), read) };
  substitute("server-only", {});
  substitute("../src/lib/reliability/application-log", { applicationLog: async () => {} });
  const { RecoveryService } = require("../src/lib/reliability/recovery") as typeof import("../src/lib/reliability/recovery");
  const { WorkspaceOperations } = require("../src/lib/reliability/workspace-operations") as typeof import("../src/lib/reliability/workspace-operations");
  const recovery = new RecoveryService(tenant, storageRoot), operations = new WorkspaceOperations(recovery);
  substitute("../src/lib/server/identity", { getUserId: async () => activeUser });
  substitute("../src/lib/server/knowledge", { scheduleKnowledgeIndex: async (input: unknown) => { indexed.push(input); } });
  substitute("../src/lib/server/reliability", { workspaceOperations: () => operations, recoverTenantBeforeAccess: async (owner: string | null) => { if (owner) await recovery.recover(owner); } });
  substitute("../src/lib/server/workspace-repository", { workspaceRepository: { ...f.workspaces, save: f.workspaces.save.bind(f.workspaces), get: async (owner: string, id: string) => {
    const snapshot = await f.workspaces.get(owner, id);
    if (raceAfterRead) { raceAfterRead = false; await f.workspaces.save(owner, snapshot); }
    return snapshot;
  } } });
  const route = require("../src/app/api/workspaces/[id]/route") as typeof import("../src/app/api/workspaces/[id]/route");
  async function seed(engine: "mock" | "llm" = "mock", status: AgentRun["status"] = "waiting_for_review") {
    const initial = await f.workspaces.create(user, "Synthetic HTTP workspace");
    return f.workspaces.save(user, { ...fixture(status, engine), id: initial.id, revision: initial.revision });
  }
  async function request(method: "PUT" | "PATCH", snapshot: WorkspaceSnapshot, body: unknown, origin = "http://synthetic.local") {
    return route[method](new Request(`http://synthetic.local/api/workspaces/${snapshot.id}`, {
      method, headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: snapshot.id }) });
  }
  async function expectError(response: Response, status: number, code: string, message: string) {
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { code, error: message });
  }
  try {
    await t.test("HTTP guard and parsing errors keep their exact status and body", async () => {
      const snapshot = await seed("llm");
      await expectError(await request("PUT", snapshot, snapshot), 403, "INVALID_STATE", "AI 整理记录由服务器保存。");
      await expectError(await request("PATCH", snapshot, { action: "review", revision: 0 }), 409, "CONFLICT", "工作区已更新，请刷新后再保存。");
      await expectError(await request("PATCH", snapshot, { action: "review", revision: snapshot.revision }), 400, "INVALID_STATE", "缺少整理方案。");
      await expectError(await request("PATCH", snapshot, { action: "unknown" }), 400, "VALIDATION", "Invalid request data.");
      activeUser = foreign;
      await expectError(await request("PATCH", snapshot, { action: "apply", revision: snapshot.revision, proposal: snapshot.proposal }), 404, "NOT_FOUND", "Workspace not found.");
      activeUser = null;
      await expectError(await request("PUT", snapshot, snapshot), 404, "NOT_FOUND", "工作区不存在或无法访问。");
      activeUser = user;
      const blocked = await request("PATCH", snapshot, {}, "http://foreign.invalid"); assert.equal(blocked.status, 403);
    });

    await t.test("mock PUT and resume retain their HTTP contracts", async () => {
      const snapshot = await seed("mock", "running"), changed = structuredClone(snapshot); changed.documents[0].name = "forged.txt";
      await expectError(await request("PUT", snapshot, changed), 400, "INVALID_STATE", "原文件信息不能修改。");
      const saved = await request("PUT", snapshot, { ...snapshot, run: { ...snapshot.run!, progress: 42 } });
      assert.equal(saved.status, 200); const next = WorkspaceSnapshotSchema.parse(await saved.json());
      assert.equal(next.revision, snapshot.revision + 1); assert.equal(next.run!.progress, 42);
      const resumed = await request("PATCH", next, { action: "resume", revision: next.revision });
      assert.equal(resumed.status, 200); const draft = WorkspaceSnapshotSchema.parse(await resumed.json());
      assert.equal(draft.run, null); assert.equal(draft.proposal, null); assert.equal(draft.revision, next.revision + 1);
      assert.deepEqual(draft.texts, snapshot.texts); assert.equal(indexed.length, 0);
    });

    await t.test("apply atomically saves final review, tags, name, edges and journal with one revision increment", async () => {
      const snapshot = await seed("llm"), earlier = structuredClone(snapshot.proposal!); earlier.documents[0].category = "Earlier";
      const response = await request("PATCH", snapshot, { action: "review", revision: snapshot.revision, proposal: earlier });
      assert.equal(response.status, 200); const reviewed = WorkspaceSnapshotSchema.parse(await response.json());
      const latest = structuredClone(earlier); latest.documents[0].category = "Final"; latest.documents[0].tags = ["Last edit"];
      latest.documents[0].renameDecision = "accepted"; latest.relationships[0].decision = "accepted"; latest.relationships[1].decision = "ignored";
      const applied = await request("PATCH", reviewed, { action: "apply", revision: reviewed.revision, proposal: latest });
      assert.equal(applied.status, 200); const saved = WorkspaceSnapshotSchema.parse(await applied.json());
      assert.equal(saved.revision, reviewed.revision + 1); assert.equal(saved.run!.status, "completed");
      assert.equal(saved.run!.result!.documents[0].category, "Final");
      const restored = await f.workspaces.get(user, saved.id); assert.deepEqual(restored.run!.result, saved.run!.result);
      const rows = await tenant.query(user, "select display_name,category,summary from filemind.documents where user_id=$1 and id=$2", [user, saved.documents[0].id]);
      assert.deepEqual(rows.rows[0], { display_name: "final-.txt", category: "Final", summary: "Synthetic server summary" });
      assert.deepEqual((await tenant.query(user, "select tag from filemind.document_tags where user_id=$1 and document_id=$2", [user, saved.documents[0].id])).rows, [{ tag: "Last edit" }]);
      assert.equal((await tenant.query(user, "select id from filemind.document_relations where user_id=$1 and workspace_id=$2", [user, saved.id])).rows.length, 1);
      assert.equal((await recovery.journal.recent(user)).find(row => row.resource_id === saved.id)!.status, "committed");
      assert.deepEqual(indexed, [{ userId: user, workspaceId: saved.id }]);
      await expectError(await request("PATCH", saved, { action: "apply", revision: saved.revision, proposal: latest }), 409, "INVALID_STATE", "Workspace is not ready for review.");
    });

    await t.test("queued autosave followed immediately by apply uses the last edit and returned revision", async queueTest => {
      const snapshot = await seed("llm"), client = new PersistenceClient();
      client.persistent = true; client.snapshot = snapshot;
      const earlier = structuredClone(snapshot.proposal!), latest = structuredClone(earlier);
      earlier.documents[0].category = "Autosave"; latest.documents[0].category = "Latest queued edit";
      const revisions: number[] = [];
      queueTest.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string); revisions.push(body.revision);
        return request(init.method as "PATCH", snapshot, body);
      });
      await Promise.all([client.saveProposal(earlier), client.apply(latest)]);
      assert.deepEqual(revisions, [snapshot.revision, snapshot.revision + 1]);
      assert.equal(client.snapshot!.revision, snapshot.revision + 2);
      assert.equal(client.snapshot!.run!.result!.documents[0].category, "Latest queued edit");
      const restored = await f.workspaces.get(user, snapshot.id);
      assert.equal(restored.proposal!.documents[0].category, "Latest queued edit");
      assert.equal(restored.run!.status, "completed");
    });

    await t.test("database revision races and journal failures cannot partially apply a proposal", async () => {
      let snapshot = await seed("llm"); const count = indexed.length;
      raceAfterRead = true;
      await expectError(await request("PATCH", snapshot, { action: "apply", revision: snapshot.revision, proposal: snapshot.proposal }), 409, "CONFLICT", "Workspace changed in another tab. Reload to recover the latest version.");
      snapshot = await f.workspaces.get(user, snapshot.id); assert.equal(snapshot.run!.status, "waiting_for_review");
      const revision = snapshot.revision;
      failJournalCommit = true;
      try {
        await expectError(await request("PATCH", snapshot, { action: "apply", revision, proposal: snapshot.proposal }), 503, "UNAVAILABLE", "Workspace storage is temporarily unavailable.");
      } finally { failJournalCommit = false; }
      const restored = await f.workspaces.get(user, snapshot.id);
      assert.equal(restored.revision, revision); assert.equal(restored.run!.status, "waiting_for_review");
      assert.equal((await tenant.query(user, "select tag from filemind.document_tags where user_id=$1 and workspace_id=$2", [user, snapshot.id])).rows.length, 0);
      const journal = (await recovery.journal.recent(user)).filter(row => row.resource_id === snapshot.id);
      assert.equal(journal.length, 2); assert.ok(journal.every(row => row.status === "rolled_back"));
      assert.equal(indexed.length, count);
    });
  } finally {
    if (previousOrigin === undefined) delete process.env.WORKSPACE_ORIGIN; else process.env.WORKSPACE_ORIGIN = previousOrigin;
    for (const [filename, previous] of replaced.reverse()) { if (previous) require.cache[filename] = previous; else delete require.cache[filename]; }
    await f.db.close();
    const inside = relative(tmpdir(), storageRoot); assert.ok(!isAbsolute(inside) && /^filemind-update-test-[\w-]+$/.test(inside));
    await rm(storageRoot, { recursive: true, force: true });
  }
});
