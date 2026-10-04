# Phase 8 — Reliability Hardening, Blind Evaluation & Competition Readiness

Status: complete within the user-revised scope, with measured quality limitations retained. The implementation design was approved by the user. Phase 9 has not started. Completion means the implementation, drills and immutable evaluation were delivered; it does not mean every blind quality case passed.

## Scope revision

The user explicitly cancelled Chinese installation-path work on 2026-10-03, because future installation directories will use ASCII paths. The earlier initialization reproduction remains in `docs/evaluation/phase8-path-reproduction.json`. The uncommitted manifest configuration experiment was withdrawn, and its disposable test database was stopped. No production runtime or database was changed by that experiment. Unicode installation-path support is a known limitation, not a passed acceptance item. The final portable-copy drill will use ASCII installation directories.

## Baseline and remaining acceptance

Baseline before implementation: 69/69 unit/integration tests, zero TypeScript errors and zero ESLint errors/warnings. Commit `87dbc24` contains the design and reproduction evidence. The five existing user document edits are preserved without staging or committing them.

| Requirement | Current status |
| --- | --- |
| Atomic writes, operation journal and tenant isolation | Implemented; final 81/81 unit/integration tests, clean TypeScript and ESLint. |
| Upload/Apply/Backup Import/Reindex/Internal Delete recovery | All five integrated; internal original removal commits metadata before quarantine and survives lost responses. No dangerous Delete UI. |
| Storage reconciliation, quarantine and missing-file states | Maintenance, Library and source preview implemented; isolated PostgreSQL browser acceptance passes at 1440/390 px. |
| Real import and reindex process-kill drills | 5/5 real termination windows pass on isolated PostgreSQL: three Import and two Reindex. |
| Fact verification, bounded repair and conflict detection | Release gate and bounded repair implemented. Real mixed Demo passes. Blind full conflict detection is 2/8; four gold-correct texts lack runtime conflict status, two refuse. Not a universal semantic correctness guarantee. |
| Provider failure matrix and Planner diagnostics | 12/12 labelled local fault cases pass; actual refused PostgreSQL HTTP/UI returns 503 with visible retry. Strict metadata logs and Planner reason metrics implemented; historical Phase 7 root cause is unavailable. |
| Demo data, reset, preflight and outage plan | 10 original fixtures / 8 recommended; dedicated scoped Reset and cancelled confirmation pass. Actual mixed-provider Demo passes; current-build preflight 12/12. Demo script and outage fallback documented. |
| Frozen new Blind Set and immutable Run #1 | Code/protocol 231-file freeze precedes new 90-document/180-query corpus. One formal run completed; all original outcomes retained. Same-agent synthetic authorship is explicitly disclosed, not external independent auditing. |
| Performance, memory and security regression | Actual SQL capacity through 5,000 chunks; twenty Agent and image runs; HTTP isolation 12/12; all 3 real-model text/image instruction attacks return gold-correct facts on read-only routes. |
| ASCII portable-copy product drill | Pass: ASCII, spaces, root length 178; bundled Node/PG, data and original/citation/image continuity, two separate active databases. |
| Final build, typecheck, lint and all browser/unit checks | Production build/portable postbuild pass; TypeScript 0, ESLint 0 errors/warnings, unit/integration 81/81, offline browser 17/17; actual PostgreSQL Maintenance, real Demo and portable-copy receipts retained. |
| Competition architecture, evaluation and scoring evidence | Complete under docs/competition, docs/architecture/system-overview.md, six additional ADRs and final-evaluation-summary.md. Existing root README/user edits preserved. |
| Chinese installation-path repair/matrix | Cancelled by user; retained known limitation |

Results are recorded only after the corresponding verification completes. A service outage or skipped test cannot be counted as a successful answer, refusal or acceptance.

## Recovery foundation

The owner-scoped journal stores bounded UUID/hash/path-intent metadata, stage, status, timestamps and public error codes. Production leases use separate PostgreSQL sessions and a separate pool, so idle lock owners cannot exhaust the business-transaction pool. Business data and `committed` must share one transaction. Failed commit acknowledgement never authorizes cleaning a persisted committed operation.

Writes use temporary files, file fsync, close and rename. Immutable originals then publish the durable staging file with an atomic no-replace hard link, retaining cross-process no-overwrite protection; staging is removed after publication. Windows testing verifies the old complete file survives a simulated ENOSPC before publication. This is fault injection, not an actual full disk or power-loss test.

Archive export now selects the existing format's explicit columns, excluding new installation-local storage health and operational fields. Existing Phase 7 backup compatibility is retained. Journal, upload/import integration, startup reconciliation and hard-kill acceptance are separate delivery units.

## Upload, Apply and Import recovery

Upload and Import persist destination intents before creating or publishing bytes. The workspace/database relationships and `committed` journal status share one business transaction. Apply uses the same transaction boundary, including browser-owned Mock runs. Import duplicate decisions share the tenant storage session lease with Upload and Maintenance. Failed or cancelled operations preserve their journal/profile and quarantine unreferenced bytes rather than deleting evidence. Referenced originals survive stale retries and lost responses after COMMIT.

Portable startup enumerates unfinished owners through its private local admin connection, then repairs through application-role tenant transactions and FORCE RLS. The Web role receives no administrator credentials. Ordinary servers recover only the authenticated tenant. A live PostgreSQL lease prevents takeover; a killed process releases its session lock. Quarantine manifests are durable before moving files and can themselves be repaired. Junction ancestors are rejected before creating child directories.

