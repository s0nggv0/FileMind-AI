# Phase 7: Adaptive Retrieval, Identity Recovery & Verified Backup

User scope: the complete Phase 7 specification supplied on 2026-10-03. This document records implementation choices within that scope.

## Delivery units

1. Deterministic QueryAnalyzer and RetrievalRouter. Semantic and ambiguous queries use vectors; exact and mixed queries add lexical candidates with RRF k=60; code/identifier queries prefer lexical with vector fallback; filenames use filename search. Embedding errors use lexical fallback. The existing reranker remains experimental and defaults off. An explainable evidence gate combines retrieval strength, gap, count, diversity and the structured model decision. Development debug shows only public routing signals.
2. Recovery keys: 256 random bits, SHA-256 digests only, one-time display/download, atomic rotation, uniform invalid responses and persistent rate limiting. Recovery issues the existing signed HTTP-only identity cookie within the same database. No account system.
3. Backup format v1: ZIP with `.filemind-backup` extension, identity-neutral profile metadata, every user-owned relational table, original files, SHA-256 checksums and a separately hashed manifest. Strict path/type/size/reference checks run before import. Restore into the current identity, with new IDs throughout, synchronized references, default duplicate skipping and no overwrite. Database import is one transaction; originals are staged and published before commit, with cleanup on failure. Incompatible embeddings are retained as historical data and excluded from live retrieval through stale status until reindex. Vision compatibility includes model, analysis version and prompt version. Backups are unencrypted and clearly disclosed.
4. Independently authored holdout: 50 documents including TXT, Markdown, DOCX, PDF and eight images; 100 queries spanning the required categories. Freeze router and fixture digest before the first live evaluation. Report all results, no retuning using holdout. Recheck the two Phase 6 no-answer failures separately against the original development corpus.
5. Settings uses the existing visual system and adds recovery and backup controls, validation preview, real export stages and meaningful errors. Browser tests exercise recovery in a fresh context, rotation, damaged backup rejection, duplicate skipping, model mismatch and restored sources. A portable restore drill uses a fresh data directory and verifies search, grounded answers and citations.

## Boundaries and verification

Preserve the five existing user document changes. Commit and push each verified delivery unit without rewriting history. Read installed Next.js route, cookie and authentication guides before implementation. Run unit/integration tests for routing, evidence, RLS, recovery, archive validation, reference remapping and transactional rollback; then browser, live provider, portable restore and holdout evaluation. Finish with build, TypeScript, lint, secret boundary and branch synchronization checks. Record any failed or unavailable real verification explicitly.

No OAuth, passwords, synchronization, collaboration, encryption, public deployment, PDF OCR fallback or Phase 8 implementation.
