export interface MigrationClient { query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }> }
export function applyMigrations(client: MigrationClient, directory?: string): Promise<string[]>;
