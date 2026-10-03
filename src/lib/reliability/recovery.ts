import { z } from "zod";
import { recoverTenantOperations, repairOperationFiles, reconcileStorage, type TenantRecoveryQuery } from "../../../scripts/storage-recovery.mjs";
import type { TransactionalTenantDatabase } from "../workspace/postgres-repository";
import { OperationJournal, type JournalRow } from "./operation-journal";

export class RecoveryService {
  readonly journal: OperationJournal;
  readonly query: TenantRecoveryQuery;
  constructor(readonly db: TransactionalTenantDatabase, readonly storageRoot: string) {
    this.journal = new OperationJournal(db);
    this.query = async (u, s, p) => {
      const result = await db.query(u, s, p);
      return { rows: z.array(z.record(z.string(), z.unknown())).parse(result.rows) };
    };
  }
  recover(userId: string) {
    return recoverTenantOperations(this.query, (key, work, tryOnly) => {
      const prefix = `${userId}:`;
      if (!key.startsWith(prefix)) throw new Error("FOREIGN_RECOVERY_LOCK");
      return this.journal.lock(userId, key.slice(prefix.length), work, tryOnly);
    }, userId, { storageRoot: this.storageRoot });
  }
  async rollback(row: JournalRow) {
    const ids = [...(row.payload.quarantineIds ?? [])];
    return repairOperationFiles(this.query, row, { storageRoot: this.storageRoot, onQuarantineIntent: async id => {
      ids.push(id);
      await this.db.query(row.user_id, "update filemind.operation_journal set payload=jsonb_set(payload,'{quarantineIds}',$3::jsonb),updated_at=now() where user_id=$1 and id=$2 and status<>'committed'", [row.user_id, row.id, JSON.stringify(ids)]);
    } });
  }
  async reconcile(userId: string) {
    await this.recover(userId);
    return this.journal.run(userId, "storage_repair", null, {}, async op => {
      const ids: string[] = [];
      const result = await reconcileStorage(this.query, userId, { storageRoot: this.storageRoot, signal: op.signal,
        onQuarantineIntent: async id => { ids.push(id); await op.stage("quarantining", { quarantineIds: ids }); } });
      op.assertActive();
      await this.db.transaction(userId, tx => op.commit(tx));
      return result;
    });
  }
}