`npm run test:crash-recovery` tested a fresh ASCII-path PostgreSQL cluster, ten synthetic documents per import, and three actual process-termination windows. At 30% publication and before COMMIT, zero imported documents became visible and unreferenced bytes were quarantined. After COMMIT, all ten documents survived and only staging was quarantined. Existing source/target workspaces remained unchanged, active leases were preserved and repeat recovery did no further work. See `docs/evaluation/phase8-crash-results.json`. These are process crashes, not hard power-loss tests.

## Atomic index replacement

Chunks and each complete embedding batch are durably staged under `.indexes/<owner>/<build>/` and remain outside all online retrieval queries. Existing vectors can be copied into the private build only with matching model, dimension and hash. All staged data is checked before publication. The final transaction locks the document, rechecks source text/structure and build identity, replaces all online chunks/vectors, changes active index health and commits the journal. A database failure after the old chunks are deleted rolls the transaction back.

Active `index_status` and `index_build_status` are separate. A failed rebuild of unchanged source preserves the old ready index. An actual source change retains the previous stale invalidation safety rule. Without embeddings, a first build can publish a complete lexical index with explicit failed semantic health; no partial vector set is published. Historical evaluation harnesses now call the atomic pipeline and keep their existing freeze/no-overwrite gates and prior results unchanged.

The two real reindex termination windows covered 30% of a replacement build and the barrier before publication. PostgreSQL queries returned the same old vector source IDs and citations before and after recovery, and the build became interrupted. Retrying built a complete replacement with 22 chunks. Repeat recovery was idle. Maintenance browser acceptance covers the distinct active/build status with labelled state injection; actual crash safety is proved by the separate process-kill drills.

## Answer release gate

See `docs/architecture/answer-verification.md`. Claims, qualifiers, common numerical equivalences, citations and conflicts are checked before release. Citation and factual repairs share one regeneration; a judge outage is unavailable, not a refusal. The browser has no unverified draft state. Four bounded desktop/mobile screenshots were inspected without overflow. The real-provider harness creates a new empty PostgreSQL instance with new credentials, sends only its synthetic fixture to Kimi/DashScope, and stops and cleans only that instance. The five original user document edits remain untouched.

## Final formal quality result

See [full Phase 5–8 report](../evaluation/final-evaluation-summary.md), [immutable first-run result](../evaluation/rag-blind-run1-results.json) and [read-only audit](../evaluation/phase8-blind-analysis.json).

- Adaptive Hit@1/Hit@5/MRR: 1/1/1 over 136 relevant-document questions; image Hit@5: 37/37.
- No-answer: 36/36. Answerable false refusals: 8/136 (5.88%); gold/protocol answerable recall: 114/136 (83.82%). Released-answer coverage is a different 127/136 (93.38%).
- Returned citation identity/content validity: 169/169. Post-gate completeness/faithfulness: 378/378 claims from 127 released answers. These conditional metrics do not imply 100% full-question success.
- Full conflict detection: 2/8. B129/B131/B132/B135 text and citations passed gold but missed the runtime conflict record; frozen protocol still labels these four Incorrect Answer. Two conflict questions refused.
- Ambiguous clarification: 0/8; all eight refused. Their refusal outcomes are separate from the 136-question false-refusal-rate denominator.
- Unavailable: 10/180, comprising one runtime structured-output failure and nine gold-judge failures. Specific gold transport/schema/fact-count causes were not retained and cannot be inferred.
- Adaptive retrieval P50/P95 202.21/259.22 ms; verified RAG 5,658.74/14,321.07 ms over all 180 recorded wall-time samples, including fast refusals. Capacity and uncached Agent/image measurements have separate reports.

No Run #2, routing/no-answer/verification tuning or corpus rewrite followed these results. Future quality work needs independently reviewed cases and its own approved phase. The synthetic pattern distribution, shared model judge, linear scan, scanned PDF, OCR, unencrypted backup and ASCII installation scope remain public limitations.

## Delivery history and verification

The five original modified user documents retain their original SHA-256 bytes and were never staged. Git normal pushes preserve the full history; direct GitHub connectivity failed during delivery, then the existing Windows local proxy completed synchronization without changing the saved remote or Git configuration. Final status is checked after the final documentation commit.

| Commit | Reviewable delivery |
| --- | --- |
| 87dbc24 | Approved reliability design and original Unicode reproduction |
| d703d9f | User cancellation of Chinese installation-path work |
| d46f1c8 | Atomic writes and owner-scoped Operation Journal |
| e6176b0 | Upload/import recovery and durable quarantine |
| af1d59e | Private builds and atomic index publication |
| 33dc6c7 | Answer claim release gate and preserved sources |
| cb0f8f1 | Storage health UI and safe diagnostic metadata |
| e4aa2a2 | Provider degradation and real database-outage UI |
| 20dd3c6 | Dedicated Demo identity, scoped Reset and real preflight |
| dc5c8fe | Raw fixture byte rules |
| b5d5103 | Deterministic statement citations, serialized image preparation and retained failed development attempts |
| f14a0d6 | Frozen evaluation protocol, capacity and security drills |
| ddf9bad | Production/protocol source freeze before blind data |
| 4518872 | New 90-document/180-query frozen corpus |
| 489fce4 | Architecture, six ADRs and competition evidence guide |
| 453cdd0 | Final build, 81 tests, 17 browser tests and current-build preflight |
| 6977de0 | Immutable Run #1, all outcomes, post-run audit and final evaluation summary |

This checklist and the competition limitations are recorded in a final separate documentation commit. [Final check receipt](../evaluation/phase8-final-checks.json) records the applicable checks. Temporary instances use only self-authored data and are disposed by their own wrappers; private runtime/data, dependency caches and screenshots are excluded from Git. Phase 9 has not begun.
