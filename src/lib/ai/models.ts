export type ModelRole = "main" | "small";
export interface ModelConfig { provider: string; main: string; small: string }
export function readModelConfig(env: Record<string, string | undefined>): ModelConfig {
  const provider = env.AI_PROVIDER || "openai";
  const main = env.AI_MODEL || "gpt-4.1-mini";
  return { provider, main, small: env.AI_SMALL_MODEL || main };
}
