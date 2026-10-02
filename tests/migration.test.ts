import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { WorkspaceSnapshotSchema } from "../src/lib/workspace/schemas";
test("empty PostgreSQL migration, atomic persistence, revision conflicts and tenant isolation", async () => {
  const db = new PGlite();
  try {
    // Supabase supplies auth/storage schemas and roles; emulate those prerequisites only.
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid'; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await db.exec(await readFile("supabase/migrations/202610020001_phase4_workspace.sql", "utf8"));
    const user = crypto.randomUUID(); const attacker = crypto.randomUUID(); const id = crypto.randomUUID(); const docId = crypto.randomUUID(); const runId = crypto.randomUUID();
    await db.query("insert into profiles(id) values($1),($2)", [user, attacker]);
    const document = { id: docId, name: "notes.txt", type: "txt", mimeType: "text/plain", size: 5, parseStatus: "completed", metadata: { addedAt: new Date().toISOString() } };
    const proposal = { documents: [{ id: docId, document, originalName: "notes.txt", name: "notes.txt", category: "Study", tags: ["Notes"], summary: "Notes.", renameDecision: "pending" }], duplicates: [], relationships: [], simulation: true };
    const initial = WorkspaceSnapshotSchema.parse({ id, name: "Notes", revision: 0, documents: [], run: null, proposal: null, texts: {}, updatedAt: new Date().toISOString() });
    await db.query("insert into workspaces(id,user_id,name,snapshot) values($1,$2,$3,$4)", [id,user,"Notes",initial]);
    const review = WorkspaceSnapshotSchema.parse({ ...initial, documents: [document], texts: { [docId]: "notes" }, proposal, run: { id: runId, engine: "mock", status: "waiting_for_review", simulation: true, documents: [document], startedAt: Date.now(), progress: 100, steps: [], activity: [], result: proposal } });
    await db.query("select save_workspace($1,$2,$3)", [user,review,0]);
    assert.equal((await db.query<{ text_content: string }>("select text_content from documents where user_id=$1 and workspace_id=$2", [user,id])).rows[0].text_content, "notes");
    await assert.rejects(db.query("select save_workspace($1,$2,$3)", [user,review,0]), /revision_conflict/);
    await assert.rejects(db.query("select save_workspace($1,$2,$3)", [attacker,review,1]), /workspace_not_found/);
    const completed = { ...review, revision: 1, run: { ...review.run!, status: "completed", completedAt: Date.now() } };
    await db.query("select save_workspace($1,$2,$3)", [user,completed,1]);
    assert.equal((await db.query("select tag from document_tags")).rows.length, 1);
    assert.equal((await db.query<{ status: string }>("select status from organization_proposals")).rows[0].status, "applied");
    assert.equal((await db.query<{ public: boolean }>("select public from storage.buckets")).rows[0].public, false);
    await db.exec("set role anon"); await assert.rejects(db.query("select save_workspace($1,$2,$3)", [user,completed,2]), /permission denied/);
  } finally { await db.close(); }
});
