# FileMind Backup and identity recovery design

Phase 6 defines the design only. It does not implement an Export/Import endpoint, account recovery, OAuth or a public backup-download button. Current whole-folder relocation requires stopping the FileMind launcher and its private PostgreSQL first. A folder copy contains private data and locally configured credentials; it is not a shareable backup archive.

## Archive format

A future `.filemind-backup` archive should contain a versioned manifest, owned workspace/document metadata, original objects, proposals/review decisions, multimodal analysis, chunks, embeddings and retrieval history. The manifest records schema and analysis versions, provider/model/dimensions, object sizes and SHA-256 hashes. It excludes API keys, session signing secrets, browser cookies, PostgreSQL administrator passwords and transient launcher/lock state. Indexes may be omitted in a smaller backup and rebuilt later.

Export should read a consistent database snapshot while selecting only the authenticated owner's rows. Originals are immutable and referenced by ID/hash. If any referenced original is missing or changes during export, the export must fail or explicitly list the missing object; it must never advertise a complete archive silently. Stream data to private temporary storage, verify the manifest, then expose a short-lived authenticated download. Define quotas, progress, cancellation and disk-space checks before implementing this workflow.

## Import and recovery

Import must validate archive size, entry count, decompression ratio, path traversal, links, MIME/signatures, manifest schema and hashes before touching live data. Restore into staging. Allocate new IDs and remap all ownership, document, relation, chunk and citation references in one planned transaction. Never accept a foreign user ID from the archive as authority. Detect duplicates by content hash and require an explicit merge/replace decision; default to a new Workspace. Only promote originals and database rows after verification succeeds, with a recoverable rollback journal for filesystem operations.

Compatible cached analysis and vectors may be reused only when original hashes, dimensions and provider/model/version match. Mark incompatible indexes stale and offer reindexing. Preserve historical retrieval evidence honestly; citations whose content/version no longer exists should become unavailable, not point to a different document.

The current signed Demo identity cookie is browser specific. A lost cookie cannot prove ownership. Phase 7 should add an explicit identity/recovery mechanism before remote imports or cross-device restore, for example authenticated accounts or a user-held recovery secret with a documented rotation/revocation flow. Keep this separate from API keys and never use a predictable Workspace ID as recovery authentication.

## Operational recovery

Prefer logical tenant-scoped archives for user backups. A physical portable PostgreSQL copy is an operator workflow: stop the correct dedicated instance, verify its resolved data directory, copy `.filemind/postgresql/data` and storage consistently, preserve the matching runtime and database version, and restart on a free loopback port. Never manipulate an unrelated PostgreSQL service.

Before shipping import, test clean restore, Unicode/spaces, missing objects, tampered hashes, malicious archive paths, interrupted promotion, incompatible vector models, foreign identity attempts and rollback. A successful restore should reproduce original bytes, analysis, proposals, vectors and citation identities, with an audit result the user can inspect. Encryption/passphrase design and key recovery must be settled before introducing portable encrypted archives.
