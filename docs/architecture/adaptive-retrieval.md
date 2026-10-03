# Adaptive retrieval

Phase 6's real 72-document / 144-query hard evaluation measured Hit@1 / Hit@5 / MRR:

| Strategy | Hit@1 | Hit@5 | MRR |
|---|---:|---:|---:|
| Vector Only | 0.942 | 0.992 | 0.964 |
| Lexical Only | 0.550 | 0.700 | 0.614 |
| Hybrid RRF | 0.733 | 0.975 | 0.818 |
| Reranked Hybrid | 0.700 | 0.975 | 0.800 |

Adding components reduced quality on this corpus. This architecture decision follows that evaluation; the Phase 6 corpus and report remain unchanged.

`QueryAnalyzer` detects languages, filename extensions, camel/snake case identifiers, versions, error/RFC identifiers, quoted phrases and acronyms. Exactness and semantic scores count observable signals; they are not probabilities. `RetrievalRouter` runs on the server without labels, expected documents, fixture lookups or an LLM classification call.

| Query | Route | Execution |
|---|---|---|
| Natural language, short ambiguous, followup without exact signals | VECTOR_ONLY | Preserve vector order; no lexical call |
| Exact or mixed | VECTOR_WITH_LEXICAL_BOOST | Vector and lexical candidates; RRF k=60 |
| Code or single identifier | LEXICAL_FIRST | Exact coverage first; vector fallback for weak/no matches |
| Filename | FILENAME_SEARCH | Case-insensitive original/display name; vector fallback |
| Embedding missing or failed | FALLBACK | Lexical only |

The deterministic reranker remains available with explicit `RAG_RERANK_ENABLED=true`. It defaults to false. Current evaluation did not justify enabling the deterministic reranker by default.

The evidence evaluator rejects empty evidence or evidence with both cosine below 0.5 and lexical coverage below 0.5. These fixed conservative guardrails are not calibrated confidence. It also rejects the model's structured decision when any requested detail is missing. Count, source diversity, similarity gap and support strength are reported explicitly. Citation identities and source content are still revalidated. High/medium/low describe evidence support, not factual correctness probabilities. Single weak documents do not become sufficient merely because the model says they are.

Development-only debug includes query profile, chosen strategy, public reason and evidence assessment. User progress says `Searching your knowledge`. Holdout data never enters production code. The independent holdout is evaluated only after router freeze; any disappointing result remains visible.
