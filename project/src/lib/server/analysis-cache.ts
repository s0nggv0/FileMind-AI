import "server-only";
import { database } from "./database";
import { DocumentAnalysisSchema } from "@/lib/ai/schemas";
import { WorkspaceError } from "@/lib/workspace/authorization";
import type { AnalysisCache } from "@/lib/ai/agent-runner";
export function getAnalysisCache(userId: string, workspaceId: string): AnalysisCache {
  return {
    async get(key) {
      const result = await database.query(userId, "select analysis_json from filemind.documents where user_id=$1 and analysis_cache_key=$2 limit 1", [userId, key]);
      return (result.rows[0] as { analysis_json?: unknown } | undefined)?.analysis_json;
    },
    async set(documentId, key, value) {
      const result = await database.query(userId, "update filemind.documents set analysis_cache_key=$1,analysis_json=$2 where user_id=$3 and workspace_id=$4 and id=$5 returning id", [key, DocumentAnalysisSchema.parse(value), userId, workspaceId, documentId]);
      if (!result.rows.length) throw new WorkspaceError("NOT_FOUND", "Document not found.", 404);
    },
  };
}
