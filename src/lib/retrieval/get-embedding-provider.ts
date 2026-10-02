import "server-only";
import { AIError } from "../ai/errors";
import { MockEmbeddingProvider, type EmbeddingProvider } from "./embedding-provider";
import { DashScopeEmbeddingProvider } from "./dashscope-provider";
export function getEmbeddingProvider(): EmbeddingProvider {
  // Explicit offline engine selects the fixture index too, preventing browser
  // and portable tests from spending tokens on keys present in .env.local.
  const provider = process.env.AI_ENGINE === "mock" ? "mock" : process.env.EMBEDDING_PROVIDER;
  if (provider === "mock" && process.env.AI_ENGINE !== "llm") return new MockEmbeddingProvider();
  if (provider === "dashscope") return new DashScopeEmbeddingProvider({ apiKey: process.env.EMBEDDING_API_KEY || process.env.DASHSCOPE_API_KEY || "", baseURL: process.env.EMBEDDING_BASE_URL || "", model: process.env.EMBEDDING_MODEL || "", dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1024) });
  throw new AIError("CONFIGURATION", "Configure a real Embedding provider, or explicitly select mock for offline development.", false, provider || "embedding");
}
