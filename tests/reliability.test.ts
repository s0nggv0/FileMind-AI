import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../scripts/migrate-database.mjs";
import { runTenantQuery, runTenantTransaction } from "../src/lib/workspace/tenant-query";
import type { TransactionalTenantDatabase } from "../src/lib/workspace/postgres-repository";
import { OperationJournal, OperationPayloadSchema } from "../src/lib/reliability/operation-journal";
import { atomicWriteFile } from "../src/lib/reliability/atomic-file";
import { PrivateFileStorage } from "../src/lib/workspace/private-file-storage";

test("atomic file publication syncs and closes before rename; ENOSPC preserves the complete old file", async () => {
  const root = await mkdtemp(join(tmpdir(), "filemind-atomic-"));
  try {
    const target = join(root, "record.json"); await atomicWriteFile(target, Buffer.from("old"));
    const stages: string[] = [];
    await assert.rejects(atomicWriteFile(target, Buffer.from("new"), { checkpoint: async stage => {
      stages.push(stage); assert.equal((await readFile(target)).toString(), "old");
      if (stage === "before_publish") throw Object.assign(new Error("Simulated disk full"), { code: "ENOSPC" });
    } }), { code: "ENOSPC" });
    assert.deepEqual(stages, ["written", "synced", "closed", "before_publish"]);
    assert.equal((await readFile(target)).toString(), "old"); assert.deepEqual(await readdir(root), ["record.json"]);
    await atomicWriteFile(target, Buffer.from("complete new")); assert.equal((await readFile(target)).toString(), "complete new");
    const storage = new PrivateFileStorage(join(root, "storage"));
    const input = { userId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), documentId: crypto.randomUUID(), extension: "txt", bytes: Buffer.from("first") };
    const concurrent = await Promise.allSettled([storage.putOriginal(input), storage.putOriginal({ ...input, bytes: Buffer.from("other") })]);
    assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(r => r.status === "rejected").length, 1);
    const winningPayload = concurrent[0].status === "fulfilled" ? "first" : "other";
    assert.equal((await storage.readOriginal(input)).toString(), winningPayload);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + "/") || resolve(root).startsWith(resolve(tmpdir()) + "\\"));
    await rm(root, { recursive: true, force: true });
  }
});

test("operation journal and business commit share a transaction; rollback survives failure and FORCE RLS isolates owners", async () => {
  const db = new PGlite();
  try {
    await applyMigrations({ query: async (s: string, p?: unknown[]) => p ? db.query(s, p) : (await db.exec(s)).at(-1)! });
    await db.exec("create role reliability_tenant; grant usage on schema filemind to reliability_tenant; grant select,insert,update,delete on all tables in schema filemind to reliability_tenant;");
    const client = () => ({ query: async (s: string, p?: unknown[]) => { const r = await db.query(s, p); if (s.startsWith("begin")) await db.exec("set local role reliability_tenant"); return r; }, release() {} });
    const tenant: TransactionalTenantDatabase = { query: (u,s,p) => runTenantQuery(client(),u,s,p), transaction: (u,work,read) => runTenantTransaction(client(),u,work,read) };
    const journal = new OperationJournal(tenant), user = crypto.randomUUID(), foreign = crypto.randomUUID(), resource = crypto.randomUUID();
    let operationId = "";
    await journal.run(user, "workspace_apply", resource, { expectedRevision: 0 }, async op => {
      operationId = op.id;
      assert.equal((await journal.get(user, op.id))?.status, "running");
      await op.stage("reviewed", { workspaceId: resource });
      await tenant.transaction(user, async tx => { await op.commit(tx); });
      return true;
    });
    assert.equal((await journal.get(user, operationId))?.status, "committed");
    assert.equal(await journal.get(foreign, operationId), null);
    assert.equal((await journal.recent(foreign)).length, 0);
    let rollbackId = "", cleanup = false;
    await assert.rejects(journal.run(user, "backup_import", null, { stagingId: crypto.randomUUID() }, async op => {
      rollbackId = op.id;
      await tenant.transaction(user, async tx => { await op.commit(tx); throw new Error("Injected transaction failure"); });
    }, async row => { assert.equal(row.status, "running"); cleanup = true; }));
    assert.equal(cleanup, true); assert.equal((await journal.get(user, rollbackId))?.status, "rolled_back");
    const lostLease = new AbortController();
    tenant.withOperationLock = async (_key, work) => work(lostLease.signal);
    let lostId = "";
    await assert.rejects(journal.run(user, "file_delete", resource, {}, async op => {
      lostId = op.id; lostLease.abort(new Error("Simulated lease connection loss"));
      await tenant.transaction(user, tx => op.commit(tx));
    }));
    assert.equal((await journal.get(user, lostId))?.status, "rolled_back");
    const raw = (await db.query<{ payload: unknown }>("select payload from filemind.operation_journal where id=$1", [rollbackId])).rows[0];
    assert.equal(JSON.stringify(raw.payload).includes("Injected"), false);
    assert.equal(OperationPayloadSchema.safeParse({ apiKey: "secret" }).success, false);
    assert.equal(OperationPayloadSchema.safeParse({ files: [{ documentId: resource, workspaceId: resource, extension: "../txt", hash: "a".repeat(64), newlyPublished: true }] }).success, false);
  } finally { await db.close(); }
});
