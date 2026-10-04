# v1.0.0-rc.1 runtime and freeze guide

Current source build `f43575d` passed the newly authorized real-provider Conflict/Ambiguity samples, flat context schema, complete eight-file Demo without Planner fallback, and 12/12 readiness. See [the release freeze and verification scope](release-freeze.md). The exhausted six-request Phase 9 budget and its failed receipts remain unchanged; the current samples have their own cumulative budget and retained failure history.

## Source checkout

Use Windows x64 and an ASCII path. `npm ci`, copy `.env.example` to `.env.local`, configure a dedicated PostgreSQL database and a ≥32-byte session secret, migrate, build and start. Real mode requires the configured Kimi/DashScope keys and Vision verification marker. Keys, originals and runtime data stay private. The five pre-existing user document edits remain outside Phase 9 commits.

## Portable artifact

The archive recorded in `phase9-release-artifact.json` retains its earlier build and historical validation. This freeze validates the current source build and its freshly copied portable runtime. Regenerate and validate an archive from this build before distributing a new ZIP.

The archive includes `.next/standalone`, bundled Node, bundled PostgreSQL binaries and license, migrations, launch/recovery scripts, original Demo fixtures, public competition materials and `.env.example`. It excludes `.env.local`, administrator credentials, storage originals, existing PostgreSQL data, logs, recovery keys, source dependency caches and user documents.

1. Extract into a new ASCII directory on Windows x64.
2. Run `start.ps1`. First startup creates a **new** dedicated local PostgreSQL instance and random credentials. No global Node or PostgreSQL installation is needed.
3. Open the local URL printed by the launcher. A fresh no-key Competition Mode supports local data but cannot answer with cloud AI.
4. Stop with `stop.ps1` before changing configuration. Add real Kimi/DashScope keys to the generated private `.env.local`, retaining launcher-created database/session values.
5. Use the existing `npm run test:vision` source-checkout workflow for an explicit Vision verification marker and copy only that marker into the artifact's private `.filemind` if deploying the same provider endpoint. This step calls Kimi. The current live acceptance used renewed user authorization; preserve the old Phase 9 request budget.
6. Run `preflight.ps1` while the intended web port is free. The portable compiled preflight performs the same twelve checks as `npm run demo:check`. Kimi/Vision/Embedding checks make actual service calls; missing keys fail without substituting Mock.
7. Require **12/12 READY** immediately before online Demo. Keep the new local preflight receipt private unless sharing its safe metadata intentionally.

The current no-credential startup receipt proves fresh initialization, empty real Cleanup, workspace creation and persistence across restart without copying user data or calling cloud providers. Separate current live receipts prove 12/12 readiness, the complete main Demo, PDF/image citations and a scoped reset preserving the ordinary owner. Historical Recovery, Backup and five-reset receipts remain separate; the five backup questions were not all freshly verified.

## Frozen retrieval and UI

Retain `qwen3.7-text-embedding-flash` / 1024, `chunk-v1` (800 target / 1000 max / 100 overlap), vector/lexical top K 20, RRF K 60, candidate limit 15 and evidence limit 7. The deterministic Router, lexical tokenization, ranking, PortableVectorStore and EvidenceSufficiencyEvaluator are unchanged in Phase 9. The published snapshot includes file hashes; any intentional later fix requires a separate reviewed commit and evaluation record.

UI uses the existing FileMind visual system. Subsequent work is restricted to bug, copy, responsive and accessibility fixes. `COMPETITION_MODE=true` wins over `AI_ENGINE=mock`, `FILEMIND_DEBUG_UI=true` and `--mock`; saved laboratory runs cannot execute as real AI. Plan B uses real saved/local functionality and visible provider-unavailable messaging.

## Privacy and licenses

Backup ZIPs have checksums and validated identity relationships, but are not encrypted. The recovery key is a bearer credential. Windows runtime binaries carry their own licenses and every npm package has a recorded lockfile license. Project source is MIT. Runtime dependency audit has zero advisories; five High findings remain in the development ESLint/braces chain without an available patch. Downgrading Next ESLint to a different major solely to suppress this chain is not a safe release fix.
