import { randomUUID } from "node:crypto";
import type { TransactionalTenantDatabase } from "../workspace/postgres-repository";
import { OperationJournal } from "../reliability/operation-journal";
import { IndexStatusRepository } from "./index-status";
import { documentReadiness } from "./readiness";
import type { RetrievalScope } from "./types";

export interface QueuedPreparation { id: string; documentId: string; userId: string; workspaceId: string }
// Persist a real pending operation before returning the Apply response. This
// closes the gap before `after` starts, including slow image preparation.
export async function queueIndexPreparation(db: TransactionalTenantDatabase, scope: RetrievalScope): Promise<QueuedPreparation[]> {
  return db.transaction(scope.userId, async tx => {
    const owned = await tx.query(`select id from filemind.documents where user_id=$1 and ($2::uuid is null or workspace_id=$2) and ($3::uuid[] is null or id=any($3::uuid[])) and parse_status='completed' order by id for update`, [scope.userId, scope.workspaceId ?? null, scope.documentIds ?? null]);
    const ids = owned.rows.map(row => (row as { id: string }).id);
    const repository = new IndexStatusRepository({ query: (_u, sql, values) => tx.query(sql, values) });
    const queued: QueuedPreparation[] = [];
    let cursor: string | undefined;
    do {
      const page = await repository.page({ ...scope, documentIds: ids }, { cursor });
      for (const document of page.documents) {
        if (!documentReadiness(document).retryable) continue;
        const job = { id: randomUUID(), userId: scope.userId, documentId: document.id, workspaceId: document.workspaceId! };
        // The prepare lease is also used by explicit unfinished-only retries.
        // The existing startup journal recovery can recover a lost queued job.
        await tx.query(`insert into filemind.operation_journal(id,user_id,operation_type,resource_id,lock_key,status,stage,payload,owner_instance)
          values($1,$2,'reindex',$3,$4,'pending','queued',$5,$6)`, [job.id, job.userId, job.documentId, `prepare:${job.documentId}`, { workspaceId: job.workspaceId }, randomUUID()]);
        await tx.query("update filemind.documents set index_build_id=$3,index_build_status='chunking',index_build_error_code=null where user_id=$1 and id=$2", [job.userId, job.documentId, job.id]);
        queued.push(job);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return queued;
  });
}
export async function runQueuedPreparation(db: TransactionalTenantDatabase, job: QueuedPreparation, work: () => Promise<unknown>) {
  const journal = new OperationJournal(db);
  return journal.lock(job.userId, `prepare:${job.documentId}`, async signal => {
    const row = await journal.get(job.userId, job.id);
    if (row?.status !== "pending") return;
    try {
      signal.throwIfAborted();
      await db.query(job.userId, "update filemind.operation_journal set status='running',updated_at=now() where user_id=$1 and id=$2 and status='pending'", [job.userId, job.id]);
      await work(); signal.throwIfAborted();
      await db.query(job.userId, "update filemind.operation_journal set status='committed',stage='settled',completed_at=now(),updated_at=now() where user_id=$1 and id=$2", [job.userId, job.id]);
    } catch {
      if (!signal.aborted) await db.query(job.userId, "update filemind.operation_journal set status='rolled_back',stage='settled',completed_at=now(),updated_at=now(),error_code='PREPARATION_FAILED' where user_id=$1 and id=$2", [job.userId, job.id]);
    } finally {
      // A newer private build owns a different ID. Never overwrite its state.
      if (!signal.aborted) await db.query(job.userId, "update filemind.documents set index_build_status='interrupted',index_build_error_code='PREPARATION_INCOMPLETE' where user_id=$1 and id=$2 and index_build_id=$3 and index_build_status='chunking'", [job.userId, job.documentId, job.id]);
    }
  });
}
