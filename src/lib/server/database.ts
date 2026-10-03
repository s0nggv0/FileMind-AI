import "server-only";
import { Pool } from "pg";
import { z } from "zod";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { storageFailure, type TransactionalTenantDatabase } from "@/lib/workspace/postgres-repository";
import { runTenantQuery, runTenantTransaction } from "@/lib/workspace/tenant-query";
import { createOperationLease } from "../../../scripts/operation-lease.mjs";

const shared = globalThis as typeof globalThis & { filemindPool?: Pool; filemindLockPool?: Pool };
export function persistenceConfigured() { return Boolean(process.env.DATABASE_URL?.trim()); }
function getPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new WorkspaceError("UNAVAILABLE", "PostgreSQL is not configured.", 503);
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error("Invalid connection");
  } catch { throw new WorkspaceError("UNAVAILABLE", "DATABASE_URL must identify a PostgreSQL database.", 503); }
  if (!shared.filemindPool) {
    shared.filemindPool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, statement_timeout: 45_000, query_timeout: 50_000, application_name: "filemind-ai" });
    shared.filemindPool.on("error", () => console.warn("FileMind database connection interrupted; the next request may retry."));
  }
  return shared.filemindPool;
}
export const database: TransactionalTenantDatabase = {
  async withOperationLock(key, work, tryOnly) {
    getPool();
    // A separate pool prevents lock-owning operations from exhausting the pool
    // needed to commit journal stages or business transactions.
    if (!shared.filemindLockPool) {
      shared.filemindLockPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, statement_timeout: 60_000, application_name: "filemind-operation-lock" });
      shared.filemindLockPool.on("error", () => console.warn("FileMind operation lease interrupted; recovery will verify its state."));
    }
    return createOperationLease(shared.filemindLockPool)(key, work, tryOnly);
  },
  async query(userId, sql, values) {
    z.uuid().parse(userId);
    const client = await getPool().connect().catch(error => { throw storageFailure(error); });
    return runTenantQuery(client, userId, sql, values);
  },
  async transaction(userId, work, consistentRead) {
    const client = await getPool().connect().catch(error => { throw storageFailure(error); });
    return runTenantTransaction(client, userId, work, consistentRead);
  },
};
