import "server-only";
import { Pool } from "pg";
import { z } from "zod";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { storageFailure, type TenantDatabase } from "@/lib/workspace/postgres-repository";
import { runTenantQuery } from "@/lib/workspace/tenant-query";

const shared = globalThis as typeof globalThis & { filemindPool?: Pool };
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
export const database: TenantDatabase = {
  async query(userId, sql, values) {
    z.uuid().parse(userId);
    const client = await getPool().connect().catch(error => { throw storageFailure(error); });
    return runTenantQuery(client, userId, sql, values);
  },
};
