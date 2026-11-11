import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { TenantDatabase } from "./postgres-repository";
export const INVALID_RECOVERY_KEY = "Recovery key is invalid.";
export class RecoveryError extends Error {
  constructor(public status = 400) { super(INVALID_RECOVERY_KEY); }
}
export function generateRecoveryKey() { return `fm-recovery-v1-${randomBytes(32).toString("base64url")}`; }
export function recoveryDigest(key: string) { return createHash("sha256").update(key.trim()).digest("hex"); }
export class IdentityRecoveryService {
  constructor(private db: TenantDatabase) {}
  async status(userId: string) {
    const result = await this.db.query(userId, "select exists(select 1 from filemind.recovery_credentials where user_id=$1) as configured,(select last_backup_at from filemind.profiles where id=$1) as last_backup_at", [userId]);
    const row = result.rows[0] as { configured: boolean; last_backup_at: string | Date | null };
    return { configured: row.configured, lastBackupAt: row.last_backup_at ? new Date(row.last_backup_at).toISOString() : null };
  }
  async create(userId: string, rotate = false) {
    const key = generateRecoveryKey();
    await this.db.query(userId, "insert into filemind.profiles(id) values($1) on conflict do nothing", [userId]);
    const sql = rotate
      ? "insert into filemind.recovery_credentials(user_id,key_digest) values($1,$2) on conflict(user_id) do update set key_digest=excluded.key_digest,configured_at=now() returning user_id"
      : "insert into filemind.recovery_credentials(user_id,key_digest) values($1,$2) on conflict(user_id) do nothing returning user_id";
    const result = await this.db.query(userId, sql, [userId, recoveryDigest(key)]);
    if (!result.rows.length) throw new Error("Recovery already configured. Rotate to replace the existing key.");
    return key;
  }
  async recover(key: string) {
    // A conservative per-database limit cannot be bypassed with forged proxy
    // headers, cleared cookies or a different process. No key material in bucket.
    const anonymous = randomUUID();
    const allowed = await this.db.query(anonymous, "select filemind.recovery_attempt('identity-recovery') as allowed");
    if (!(allowed.rows[0] as { allowed: boolean }).allowed) throw new RecoveryError(429);
    if (!/^fm-recovery-v1-[A-Za-z0-9_-]{43}$/.test(key.trim())) throw new RecoveryError();
    const result = await this.db.query(anonymous, "select user_id from filemind.recovery_credentials where key_digest=$1", [recoveryDigest(key)]);
    if (!result.rows.length) throw new RecoveryError();
    return (result.rows[0] as { user_id: string }).user_id;
  }
}
