export function competitionMode(env: Record<string, string | undefined> = process.env) { return env.COMPETITION_MODE === "true"; }
export function realAIRequired(env: Record<string, string | undefined> = process.env) { return competitionMode(env) || env.AI_ENGINE === "llm"; }
export function developmentControls(env: Record<string, string | undefined> = process.env) { return (env.NODE_ENV !== "production" || env.FILEMIND_DEBUG_UI === "true") && env.DEMO_MODE !== "true" && !competitionMode(env); }
