import { Pool } from "pg";
import { runTenantQuery, runTenantTransaction } from "../src/lib/workspace/tenant-query";
import type { TransactionalTenantDatabase } from "../src/lib/workspace/postgres-repository";
import { createOperationLease } from "./operation-lease.mjs";
export function evaluationDatabase(pool: Pool, connectionString: string|undefined) {
  const leases=new Pool({connectionString,max:2,connectionTimeoutMillis:5000,statement_timeout:60000});
  leases.on("error",()=>{});
  const db:TransactionalTenantDatabase={query:async(u,s,v)=>runTenantQuery(await pool.connect(),u,s,v),transaction:async(u,w,r)=>runTenantTransaction(await pool.connect(),u,w,r),withOperationLock:createOperationLease(leases)};
  return {db,closeLeases:()=>leases.end()};
}
