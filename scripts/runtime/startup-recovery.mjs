import { createOperationLease } from "./operation-lease.mjs";
import { recoverTenantOperations } from "./storage-recovery.mjs";

export async function startupRecovery(owners, Pool, connectionString, storageRoot) {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 45000 });
  const leases = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 60000 });
  // Native startup has no Web server yet; these fixed messages contain no
  // provider keys, credentials, paths or tenant content.
  pool.on("error", () => {}); leases.on("error", () => {});
  const query = async (userId, sql, parameters) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('filemind.user_id',$1,true)", [userId]);
      const result = await client.query(sql, parameters);
      await client.query("commit"); return result;
    } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
    finally { client.release(); }
  };
  const total = { recovered: 0, active: 0 };
  try {
    for (const userId of owners) {
      const result = await recoverTenantOperations(query, createOperationLease(leases), userId, { storageRoot });
      total.recovered += result.recovered; total.active += result.active;
    }
    return total;
  } finally { await Promise.all([pool.end(), leases.end()]); }
}
