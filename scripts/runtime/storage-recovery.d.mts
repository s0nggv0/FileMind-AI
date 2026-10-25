export interface TenantRecoveryQuery { (userId: string, sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
export interface StorageRecoveryOptions { storageRoot: string; quarantineRoot?: string; signal?: AbortSignal; skipQueued?: boolean; onQuarantineIntent?: (id: string) => Promise<void> }
export interface ReconciliationResult { referenced: number; orphan: number; missing: number; notStored: number; unsafe: number; quarantineIds: string[]; repairedIntents: number }
export function originalKey(userId: string, workspaceId: string, documentId: string, extension: string): string;
export function ensureStorageDirectory(path: string): Promise<string>;
export interface RecoveryLease { <T>(key: string, work: (signal: AbortSignal) => Promise<T>, tryOnly?: boolean): Promise<T | null> }
export function recoverTenantOperations(query: TenantRecoveryQuery, withLease: RecoveryLease, userId: string, options: StorageRecoveryOptions): Promise<{ recovered: number; active: number; quarantineIds: string[] }>;
export function quarantineStorage(query: TenantRecoveryQuery, userId: string, key: string, reason: string, options: StorageRecoveryOptions): Promise<string | null>;
export function repairQuarantineIntents(query: TenantRecoveryQuery, userId: string, options: StorageRecoveryOptions): Promise<number>;
export function repairOperationFiles(query: TenantRecoveryQuery, row: { user_id: string; status?: string; payload: { files?: { documentId: string; workspaceId: string; extension: string; newlyPublished: boolean }[]; removedFiles?: { documentId: string; workspaceId: string; extension: string }[]; stagingId?: string; buildId?: string } }, options: StorageRecoveryOptions): Promise<string[]>;
export function reconcileStorage(query: TenantRecoveryQuery, userId: string, options: StorageRecoveryOptions): Promise<ReconciliationResult>;
