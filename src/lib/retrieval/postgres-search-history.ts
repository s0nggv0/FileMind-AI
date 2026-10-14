import type { TenantDatabase } from "../workspace/postgres-repository";
import { retrievalConfig } from "./config";
import type { SavedSearch, SearchDiagnostics, SearchHistory } from "./search-history";
import type { SearchResult } from "./search-contract";
import type { RetrievalScope } from "./types";

export class PostgresSearchHistory implements SearchHistory {
  constructor(private database: TenantDatabase) {}

  async get(scope: RetrievalScope, id: string) {
    const response = await this.database.query(scope.userId,
      `select coalesce(rewritten_query,query) as query,result from filemind.retrieval_runs
       where user_id=$1 and id=$2 and ($3::uuid is null or workspace_id=$3)`,
      [scope.userId, id, scope.workspaceId ?? null]);
    return response.rows[0] as SavedSearch | undefined;
  }

  async list(userId: string) {
    const response = await this.database.query(userId,
      "select id,query,mode,created_at from filemind.retrieval_runs where user_id=$1 order by created_at desc limit 10",
      [userId]);
    return response.rows;
  }

  async save(scope: RetrievalScope, result: SearchResult, diagnostics: SearchDiagnostics) {
    await this.database.query(scope.userId,
      `insert into filemind.retrieval_runs(id,user_id,workspace_id,query,rewritten_query,mode,
       vector_model,vector_provider,top_k,retrieved_chunk_ids,evidence_ids,reranker_status,latency,result)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[],$11::uuid[],$12,$13,$14)`,
      [result.id, scope.userId, scope.workspaceId ?? null, result.query, result.rewrittenQuery, result.mode,
        diagnostics.embedding?.model ?? null, diagnostics.embedding?.provider ?? null, retrievalConfig.vectorTopK,
        diagnostics.candidateIds, result.sources.map(source => source.id), diagnostics.reranker, diagnostics.latency, result]);
  }
}
