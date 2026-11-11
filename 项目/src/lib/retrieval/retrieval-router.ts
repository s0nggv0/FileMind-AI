import type { QueryProfile, RetrievalStrategy } from "./search-contract";
export type { RetrievalStrategy } from "./search-contract";
export interface RetrievalRoute { strategy: RetrievalStrategy; reason: string }
export class RetrievalRouter {
  route(profile: QueryProfile, embeddingsAvailable = true): RetrievalRoute {
    if (!embeddingsAvailable) return { strategy: "FALLBACK", reason: "Semantic retrieval is unavailable; use lexical evidence." };
    if (profile.type === "filename") return { strategy: "FILENAME_SEARCH", reason: "Detected a filename; match document names first." };
    if (["code", "identifier"].includes(profile.type)) return { strategy: "LEXICAL_FIRST", reason: "Detected a code token or identifier; prefer exact matches, then vectors if needed." };
    if (profile.exactnessScore > 0) return { strategy: "VECTOR_WITH_LEXICAL_BOOST", reason: `Detected exact terms ${JSON.stringify(profile.exactTerms)}; include lexical candidates.` };
    return { strategy: "VECTOR_ONLY", reason: "Natural language or ambiguous query without exact-term signals; preserve vector ranking." };
  }
}
