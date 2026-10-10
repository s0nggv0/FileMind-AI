import { persistenceConfigured } from "@/lib/server/database";
import { realAIRequired, competitionMode } from "@/lib/competition";
export async function GET() {
  return Response.json({ persistent: persistenceConfigured(), intelligence: realAIRequired(), competition: competitionMode(), label: realAIRequired() ? "AI 整理助手" : "模拟 · 本地规则整理" }, { headers: { "cache-control": "no-store" } });
}
