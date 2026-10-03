# Phase 8 — Reliability Hardening, Blind Evaluation & Competition Readiness

Status: in progress. The implementation design was approved by the user. Phase 9 is outside this task.

## Scope revision

The user explicitly cancelled Chinese installation-path work on 2026-10-03, because future installation directories will use ASCII paths. The earlier initialization reproduction remains in `docs/evaluation/phase8-path-reproduction.json`. The uncommitted manifest configuration experiment was withdrawn, and its disposable test database was stopped. No production runtime or database was changed by that experiment. Unicode installation-path support is a known limitation, not a passed acceptance item. The final portable-copy drill will use ASCII installation directories.

## Baseline and remaining acceptance

Baseline before implementation: 69/69 unit/integration tests, zero TypeScript errors and zero ESLint errors/warnings. Commit `87dbc24` contains the design and reproduction evidence. The five existing user document edits are preserved without staging or committing them.

| Requirement | Current status |
| --- | --- |
| Atomic writes, operation journal and tenant isolation | Foundation implemented; 71/71 offline tests pass. Operation integrations and physical process-kill verification remain pending. |
| Upload/Apply/Backup Import/Reindex/Internal Delete recovery | Implementation pending |
| Storage reconciliation, quarantine and missing-file states | Implementation pending |
| Real import and reindex process-kill drills | Verification pending |
| Fact verification, bounded repair and conflict detection | Implementation pending |
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
