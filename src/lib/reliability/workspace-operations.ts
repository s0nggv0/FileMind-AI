import { createHash } from "node:crypto";
import { originalKey } from "../../../scripts/storage-recovery.mjs";
import { OperationPayloadSchema } from "./operation-journal";
import { RecoveryService } from "./recovery";
import { PrivateFileStorage } from "../workspace/private-file-storage";
import { PostgresWorkspaceRepository } from "../workspace/postgres-repository";
import type { WorkspaceSnapshot } from "../workspace/schemas";
import { WorkspaceError } from "../workspace/authorization";

export class WorkspaceOperations {
  constructor(readonly recovery: RecoveryService) {}
  async upload(userId: string, snapshot: WorkspaceSnapshot, documentId: string, extension: string, bytes: Buffer) {
    await this.recovery.recover(userId);
    const document = snapshot.documents.find(d => d.id === documentId);
    if (!document) throw new WorkspaceError("NOT_FOUND", "Document not found.", 404);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const key = originalKey(userId, snapshot.id, documentId, extension);
    const payload = OperationPayloadSchema.parse({ workspaceId: snapshot.id, expectedRevision: snapshot.revision,
      files: [{ documentId, workspaceId: snapshot.id, extension, hash, newlyPublished: true }] });
    return this.recovery.journal.run(userId, "document_upload", documentId, payload, async op => {
      await op.stage("publishing_original"); op.assertActive();
      await new PrivateFileStorage(this.recovery.storageRoot).putOriginal({ userId, workspaceId: snapshot.id, documentId, extension, bytes });
      await op.stage("original_published");
      document.storagePath = key; document.contentHash = hash;
      return this.recovery.db.transaction(userId, async tx => {
        op.assertActive();
        const repository = new PostgresWorkspaceRepository({ query: (_u,s,p) => tx.query(s,p) });
        const saved = await repository.save(userId, snapshot);
        await tx.query("update filemind.documents set storage_status='available' where user_id=$1 and id=$2", [userId, documentId]);
        await op.commit(tx); return saved;
      });
    }, row => this.recovery.rollback(row).then(() => {}));
  }
  async apply(userId: string, snapshot: WorkspaceSnapshot) {
    await this.recovery.recover(userId);
    return this.recovery.journal.run(userId, "workspace_apply", snapshot.id, { workspaceId: snapshot.id, expectedRevision: snapshot.revision }, async op => {
      await op.stage("saving_review");
      return this.recovery.db.transaction(userId, async tx => {
        op.assertActive();
        const saved = await new PostgresWorkspaceRepository({ query: (_u,s,p) => tx.query(s,p) }).save(userId, snapshot);
        await op.commit(tx); return saved;
      });
    });
  }
}
