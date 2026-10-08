# v1.0.0-rc.1 runtime and freeze guide

Build `f43575d` passed real-provider Conflict/Ambiguity samples, the flat context schema, the complete eight-file Demo without Planner fallback and 12/12 readiness on 2026-10-04. See [the release record and test scope](release-freeze.md). The initial six-request Phase 9 attempt failed and remains on record. Later targeted samples use a separate cumulative budget that includes failed attempts.

## Source checkout

Use Windows x64 and an ASCII path. Run `npm ci`, copy `.env.example` to `.env.local`, configure a dedicated PostgreSQL database and a ≥32-byte session secret, then migrate, build and start. Real mode requires Kimi/DashScope keys and the Vision verification marker. Keep keys, originals and runtime data private.

## Portable artifact

The archive in `phase9-release-artifact.json` contains an earlier build. The latest acceptance covers the current source build and a freshly copied portable runtime. Build and validate a new archive before distributing a ZIP.

The archive includes `.next/standalone`, bundled Node, bundled PostgreSQL binaries and license, migrations, launch/recovery scripts, original Demo fixtures, public competition materials and `.env.example`. It excludes `.env.local`, administrator credentials, storage originals, existing PostgreSQL data, logs, recovery keys, source dependency caches and user documents.

1. Extract into a new ASCII directory on Windows x64.
2. Run `start.ps1`. First startup creates a **new** dedicated local PostgreSQL instance and random credentials. No global Node or PostgreSQL installation is needed.
3. Open the local URL printed by the launcher. A fresh no-key Competition Mode supports local data but cannot answer with cloud AI.
4. Stop with `stop.ps1` before changing configuration. Add real Kimi/DashScope keys to the generated private `.env.local`, retaining launcher-created database/session values.
5. Use the existing `npm run test:vision` source-checkout workflow for an explicit Vision verification marker and copy only that marker into the artifact's private `.filemind` if deploying the same provider endpoint. This step calls Kimi. The current live acceptance used renewed user authorization; preserve the old Phase 9 request budget.
6. Run `preflight.ps1` while the intended web port is free. The portable compiled preflight performs the same twelve checks as `npm run demo:check`. Kimi/Vision/Embedding checks make actual service calls; missing keys fail without substituting Mock.
7. Require **12/12 READY** immediately before online Demo. Keep the new local preflight receipt private unless sharing its safe metadata intentionally.

The no-credential startup test began with a fresh database and checked empty Cleanup, workspace creation and persistence across restart. It copied no user data and called no cloud providers. Separate live tests cover 12/12 readiness, the main Demo, PDF/image citations and a scoped reset that preserved the ordinary owner. Recovery, Backup and five-reset results have their own historical records. The five backup questions were not all freshly verified.

## Frozen retrieval and UI

Retain `qwen3.7-text-embedding-flash` / 1024, `chunk-v1` (800 target / 1000 max / 100 overlap), vector/lexical top K 20, RRF K 60, candidate limit 15 and evidence limit 7. The deterministic Router, lexical tokenization, ranking, PortableVectorStore and EvidenceSufficiencyEvaluator are unchanged in Phase 9. The published snapshot includes file hashes; any intentional later fix requires a separate reviewed commit and evaluation record.

Keep the existing FileMind visual system; release fixes cover defects, copy, responsive layouts and accessibility. `COMPETITION_MODE=true` overrides `AI_ENGINE=mock`, `FILEMIND_DEBUG_UI=true` and `--mock`, and prevents saved laboratory runs from executing as real AI. During an outage, use saved and local functions and show the provider-unavailable message.

## Privacy and licenses

Backup ZIPs have checksums and validated identity relationships, but are not encrypted. The recovery key is a bearer credential. Windows runtime binaries carry their own licenses and every npm package has a recorded lockfile license. Project source is MIT. Runtime dependency audit has zero advisories; five High findings remain in the development ESLint/braces chain without an available patch. Downgrading Next ESLint to a different major solely to suppress this chain is not a safe release fix.
