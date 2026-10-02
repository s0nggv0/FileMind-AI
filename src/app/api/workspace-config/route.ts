import { persistenceConfigured } from "@/lib/server/supabase";
export async function GET() {
  return Response.json({ persistent: persistenceConfigured(), intelligence: process.env.AI_ENGINE === "llm", label: process.env.AI_ENGINE === "llm" ? "FileMind Intelligence" : "Mock · basic organization" }, { headers: { "cache-control": "no-store" } });
}
