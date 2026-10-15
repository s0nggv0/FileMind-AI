import { createHash } from "node:crypto";
import { originalKey } from "../../../scripts/runtime/storage-recovery.mjs";
import { OperationPayloadSchema } from "./operation-journal";
import { RecoveryService } from "./recovery";
import { PrivateFileStorage } from "../workspace/private-file-storage";
import { PostgresWorkspaceRepository } from "../workspace/postgres-repository";
import type { WorkspaceSnapshot } from "../workspace/schemas";
import { WorkspaceError } from "../workspace/authorization";
import { z } from "zod";

export class WorkspaceOperations {
  constructor(readonly recovery: RecoveryService) {}
  // Internal service only: removes an owned original from active storage while
  // retaining extracted knowledge. No dangerous delete action is exposed in UI.
  async removeOriginal(userId: string, workspaceId: string, documentId: string, expectedRevision: number, afterCommit?: () => Promise<void>) {
    await this.recovery.recover(userId);
    const saved = await this.recovery.journal.run(userId, "file_delete", documentId, { workspaceId, expectedRevision }, async op => {
      const repository = new PostgresWorkspaceRepository(this.recovery.db);
      const snapshot = await repository.get(userId, workspaceId);
      if (snapshot.revision !== expectedRevision) throw new WorkspaceError("CONFLICT", "Workspace changed. Reload before retrying.", 409);
      const result = await this.recovery.db.query(userId, "select original_name,storage_path,content_hash from filemind.documents where user_id=$1 and workspace_id=$2 and id=$3", [userId, workspaceId, documentId]);
      if (!result.rows.length) throw new WorkspaceError("NOT_FOUND", "Document not found.", 404);
      const row = z.object({ original_name:z.string(),storage_path:z.string().nullable(),content_hash:z.string().nullable() }).parse(result.rows[0]);
      const removedFiles = row.storage_path ? OperationPayloadSchema.parse({removedFiles:[{workspaceId,documentId,extension:row.original_name.split(".").at(-1)!.toLowerCase(),hash:row.content_hash}]}).removedFiles! : [];
      if (removedFiles.length && row.storage_path !== originalKey(userId,workspaceId,documentId,removedFiles[0].extension)) throw new Error("INVALID_ORIGINAL_INTENT");
      await op.stage("removal_prepared", { removedFiles });
      for (const document of [...snapshot.documents,...snapshot.run?.documents??[],...snapshot.proposal?.documents.map(d=>d.document)??[]]) if(document.id===documentId) { delete document.storagePath; document.storageStatus="not_stored"; }
      return this.recovery.db.transaction(userId, async tx => {
        op.assertActive();
        const next = await new PostgresWorkspaceRepository({query:(_u,s,p)=>tx.query(s,p)}).save(userId,snapshot);
        await tx.query("update filemind.documents set storage_path=null,storage_status='not_stored' where user_id=$1 and workspace_id=$2 and id=$3",[userId,workspaceId,documentId]);
        await op.commit(tx); return next;
      });
    });
    await afterCommit?.();
    await this.recovery.recover(userId);
    return saved;
  }
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
