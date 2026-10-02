import "server-only";
import { readModelConfig } from "./models";
import { createKimiProvider } from "./providers/kimi-provider";
import { AIError } from "./errors";
export function getAIProvider() {
  const config = readModelConfig(process.env);
  if (config.provider !== "kimi") throw new AIError("CONFIGURATION", "Set AI_PROVIDER=kimi to use the configured adapter.", false, config.provider);
  return createKimiProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL, models: config });
}
