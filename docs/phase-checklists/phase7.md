# Phase 7 — Adaptive Retrieval, Identity Recovery & Verified Backup

Phase 7 is complete. Phase 8 has not started. This phase changes retrieval defaults based on retained evaluation evidence, restores an identity after cookie loss in the same database, and restores owned knowledge into a different, empty installation. It does not add OAuth, cloud sync, collaboration or deployment. Only FileMind's private database/runtime was used.

## Retrieval and independent evaluation

- Server-side deterministic `QueryAnalyzer` and `RetrievalRouter`; no fixture labels, expected document IDs or LLM routing calls.
- Semantic, short ambiguous and follow-up queries without exact signals preserve Vector order and make no lexical request. Exact/mixed signals use Vector + Lexical RRF k=60. Code/identifier queries prefer lexical coverage, then vectors; filenames match owned document names. Missing/failed embeddings use lexical fallback.
- The existing deterministic reranker is experimental and defaults to `RAG_RERANK_ENABLED=false`.
- Development debug records query type, strategy and public reason. Production says “Searching your knowledge.” Evidence confidence is a support level, not a calibrated probability.
- Explainable evidence checks reject empty/weak evidence and structured unsupported/missing-detail decisions. Count, document diversity and score gap are exposed. Returned citations retain source identity/content revalidation.
- Independently authored and frozen **50 documents / 100 queries**: 42 text files including real PDF/DOCX, eight images; all required semantic/exact/cross-language/multimodal/no-answer/hard-negative/filename/code/identifier/multi-document categories.
- Algorithm and fixture hashes were frozen before the one completed live evaluation. Infrastructure recovery reused those exact bytes and real provider caches. No result-driven retuning or repeated completed holdout evaluation occurred.

Ranking uses 92 answerable queries; no-answer uses eight attempted grounded answers per variant. Real Kimi Vision, portable Tesseract OCR, DashScope embeddings and Kimi grounded output were exercised.

| Variant | Hit@1 | Hit@5 | MRR | Recall@10 | nDCG@10 | No-answer | Image Hit@5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vector Only | 0.9674 | 1.0000 | 0.9837 | 1.0000 | 0.9880 | 8/8 | 8/8 |
| Lexical Only | 0.5000 | 0.5217 | 0.5063 | 0.5217 | 0.5079 | 8/8 | 4/8 |
| Always Hybrid | 0.9674 | 1.0000 | 0.9819 | 1.0000 | 0.9865 | 8/8 | 8/8 |
| Adaptive | 0.9674 | 1.0000 | 0.9837 | 1.0000 | 0.9880 | 8/8 | 8/8 |

Adaptive routes: 86% Vector Only, 5% Vector + Lexical, 5% Lexical First, 4% Filename. No gold strategy labels exist; this is distribution, not routing accuracy. Returned citation validity: Vector 11/11, Lexical 6/6, Always Hybrid 11/11, Adaptive 11/11. Image grounded-answer successes are 8/8, 2/8, 8/8, 8/8 respectively. All 64 attempted grounded verifications completed; these counts do not establish universal correctness or answerability.

Phase 6's retained Vector 0.942/0.992/0.964 versus Hybrid 0.733/0.975/0.818 and reranked Hybrid 0.700/0.975/0.800 explain the default change. The new holdout preserves Vector quality with fewer lexical calls; the small MRR difference from Always Hybrid is not a statistical significance claim. The unchanged Phase 6 `none-20` missing sample-size and `none-23` unrelated diagnosis now both refuse, with top cosine 0.4519 and 0.4251 rejected before generation. This rechecks those two failures, not all 144 Phase 6 questions.

Evidence: [holdout method](../evaluation/rag-holdout-evaluation.md), [full per-query results](../evaluation/rag-holdout-results.json), [two-case regression](../evaluation/phase6-refusal-regression.json), [retrieval architecture](../architecture/adaptive-retrieval.md), [ADR](../adr/ADR-001-adaptive-retrieval.md).

## Identity recovery

- Settings → Identity & Recovery: status, create, one-time display, copy/download, recover and rotate.
- `crypto.randomBytes(32)` provides 256 bits of entropy. Only a SHA-256 digest is stored; plaintext stays in memory for the one-time UI response and is absent from the archive/logs.
- New-browser recovery signs the existing HTTP-only, SameSite Strict identity cookie. HTTPS production uses Secure; portable loopback explicitly disables Secure.
- Rotation requires the current identity and atomically invalidates the old key.
- Atomic database-wide throttling: ten attempts per fifteen minutes, including malformed/unknown keys. Uniform invalid-key text; 429 includes Retry-After. Server restarts, forged IP headers and cleared cookies cannot reset the counter.
- Unit and real-browser verification passed: digest-only storage, workspace recovery without copying cookies, old-key refusal and new-key acceptance.

