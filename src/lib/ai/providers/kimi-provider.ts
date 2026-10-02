import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { AIError } from "../errors";
import { SDKAIProvider } from "./sdk-provider";

export const kimiBaseURL = "https://api.moonshot.cn/v1";
interface KimiProviderSettings {
  apiKey?: string;
  baseURL?: string;
  models: { main: string; small: string };
  fetch?: Parameters<typeof createOpenAICompatible>[0]["fetch"];
}

// Credentials come from the server-only factory; injectable transport permits offline verification.
export function createKimiProvider(settings: KimiProviderSettings) {
  if (!settings.apiKey?.trim()) throw new AIError("CONFIGURATION", "Kimi API key is not configured. Continue with local organization.", false, "kimi");
  // This adapter uses instant mode. Other Kimi models need different reasoning parameters.
  if ([settings.models.main, settings.models.small].some(model => model !== "kimi-k2.6")) {
    throw new AIError("CONFIGURATION", "Use kimi-k2.6 for the configured Kimi instant-mode adapter.", false, "kimi");
  }
  const baseURL = settings.baseURL?.trim() || kimiBaseURL;
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid endpoint");
  } catch {
    throw new AIError("CONFIGURATION", "KIMI_BASE_URL must be a valid HTTPS API endpoint.", false, "kimi");
  }
  const kimi = createOpenAICompatible({
    name: "kimi", apiKey: settings.apiKey.trim(), baseURL, fetch: settings.fetch,
    supportsStructuredOutputs: true,
    // K2.6 thinking mode rejects required tool choice. Instant mode also avoids hidden reasoning.
    transformRequestBody: body => ({ ...body, thinking: { type: "disabled" } }),
  });
  return new SDKAIProvider("kimi", settings.models, role => kimi.chatModel(settings.models[role]));
}
