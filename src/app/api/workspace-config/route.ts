import { persistenceConfigured } from "@/lib/server/database";
import { realAIRequired, competitionMode } from "@/lib/competition";
export async function GET() {
  return Response.json({ persistent: persistenceConfigured(), intelligence: realAIRequired(), competition: competitionMode(), label: realAIRequired() ? "FileMind Agent" : "Mock · basic organization" }, { headers: { "cache-control": "no-store" } });
}
