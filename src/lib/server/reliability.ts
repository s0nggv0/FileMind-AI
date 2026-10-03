import "server-only";
import { database } from "./database";
import { RecoveryService } from "../reliability/recovery";
import { WorkspaceOperations } from "../reliability/workspace-operations";
export function recoveryService() { return new RecoveryService(database, process.env.FILE_STORAGE_ROOT?.trim() || ".filemind/storage"); }
export function workspaceOperations() { return new WorkspaceOperations(recoveryService()); }
