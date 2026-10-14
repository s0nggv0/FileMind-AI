import "server-only";
import { getAIProvider } from "../ai/get-provider";
import { developmentControls, realAIRequired } from "../competition";
import { applicationLog } from "../reliability/application-log";
import { indexingConfig } from "../retrieval/config";
import { PostgresSearchHistory } from "../retrieval/postgres-search-history";
import { SearchService } from "../retrieval/search-service";
import { database } from "./database";
import { configuredEmbedding, knowledgeRepository, offlineRAGProvider, refreshIndexVersions, vectorStore } from "./knowledge";

export const searchService = new SearchService({
  history: new PostgresSearchHistory(database), knowledge: knowledgeRepository, vectors: vectorStore,
  embedding: configuredEmbedding, refreshIndexVersions, developmentControls, realAIRequired,
  rerankEnabled: () => indexingConfig(process.env).rerankEnabled,
  provider: () => {
    if (!realAIRequired()) return offlineRAGProvider();
    try { return getAIProvider(); } catch { return null; }
  },
  log: applicationLog,
});
