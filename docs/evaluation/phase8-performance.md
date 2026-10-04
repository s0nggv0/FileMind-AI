# Phase 8 performance and security evidence

Measured host: Windows x64, Node.js v24.18.0, Intel Core i9-13900HX (32 logical processors), 16,876,797,952 bytes total physical memory (15.72 GiB). These describe the acceptance host rather than minimum system requirements. Remote request times also include the configured network and provider service.

All capacity vectors are explicitly deterministic synthetic 1024-dimensional vectors in actual native PostgreSQL. They measure the SQL scan implementation, not semantic retrieval quality. Each scale has twenty complete top-20 searches under one repeatable-read snapshot per search. Paging is 200 rows; the implementation queries a final empty page at exact multiples of 200. The expected SELECT counts from inspected code are 1, 3, 6, 11 and 26 per search, respectively; these counts are derived, not SQL tracing measurements.

| Persisted chunks | P50 ms | P95 ms | Observed maximum process RSS MiB |
| --- | ---: | ---: | ---: |
| 100 | 28.51 | 51.04 | 277.15 |
| 500 | 200.59 | 216.60 | 407.98 |
| 1000 | 852.11 | 889.33 | 401.40 |
| 2000 | 540.24 | 552.92 | 481.75 |
| 5000 | 1448.43 | 1480.33 | 482.13 |

RSS/heap are observations of the entire evaluator process after each query; garbage collection and earlier allocations remain included. Wall times need not increase monotonically, as the 1000/2000 result illustrates. Other acceptance tasks ran on this host during the broader drill; this is a practical local measurement, not an isolated load lab. The linear scan is suitable for small personal collections and is a clear latency/memory limitation at larger scale. It is not an ANN implementation.

Twenty uncached synthetic Workspace Agent runs had P50/P95 11,946.57/14,965.10 ms and all reached human review. Eighteen recorded `plan_validation` fallback and two succeeded with the LLM plan; fallback never auto-applied a plan. The complete eight-file browser Demo separately succeeded with an LLM plan and zero fallback. Historical Phase 7's precise failure cause remains unavailable because only a generic error was saved. New instrumented reasons do not retroactively identify that old event.

Twenty native image analyses, alternating original Demo PNG/JPG bytes with actual Kimi Vision and bundled OCR, had P50/P95 4,665.28/5,379.31 ms. All twenty recorded both providers ready. Application result caches were not supplied; provider-side prompt caching is not observable here. [Raw results](phase8-performance.json) and [append-only per-observation ledger](phase8-performance.jsonl) preserve all samples. An earlier shell-owned drill was interrupted before its final report; the repeated complete drill added per-observation fsync rather than claim its lost partial samples were measured successes.

The [HTTP security regression](phase8-security-http.json) passed twelve labelled checks in a fresh native PostgreSQL instance with two synthetic identities: foreign workspace/save/original/image/citation access, empty foreign retrieval, owner-only backup and maintenance, same-origin mutations, Web role privileges, and React text rendering inspection. Stored malicious content has no export/delete tool path. This drill explicitly uses Mock extraction; real model instruction attacks are measured separately in the frozen blind corpus. The final 81 unit/integration tests additionally cover archive path traversal/symlinks/checksums, image MIME/signature bounds, tenant FORCE RLS, recovery digest/rate limits, untrusted prompt boundaries and numeric/citation validation. Backup checksums provide integrity, not encryption or a signature.
