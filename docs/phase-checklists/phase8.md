# Phase 8 — Reliability Hardening, Blind Evaluation & Competition Readiness

Status: in progress. The implementation design was approved by the user. Phase 9 is outside this task.

## Scope revision

The user explicitly cancelled Chinese installation-path work on 2026-10-03, because future installation directories will use ASCII paths. The earlier initialization reproduction remains in `docs/evaluation/phase8-path-reproduction.json`. The uncommitted manifest configuration experiment was withdrawn, and its disposable test database was stopped. No production runtime or database was changed by that experiment. Unicode installation-path support is a known limitation, not a passed acceptance item. The final portable-copy drill will use ASCII installation directories.

## Baseline and remaining acceptance

Baseline before implementation: 69/69 unit/integration tests, zero TypeScript errors and zero ESLint errors/warnings. Commit `87dbc24` contains the design and reproduction evidence. The five existing user document edits are preserved without staging or committing them.

| Requirement | Current status |
| --- | --- |
| Atomic writes, operation journal and tenant isolation | Implemented; 72/72 offline tests pass, TypeScript and ESLint clean. |
| Upload/Apply/Backup Import/Reindex/Internal Delete recovery | Upload, Apply, Import and Reindex integrated; launcher and authenticated-tenant startup recovery implemented. Internal Delete remains pending. |
| Storage reconciliation, quarantine and missing-file states | Reconciliation and durable quarantine implemented and tested; Maintenance and Library/Preview UI remain pending. |
| Real import and reindex process-kill drills | 5/5 real termination windows pass on isolated PostgreSQL: three Import and two Reindex. |
| Fact verification, bounded repair and conflict detection | Implemented; 76/76 unit tests, 17/17 offline browser tests and isolated real Kimi/DashScope browser acceptance pass. Full blind conflict metrics remain pending. |
| Provider failure matrix and Planner diagnostics | Implementation pending |
| Demo data, reset, preflight and outage plan | Implementation pending |
| Frozen independent Blind Set and immutable Run #1 | Deferred until production and harness freeze |
| Performance, memory and security regression | Verification pending |
| ASCII portable-copy product drill | Verification pending |
| Final build, typecheck, lint and all browser/unit checks | Verification pending |
| Competition architecture, evaluation and scoring evidence | Documentation pending |
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

The two real reindex termination windows covered 30% of a replacement build and the barrier before publication. PostgreSQL queries returned the same old vector source IDs and citations before and after recovery, and the build became interrupted. Retrying built a complete replacement with 22 chunks. Repeat recovery was idle. Browser acceptance of the separate build/active status remains pending.

## Answer release gate

See `docs/architecture/answer-verification.md`. Claims, qualifiers, common numerical equivalences, citations and conflicts are checked before release. Citation and factual repairs share one regeneration; a judge outage is unavailable, not a refusal. The browser has no unverified draft state. Four bounded desktop/mobile screenshots were inspected without overflow. The real-provider harness creates a new empty PostgreSQL instance with new credentials, sends only its synthetic fixture to Kimi/DashScope, and stops and cleans only that instance. The five original user document edits remain untouched.
