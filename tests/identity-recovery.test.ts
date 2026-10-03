import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../scripts/migrate-database.mjs";
import { IdentityRecoveryService, recoveryDigest, RecoveryError, INVALID_RECOVERY_KEY } from "../src/lib/workspace/identity-recovery";
import { PostgresWorkspaceRepository, type TenantDatabase } from "../src/lib/workspace/postgres-repository";
import { runTenantQuery } from "../src/lib/workspace/tenant-query";
test("recovery stores only digest, restores old workspaces, rotates atomically and persists rate limits", async () => {
  const db = new PGlite();
  try {
    await applyMigrations({ query: async (s: string, p?: unknown[]) => p ? db.query(s, p) : (await db.exec(s)).at(-1)! });
    const tenant: TenantDatabase = { query: (u, s, p) => runTenantQuery({ query: (q, v) => db.query(q, v), release() {} }, u, s, p) };
    const service = new IdentityRecoveryService(tenant), repo = new PostgresWorkspaceRepository(tenant);
    const user = crypto.randomUUID(); const workspace = await repo.create(user, "Original knowledge");
    assert.equal((await service.status(user)).configured, false);
    const key = await service.create(user);
    assert.match(key, /^fm-recovery-v1-[A-Za-z0-9_-]{43}$/);
    const saved = (await db.query("select * from filemind.recovery_credentials")).rows;
    assert.ok(!JSON.stringify(saved).includes(key)); assert.ok(JSON.stringify(saved).includes(recoveryDigest(key)));
    assert.equal((await service.status(user)).configured, true);
    assert.equal((await repo.get(await service.recover(key), workspace.id)).name, "Original knowledge");
    await assert.rejects(service.recover("invalid"), e => e instanceof RecoveryError && e.message === INVALID_RECOVERY_KEY);
    const next = await service.create(user, true); assert.notEqual(next, key);
    await assert.rejects(service.recover(key), RecoveryError); assert.equal(await service.recover(next), user);
    for (let i = 0; i < 6; i++) await service.recover("bad").catch(() => {});
    await assert.rejects(new IdentityRecoveryService(tenant).recover(next), e => e instanceof RecoveryError && e.status === 429 && e.message === INVALID_RECOVERY_KEY);
    await db.exec("update filemind.recovery_attempts set window_start=now()-interval '16 minutes'");
    assert.equal(await service.recover(next), user);
  } finally { await db.close(); }
});
