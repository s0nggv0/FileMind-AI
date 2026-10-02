import "server-only";
import { getSupabase } from "./supabase";
import type { AnalysisCache } from "@/lib/ai/agent-runner";
export function getAnalysisCache(userId: string, workspaceId: string): AnalysisCache {
  return {
    async get(key) { const { data } = await getSupabase().from("documents").select("analysis_json").eq("user_id", userId).eq("analysis_cache_key", key).limit(1).maybeSingle(); return data?.analysis_json; },
    async set(documentId, key, value) { await getSupabase().from("documents").update({ analysis_cache_key: key, analysis_json: value }).eq("id", documentId).eq("workspace_id", workspaceId).eq("user_id", userId); },
  };
}
