export type ModelRole = "main" | "small";
export interface ModelConfig { provider: string; main: string; small: string }
export function readModelConfig(env: Record<string, string | undefined>): ModelConfig {
  const provider = env.AI_PROVIDER || "kimi";
  const main = env.AI_MODEL || "kimi-k2.6";
  return { provider, main, small: env.AI_SMALL_MODEL || main };
}
