import type { Pool } from "pg";
import type { RecoveryLease } from "./storage-recovery.mjs";
export function createOperationLease(pool: Pool): RecoveryLease;
