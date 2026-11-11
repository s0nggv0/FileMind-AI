import "server-only";
import { database, persistenceConfigured } from "./database";
import { RecoveryService } from "../reliability/recovery";
import { WorkspaceOperations } from "../reliability/workspace-operations";
export function recoveryService() { return new RecoveryService(database, process.env.FILE_STORAGE_ROOT?.trim() || ".filemind/storage"); }
export function workspaceOperations() { return new WorkspaceOperations(recoveryService()); }

// Explicit entry-point barrier, after identity verification and before tenant IO.
// Do not cache this across requests or suppress operation-level/post-commit repair.
export async function recoverTenantBeforeAccess(userId: string | null) {
  if (userId && persistenceConfigured()) await recoveryService().recover(userId);
}
