import { z } from "zod";
import { storageFailure } from "./postgres-repository";
export interface TenantQueryClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(error?: Error): void;
}
export async function runTenantQuery(client: TenantQueryClient, userId: string, sql: string, values?: unknown[]) {
  let begun = false; let discarded: Error | undefined;
  try {
    z.uuid().parse(userId);
    await client.query("begin"); begun = true;
    await client.query("select set_config('filemind.user_id',$1,true)", [userId]);
    const result = await client.query(sql, values);
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