## Verified backup

- Settings → Data & Backup: actual export stages and last completed package time; validate, preview, default duplicate skipping, Import/Cancel, Library link and compatibility-driven reindex.
- ZIP container `.filemind-backup` version 1 with strict `manifest.json` and separate exact-manifest SHA-256. Includes neutral profile creation time and all eleven owned knowledge tables, original files, OCR/Vision, snapshots/history, chunks/vectors, Agent runs/steps, proposals, tags/relations and retrieval/citation history.
- Explicit data allowlist excludes authentication credentials, Recovery Keys, API keys, cookies, signing secrets, database passwords, `.env`, runtime configuration and logs.
- **Unencrypted.** UI states this plainly. Every metadata/original entry has SHA-256; corrupt/missing/extra entries, inconsistent originals and future versions are rejected before writing. Hashes establish integrity, not archive authenticity.
- ZIP validation rejects traversal, absolute/drive/backslash paths, symlinks, duplicate names, overlapping entries and unsupported/encrypted formats. Entry paths are never extracted to filesystem paths. Declared quotas and bounded native decompression also reject dishonest expanded lengths.
- Private staging, current-identity ownership reassignment, fresh IDs for all imported identities/references, serialized duplicate decisions and one database transaction. Handled copy, schema, cancellation or commit failures roll back rows and remove newly published/staged bytes.
- Repeated all-duplicate imports do not create duplicate workspaces; partial skips prune dangling history/proposal/relation references. Existing files/rows are never overwritten.
- Embedding provider/model/dimensions/chunk mismatch marks restored indexes stale and prevents active reuse. Reindex replaces incompatible vectors. Vision incompatibility retains historical interpretation as stale rather than silently presenting it as current.
- Authenticated original-file endpoint verifies content hash and ownership; text/PDF/images open inline, DOCX downloads. Foreign access returns 404.

Format, security, transaction details and boundaries: [backup-recovery](../architecture/backup-recovery.md).

## Real A → empty B drill

`npm run test:backup-portable` invokes an explicit real-provider verification script; it is separate from offline regression and may spend provider tokens. Start the built source on port 3083 first. It uses synthetic files and removes its disposable target. A physical database directory is never copied.

The retained report passes all **21 assertions**:

1. Browser-upload actual PDF + TXT + image in A; real OCR/Vision, embeddings and text/image RAG.
2. Generate key, verify digest-only storage, recover in a fresh browser, rotate and reject the old key.
3. Export through Settings. Preserve a 92,266-byte archive with SHA-256 `a875882c230d91bce30eff246ab1fa69e84f37e7535e6e4b5a802f3cb5be7e07`.
4. Initialize B with a fresh PostgreSQL data directory and storage root, fresh database/session credentials, no copied database, originals, cookies or recovery key. Copy only build/runtime files and separately configure test provider access.
5. Validate in browser; cancel leaves B empty. Import into B's current new identity; all source IDs/ownership change consistently.
6. Equal A/B counts: one workspace, three documents, one Agent run, 15 steps, one proposal, 22 tags, one relation, five chunks, five embeddings, one multimodal analysis and two archived retrieval runs. Original bytes remain SHA-identical; OCR/Vision and history remain available.
7. Actual Library, text/image Search and real grounded RAG work. Historical citations remap. Clicking a new citation opens the source pane; its authenticated original link returns the original bytes. Another identity gets 404.
8. Corrupt import is refused without new rows; repeat import skips all three documents and creates no workspace.
9. Restart B with 512 dimensions, import the original 1024-dimensional archive into another fresh identity, confirm stale indexes, perform real DashScope reindex, verify only 512-dimensional vectors and fresh RAG citations.

The source stage was completed once. After infrastructure failures, `--restore-only` resumed the exact archive and requires its hash and prior A recovery/provider assertions to agree. No algorithm or archive changes were used to improve quality. The existing Agent organization-plan fallback occurred and is recorded honestly: real document analyses supplied the deterministic review proposal. It did not substitute mock OCR, Vision, embeddings or RAG.

Evidence: [machine-readable A/B report](../evaluation/backup-portable-results.json), [verification script](../../scripts/verify-backup-portable.mjs).

