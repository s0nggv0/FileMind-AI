import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../scripts/migrate-database.mjs";
import { PostgresWorkspaceRepository, type TenantDatabase } from "../src/lib/workspace/postgres-repository";
import { runTenantQuery } from "../src/lib/workspace/tenant-query";
import { WorkspaceSnapshotSchema } from "../src/lib/workspace/schemas";
import { WorkspaceError } from "../src/lib/workspace/authorization";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("ordinary PostgreSQL migration and real repository preserve transactions, RLS and recovery", async () => {
  const db = new PGlite();
  try {
    const migrationClient = { async query(sql: string, values?: unknown[]) {
      if (values) return db.query(sql, values);
      return (await db.exec(sql)).at(-1)!;
    } };
    assert.equal((await applyMigrations(migrationClient)).length, 4);
    assert.deepEqual(await applyMigrations(migrationClient), []);
    assert.equal((await db.query("select schema_name from information_schema.schemata where schema_name in ('auth','storage')")).rows.length, 0);
    await db.exec(`create role filemind_test_user;
      grant usage,create on schema filemind to filemind_test_user;
      grant select,insert,update,delete on all tables in schema filemind to filemind_test_user;
      grant execute on function filemind.save_workspace(uuid,jsonb,integer) to filemind_test_user;
      do $$ declare tbl text; begin
        foreach tbl in array array['profiles','workspaces','documents','agent_runs','agent_steps','organization_proposals','document_tags','document_relations'] loop
          execute format('alter table filemind.%I owner to filemind_test_user',tbl);
        end loop;
      end $$;`);
    const tenant: TenantDatabase = { query: (user, sql, values) => runTenantQuery({
      async query(statement, parameters) {
        const result = await db.query(statement, parameters);
        if (statement === "begin") await db.exec("set local role filemind_test_user");
        return result;
      }, release() {},
    }, user, sql, values) };
    const repository = new PostgresWorkspaceRepository(tenant);
    const user = crypto.randomUUID(); const attacker = crypto.randomUUID(); const docId = crypto.randomUUID(); const runId = crypto.randomUUID();
    const initial = await repository.create(user, "Notes");
    const foreign = await repository.create(attacker, "Other project");
    const document = { id: docId, name: "notes.txt", type: "txt", mimeType: "text/plain", size: 5, parseStatus: "completed", metadata: { addedAt: new Date().toISOString() } };
    const proposal = { documents: [{ id: docId, document, originalName: "notes.txt", name: "notes.txt", category: "Study", tags: ["Notes"], summary: "Notes.", renameDecision: "pending" }], duplicates: [], relationships: [], simulation: true };
    const review = WorkspaceSnapshotSchema.parse({ ...initial, documents: [document], texts: { [docId]: "notes" }, proposal, run: { id: runId, engine: "mock", status: "waiting_for_review", simulation: true, documents: [document], startedAt: Date.now(), progress: 100, steps: [], activity: [], result: proposal } });
    const saved = await repository.save(user, review);
    assert.equal(saved.revision, 1);
    assert.equal((await repository.get(user, initial.id)).texts[docId], "notes");
    assert.equal((await repository.list(attacker)).length, 1);
    await assert.rejects(repository.get(attacker, initial.id), (error: unknown) => error instanceof WorkspaceError && error.status === 404);
    await assert.rejects(repository.save(user, review), (error: unknown) => error instanceof WorkspaceError && error.status === 409);
    await assert.rejects(repository.save(attacker, { ...review, revision: 1 }), (error: unknown) => error instanceof WorkspaceError && error.status === 404);
    const raw = await tenant.query(attacker, "select id from filemind.workspaces");
    assert.equal(raw.rows.length, 1); assert.deepEqual(raw.rows[0], { id: foreign.id });
    await assert.rejects(tenant.query(attacker, "select filemind.save_workspace($1,$2,$3)", [user, { ...review, revision: 1 }, 1]), /Workspace not found/);
    const foreignStep = crypto.randomUUID();
    const other = WorkspaceSnapshotSchema.parse({ ...foreign, run: { id: crypto.randomUUID(), engine: "mock", status: "running", simulation: true, startedAt: Date.now(), documents: [], activity: [], progress: 0, steps: [{ id: foreignStep, tool: "read_document", title: "Read", description: "Read", status: "completed", progress: 100, input: {} }] } });
    await repository.save(attacker, other);
    await assert.rejects(repository.save(user, { ...saved, run: { ...saved.run!, steps: other.run!.steps } }), /Workspace not found/);
    assert.equal((await repository.get(user, initial.id)).revision, 1);
    const foreignDocument = { ...saved.documents[0], id: crypto.randomUUID(), name: "foreign.txt" };
    await repository.save(attacker, { ...other, revision: 1, documents: [foreignDocument], texts: { [foreignDocument.id]: "private notes" }, run: null });
    await assert.rejects(repository.save(user, { ...saved, documents: [foreignDocument], texts: { [foreignDocument.id]: "overwrite" }, run: null, proposal: null }), /Workspace not found/);
    assert.equal((await repository.get(attacker, foreign.id)).texts[foreignDocument.id], "private notes");
    assert.equal((await repository.get(user, initial.id)).revision, 1);
    const completed = await repository.save(user, { ...saved, run: { ...saved.run!, status: "completed", completedAt: Date.now() } });
    assert.equal(completed.revision, 2);
    assert.equal((await repository.get(user, initial.id)).run!.status, "completed");
    assert.equal((await tenant.query(user, "select tag from filemind.document_tags")).rows.length, 1);
    assert.deepEqual((await tenant.query(user, "select status from filemind.organization_proposals")).rows[0], { status: "applied" });
    assert.deepEqual((await db.query("select nullif(current_setting('filemind.user_id',true),'') as actor")).rows[0], { actor: null });
    await db.exec("set role filemind_test_user");
    assert.equal((await db.query("select id from filemind.workspaces")).rows.length, 0);
    await assert.rejects(db.query("select filemind.save_workspace($1,$2,$3)", [user, completed, 2]), /workspace_not_found/);
    await db.exec("reset role");
    assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege('public','filemind.save_workspace(uuid,jsonb,integer)','execute') as allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});

test("migration history tolerates OS line endings and rejects changed applied SQL", async () => {
  const db = new PGlite(); const prefix = join(tmpdir(), "filemind-migration-test-"); const directory = await mkdtemp(prefix);
  try {
    const file = join(directory, "001_fixture.sql");
    const sql = "create table filemind.fixture(id integer);\n";
    await writeFile(file, sql.replaceAll("\n", "\r\n"));
    const client = { async query(statement: string, values?: unknown[]) {
      return values ? db.query(statement, values) : (await db.exec(statement)).at(-1)!;
    } };
    assert.deepEqual(await applyMigrations(client, directory), ["001_fixture.sql"]);
    await writeFile(file, sql); assert.deepEqual(await applyMigrations(client, directory), []);
    await writeFile(file, sql + "create table filemind.should_not_exist(id integer);\n");
    await assert.rejects(applyMigrations(client, directory), /Previously applied migration has changed/);
    assert.deepEqual((await db.query("select to_regclass('filemind.should_not_exist') as relation")).rows[0], { relation: null });
  } finally {
    await db.close(); assert.ok(resolve(directory).startsWith(resolve(prefix)));
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed transaction cleanup discards the connection and hides connection credentials", async () => {
  const statements: string[] = []; let discarded: Error | undefined;
  const client = { async query(sql: string) {
    statements.push(sql);
    if (sql === "select secret" || sql === "rollback") throw new Error("postgresql://private-password");
    return { rows: [] };
  }, release(error?: Error) { discarded = error; } };
  await assert.rejects(runTenantQuery(client, crypto.randomUUID(), "select secret"), (error: unknown) => error instanceof WorkspaceError && error.status === 503 && !error.message.includes("private-password"));
  assert.equal(statements.at(-1), "rollback"); assert.ok(discarded);
});
