import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { readModelConfig } from "./models";
import { SDKAIProvider } from "./providers/sdk-provider";
import { AIError } from "./errors";
export function getAIProvider() {
  const config = readModelConfig(process.env);
  if (config.provider !== "openai") throw new AIError("CONFIGURATION", "This provider has no configured adapter yet.", false, config.provider);
  if (!process.env.OPENAI_API_KEY) throw new AIError("CONFIGURATION", "AI service is not configured. Continue with local organization.", false, config.provider);
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return new SDKAIProvider(config.provider, config, role => openai.chat(config[role]));
}