## Engineering and interface verification

- `npm run build`: Next production compilation, TypeScript and portable postbuild pass. A transient Windows rename EPERM in postbuild passed on a full retry after confirming no project runtime processes were active.
- `npm run typecheck`: zero errors. `npm run lint`: zero errors/warnings.
- `npm test`: **69/69** unit/integration tests, including real English/Chinese OCR, FORCE RLS, frozen dataset integrity, recovery, strict archive validation and handled rollback/file cleanup.
- `npm run test:e2e`: **15/15** browser regressions. Backup UI transport cases are explicit mocks; actual export/import and provider recovery are separately demonstrated by the real A/B drill.
- `npm run test:portable`: **2/2** browser regressions, including real private PostgreSQL and portable startup/shutdown. Its token-hash mock does not provide semantics: citation plumbing uses an explicit quoted exact term; follow-up rewriting is checked from persisted history. The initial legacy test assumed semantic output from mock vectors and failed under the new gate; the offline test was corrected without changing production retrieval/evidence code or the holdout. An SSE response-body/navigation race in the new assertion was replaced by reading the saved result.
- Secret boundary: two configured API secrets checked against 33 final browser assets; none found.
- Desktop 1440 and mobile 390 Settings review: no horizontal overflow, readable recovery/backup states, truthful unencrypted notice and real validate/import controls. False demo messaging on a configured database and a wrapping decorative icon were corrected. Independent finish verdict: ship. [UI review](phase7-ui-review.md).
- `git diff --check`: passes. Only task-related files are committed. The pre-existing five user documents remain unchanged and unstaged.

## Git history and preserved work

Each reviewable implementation, evaluation and correction is committed and ordinarily pushed to `origin/main`; history is retained without rewriting. The delivery verifies zero ahead/behind. This phase does not stage the user's existing modifications in `README.md`, `docs/architecture/ai-provider.md`, `docs/architecture/persistence.md`, `docs/phase-checklists/phase4.md` or `docs/setup/postgresql-kimi.md` (unchanged 81 additions / 29 deletions). Competition-facing retrieval/backup details are supplied in dedicated architecture/evaluation documents while preserving that README work.

| Commit | Reviewable unit |
| --- | --- |
| `9f3bd2f` | Phase 7 scope and verification design |
| `fa120e7` | Vector-first routing and explainable evidence gates |
| `fad5e9a` | Secure recovery keys and identity Settings |
| `399f9aa` | Independent frozen 50-document / 100-query holdout |
| `a79b1c6` | Exact fixture bytes preserved across checkouts |
| `ab74bdd` | Frozen holdout metrics and two-case refusal regression |
| `d14b724` | Owned archive format and transactional restore |
| `0848315` | Bounded decompression, strict metadata and rollback hardening |
| `64c6d34` | Backup Settings/APIs and authenticated original citations |
| `8a980ff` | Real fresh-database restore evidence and offline regression corrections |

The final documentation commit adds this checklist, the interface verdict and completed architecture/limitations. Its hash is reported in the delivery message; this file cannot contain its own commit hash. All eleven Phase 7 commits preserve the earlier history.

## Known limits and Phase 8 boundary

- This is a 50-document synthetic holdout with only eight no-answer queries, short focused sources and hand-authored relevance. No calibrated confidence, gold routing accuracy, full answerable-refusal or factual-entailment audit is claimed. Future quality work needs a new blind dataset.
- Backup v1 is unencrypted and bounded in memory: 128 MiB compressed / 256 MiB expanded, 20 MiB per original. Current-identity merge only; no replace mode or remote synchronization.
- Handled failures are atomic; hard kill/power loss can leave private orphan/staging files. There is no persistent filesystem journal or automatic orphan cleanup.
- Recovery works only in the same database; a backup carries no identity authority. Database-wide throttling can temporarily block other users, appropriate to this portable single-user scope.
- Bundled Windows PostgreSQL fresh initialization failed when the executable/runtime path included Chinese characters (`invalid byte sequence for encoding UTF8`). Empty B uses an ASCII installation path. Earlier relocation of an already initialized Unicode-path database is a different acceptance case.
- Existing scanned-PDF/OCR, small-library cosine-scan and multimodal precision limits remain. No new automated scanned-PDF OCR or graph redesign was added.

The best next phase would harden reliability and evaluation: a fresh larger blind corpus including false refusals and factual entailment, crash recovery/journal cleanup, and Windows fresh initialization across installation paths. That recommendation is not authorization to start Phase 8.
