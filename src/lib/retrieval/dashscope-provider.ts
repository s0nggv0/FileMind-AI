import { z } from "zod";
import { AIError, normalizeAIError } from "../ai/errors";
import { validateVector, type EmbeddingModelInfo, type EmbeddingProvider, type EmbeddingResult } from "./embedding-provider";

// Official OpenAI-compatible protocol:
// https://help.aliyun.com/zh/model-studio/embedding-interfaces-compatible-with-openai/
// Endpoint is configured from the account console, because region/workspace differ.
export class DashScopeEmbeddingProvider implements EmbeddingProvider {
  private endpoint: string;
  constructor(private settings: { apiKey: string; baseURL: string; model: string; dimensions: number; fetch?: typeof fetch }) {
    let url: URL;
    try { url = new URL(settings.baseURL); } catch { throw new AIError("CONFIGURATION", "Configure the Embedding service address.", false, "dashscope"); }
    if (url.protocol !== "https:" || !url.hostname.endsWith(".aliyuncs.com") || url.username || url.password || url.search || url.hash || !settings.apiKey.trim() || !settings.model.trim() || !Number.isInteger(settings.dimensions) || settings.dimensions < 64 || settings.dimensions > 2560) throw new AIError("CONFIGURATION", "Invalid DashScope Embedding configuration.", false, "dashscope");
    this.endpoint = settings.baseURL.replace(/\/$/, "") + "/embeddings";
  }
  getModelInfo(): EmbeddingModelInfo { return { provider: "dashscope", model: this.settings.model, dimensions: this.settings.dimensions, mock: false }; }
  async embedQuery(text: string) { return (await this.embedDocuments([text]))[0]; }
  async embedDocuments(texts: string[]): Promise<EmbeddingResult[]> {
    if (!texts.length) return [];
    // v3/v4 accept at most ten inputs. Splitting is independent from queue concurrency.
    const results: EmbeddingResult[] = [];
    for (let offset = 0; offset < texts.length; offset += 10) {
      const input = texts.slice(offset, offset + 10);
      try {
        const response = await (this.settings.fetch ?? fetch)(this.endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(45000), headers: { authorization: `Bearer ${this.settings.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: this.settings.model, input, dimensions: this.settings.dimensions, encoding_format: "float" }) });
        if (!response.ok) throw new AIError(response.status === 401 || response.status === 403 ? "INVALID_KEY" : response.status === 429 ? "RATE_LIMIT" : "UNAVAILABLE", "Embedding service is unavailable.", response.status === 429 || response.status >= 500, "dashscope", response.status);
        const payload = z.object({ data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number().finite()) })) }).parse(await response.json());
        if (payload.data.length !== input.length || new Set(payload.data.map(d => d.index)).size !== input.length || payload.data.some(d => d.index >= input.length)) {
          // Some live Flash responses repeat index=0 in batches. Never infer
          // association from array order. Singleton retry makes it unambiguous.
          if (input.length > 1) { for (const text of input) results.push(...await this.embedDocuments([text])); continue; }
          throw new AIError("STRUCTURED_OUTPUT", "Invalid Embedding batch.", false, "dashscope");
        }
        for (let index = 0; index < input.length; index++) {
          const entry = payload.data.find(d => d.index === index);
          if (!entry) throw new AIError("STRUCTURED_OUTPUT", "Missing Embedding result.", false, "dashscope");
          validateVector(entry.embedding, this.settings.dimensions);
          results.push({ ...this.getModelInfo(), vector: entry.embedding });
        }
      } catch (error) { throw normalizeAIError(error, "dashscope"); }
    }
    return results;
  }
}
