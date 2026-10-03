import type { Pool } from "pg";
export function startupRecovery(owners: string[], poolClass: typeof Pool, connectionString: string, storageRoot: string): Promise<{ recovered: number; active: number }>;
