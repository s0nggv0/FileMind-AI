import { z } from "zod";
import { storageFailure } from "./postgres-repository";
import type { TransactionQuery } from "./postgres-repository";
export interface TenantQueryClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(error?: Error): void;
}
export async function runTenantQuery(client: TenantQueryClient, userId: string, sql: string, values?: unknown[]) {
  return runTenantTransaction(client, userId, tx => tx.query(sql, values));
}
export async function runTenantTransaction<T>(client: TenantQueryClient, userId: string, work: (tx: TransactionQuery) => Promise<T>, consistentRead = false) {
  let begun = false; let discarded: Error | undefined;
  try {
    z.uuid().parse(userId);
    await client.query(consistentRead ? "begin isolation level repeatable read" : "begin"); begun = true;
    await client.query("select set_config('filemind.user_id',$1,true)", [userId]);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    if (begun) {
      try { await client.query("rollback"); }
      catch { discarded = new Error("Database transaction cleanup failed"); }
    }
    throw storageFailure(error);
  } finally { client.release(discarded); }
}
