# Phase 6 hard retrieval evaluation

The authored corpus contains 60 text documents and 12 educational images (72 total), across AI, linear algebra, statistics, networks, databases, operating systems, web, vector search, cloud, research, projects and security. Twelve text sources combine multiple lecture topics, so relevant evidence can span both focused notes and long sources. All fixtures are synthetic and committed; no user files or scraped copyrighted material are used.

There are 144 labelled queries: 48 exact, 12 paraphrase, 12 hard-negative, 12 cross-language, 6 semantic, 6 follow-up, 12 image-only, 11 multi-document, 1 ambiguous and 24 no-answer. No-answer questions are 16.67% of the sample. Hard negatives include Java/JavaScript, neural/network layers, word embedding/embedded systems and competing meanings of indexes. Image-only facts include QKV projection roles, budget thresholds, graph arrows and experiment values absent from text notes. Follow-ups compose the previous question with the current one without importing gold labels into production retrieval.

## Method

`scripts/evaluate-rag-hard.ts --live` requires the dedicated FileMind database and successful Vision Gate. It creates isolated synthetic workspaces, performs actual Kimi Vision and local OCR, indexes through production chunking/SQL/vector code with real DashScope embeddings, and cleans its records. Real provider results can be cached in ignored private evaluation storage. A cache hit is reuse of a real result, not a Mock request. Concurrent image results are written once after the analysis queue finishes.

The same sources/queries are compared as Vector, Lexical, raw Hybrid RRF, and Hybrid with the existing deterministic reranker. Ranking metrics use distinct document names; Hit@1/5 and MRR use the first relevant document. Recall@10 and nDCG@10 include all labelled relevant documents; evidence recall uses the top 7 distinct documents. These differ from answer factual correctness and do not claim to evaluate every generated sentence.

Image-only and no-answer questions also invoke real Kimi grounded answering with production citation validation. The report separately counts unavailable/rejected generations, format-repair use, returned validated citations and no-answer accuracy. A 100% returned-citation validity score does not imply every attempted answer succeeded. One bounded format regeneration is part of the final production behavior.

`rag-hard-results.json` contains configuration, sample sizes, aggregate and per-type results, all queries, gold ranks/top-5 and failure classifications. There is no production fixture lookup or per-query rule. Exact labels include both focused notes and the seminar document when both contain the answer. Failure examples expose model/ranking limitations rather than being deleted to improve scores.

## Experiments and interpretation

Final recorded run (2026-10-03 UTC), answerable-query denominator 120:

| Mode | Hit@1 | Hit@5 | MRR | Recall@10 | nDCG@10 | Evidence recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Vector | 0.942 | 0.992 | 0.964 | 0.971 | 0.927 | 0.954 |
| Lexical | 0.550 | 0.700 | 0.614 | 0.675 | 0.613 | 0.660 |
| Hybrid RRF | 0.733 | 0.975 | 0.818 | 0.947 | 0.824 | 0.922 |
| Hybrid + deterministic rerank | 0.700 | 0.975 | 0.800 | 0.947 | 0.812 | 0.922 |

Image Hit@5 is 12/12. All 12 attempted image answers returned validated citations (19 citations total), with zero format regenerations in this final run. The initial prompt exposed missing inline markers despite valid citation metadata; a generic prompt clarification and bounded retry were added, without loosening source checks. No-answer accuracy is 22/24 (0.917); failed cases `none-20` and `none-23` remain in the JSON. Neither provenance validity nor successful refusal classification is a semantic factuality audit.

| Chunk target | Chunks | Hit@1 | Hit@5 | MRR | Evidence recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| 400 | 143 | 0.417 | 0.875 | 0.599 | 0.896 |
| 800 | 108 | 0.583 | 0.958 | 0.711 | 0.833 |
| 1200 | 106 | 0.542 | 0.958 | 0.712 | 0.792 |

800 has better first-hit and evidence coverage than 1200; 1200's MRR advantage is only 0.001. The existing 800 target remains a balanced choice. RRF 20/60/100 have equal Hit@1/5 and MRR on the subset; there is no evidence for changing 60.

Chunk targets 400, 800 and 1200 estimated tokens are compared on the same 24 difficult questions with overlap 100. This is an estimate (four Latin characters or roughly 1.5 Chinese characters per token), not the model tokenizer. RRF constants 20, 60 and 100 use the same query subset and candidates. Keep 800/100 and RRF 60 unless the recorded evidence justifies a change. Do not select production settings from one synthetic sample alone.

The real embedding model performs better than lexical-heavy fusion on this corpus. Hybrid improves lexical-only coverage, but it does not outperform Vector. The deterministic title boost can lower paraphrase/cross-language ranking, and raw RRF can outperform that reranker. Retain these comparisons in the report; a learned reranker and broader held-out examples are future work. Small changes between repeated hybrid runs can result from random chunk UUID tie breaks and generative answer variation; gold labels and provider caches stay fixed.

This corpus is more challenging than Phase 5's 10 documents/25 queries, but still synthetic and small. It is not a production quality guarantee, OCR accuracy benchmark or semantic entailment audit. Run held-out user-like documents before changing routing thresholds. Store no provider credentials or raw transport errors in public reports.
