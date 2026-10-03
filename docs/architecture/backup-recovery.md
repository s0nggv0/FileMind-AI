# Identity recovery and verified backup

Phase 7 implements two independent operations. Recovery Key restores an existing identity in the **same database** after a browser cookie is lost. A `.filemind-backup` restores knowledge data into the current signed identity, including a new identity in an empty installation. A key cannot recover a lost database; an archive carries no authentication authority.

## Recovery Key

`crypto.randomBytes(32)` generates 256 random bits encoded as `fm-recovery-v1-<base64url>`. Settings → Identity & Recovery displays the key once, with Copy, Download recovery note and dismissal. It stays only in component memory; refresh cannot retrieve it. PostgreSQL stores its SHA-256 digest and configuration time, never plaintext. Status returns neither a profile ID nor a key. Recovery issues the existing HMAC-SHA-256 signed, HTTP-only, SameSite Strict cookie; HTTPS production uses Secure, while the explicit portable loopback setting disables Secure.

Invalid, malformed, absent and unknown keys use `Recovery key is invalid.` Throttling returns the same message with HTTP 429 and Retry-After. The conservative limit is **ten attempts per fifteen minutes across the database**, atomically counted in PostgreSQL. Forged proxy headers, cleared cookies, multiple processes and server restarts cannot reset it. On a shared service one client could temporarily block other recoveries; this design targets the single-user portable product. Authentication tables have no PUBLIC grants and are exposed only to the trusted server role. Knowledge tables retain FORCE RLS.

Creating a key refuses to silently replace one. Rotation requires a valid current identity and replaces the digest in one statement; the old key immediately fails. Possession of either a current cookie or recovery key grants identity access. No email, account/password system or remote synchronization is introduced.

## Archive version 1

The `.filemind-backup` container is ZIP, produced by `fflate`. It is **not encrypted**. Settings says “Backup contains your original files and knowledge data” and asks users to store it securely.

```text
manifest.json
manifest.sha256
data/profile.json
data/workspaces.json
data/documents.json
data/agent-runs.json
data/agent-steps.json
data/proposals.json
data/tags.json
data/relations.json
data/chunks.json
data/embeddings.json
data/multimodal.json
data/retrieval-runs.json
files/<original-document-uuid>.<extension>
```

Profile metadata includes only `created_at`. Export selects all eleven owned knowledge tables in one repeatable-read transaction. Snapshots, Agent steps/results, proposals, review decisions, tags, relations, chunks, vectors, retrieval history, citations, OCR blocks, Vision interpretation and original bytes are included. Owner fields are removed and private paths become archive-local paths. Authentication tables are excluded by an explicit table/column allowlist. No API key, Recovery Key, cookie, signing secret, database password, `.env`, server configuration or logs are exported. A physical whole-folder copy remains a separate operator workflow that can contain credentials.

The strict manifest records format/version, creation time, FileMind/schema/chunk versions, embedding provider/model/dimensions, Vision provider/model/analysis/prompt versions, counts, SHA-256 entry checksums and `encrypted: false`. Each original must match its saved byte size and hash; missing/changed originals abort export. Every metadata/original entry has a digest. `manifest.sha256` hashes the exact manifest bytes without a self-reference. The listed and actual entries must match exactly. Export self-validates before delivery and streams actual steps: Preparing metadata → Collecting files → Generating manifest → Calculating checksums → Packaging → Completed. No invented percentage is displayed. Last backup is recorded only after a complete package was generated.

Checksums detect corruption, **not authenticity**: someone who edits data and recomputes all hashes can produce another structurally valid archive. Schemas, references, ownership and private storage boundaries still treat it as untrusted.

## Validate before importing

`validateBackup()` performs no import or filesystem extraction. Settings shows version, creation time, workspace/document/file/image/chunk counts, model, duplicates and compatibility, then Import / Cancel. Import repeats validation against the supplied bytes; a previous preview grants no authority. Invalid imports are rejected before identity creation or database/filesystem writes.

Before decompression the ZIP envelope checks central/local names and lengths, entry counts, unsupported/encrypted methods, overlapping offsets and multi-disk/ZIP64 formats. Duplicate names, absolute paths, `../`, Windows drive paths, backslashes and Unix symlinks are refused. Names are restricted to fixed metadata paths or UUID original names, and never become destination filesystem paths. Private storage separately rejects symlinks and public directories.

Limits: 128 MiB compressed archive, 256 MiB total uncompressed bytes, 64 MiB per metadata entry, 20 MiB per original, 12,000 entries, 100,000 rows per table, nesting depth 32 and declared expansion ratio 1,000. Native zlib decompression has an actual output limit per entry, so lying about an expanded size cannot bypass the quota. Actual decompressed lengths must agree. Future formats return `This backup format is newer than this FileMind version.` The implementation is finite and in-memory, suitable for these limits rather than arbitrarily large libraries.

Validation covers exact columns, required fields, primitive/domain types, prototype-key rejection, unique IDs, workspace/document/run/chunk references, nested proposal/run/step references, citations, original names/extensions/bytes/hashes, chunk content hashes and finite vector dimensions. Unknown foreign ownership is never accepted.

## Transactional restore

1. Validate the entire archive, then stage originals privately under `.imports/<random-uuid>`.
2. Begin one tenant-scoped transaction with a per-identity advisory lock for duplicate decisions.
3. Compare original `content_hash`: skip duplicates by default, or retain copies when the user unchecks that option. Never overwrite existing rows/files.
4. Generate new IDs for every imported workspace, document, run, step, proposal, relation, chunk, vector and retrieval run. Remap foreign keys, snapshot text keys, evidence ownership and citation IDs together. Reassign all rows to the current signed identity. Preserve filenames, summaries and content even when text resembles a UUID.
5. Publish originals only to generated UUID destinations. Insert all metadata and check references/cancellation before commit.
6. On file-copy, schema, foreign-key, transaction or cancellation failure, roll back all metadata and remove new published originals and staging. Existing data is untouched.

When every document in a nonempty archived workspace is skipped, that workspace/history is also skipped. Partial skips prune related steps, proposals, relations, duplicate groups and retrieval runs referencing skipped chunks. Existing duplicates are never attached to a new workspace's composite foreign keys. Originally empty workspaces remain restorable.

Filesystems and PostgreSQL do not share a distributed transaction. Handled failures leave no half restore. A hard process kill or power loss can leave private orphan/staging files while PostgreSQL rolls back; version 1 has no persistent filesystem journal or automatic orphan janitor. Such files are not exposed as live metadata.

## Models and citations

Vector reuse requires the same provider, model, dimensions and chunk version, including each vector row. Incompatible vectors are preserved historically and documents become `index_status = stale`; active retrieval excludes them. Settings offers Reindex restored knowledge, replacing the old chunks/vectors with the configured model space. Interrupted chunking/embedding also becomes stale.

Vision reuse checks provider, model, analysis and prompt versions. Incompatible interpretation is retained as stale historical metadata and can be analyzed again. OCR/Vision cache keys remain bound to original hashes and provider/engine versions; normal index preparation also rechecks OCR compatibility.

Restored retrieval history remaps evidence/citation ownership and IDs. New answers retain strict database identity/content checks. Non-image source panes can open originals through a cookie-authenticated endpoint with hash verification, no-store, nosniff and sandbox headers. PDF/TXT/MD and images open inline; DOCX downloads as an attachment. Foreign browsers receive 404. Image sources retain original/OCR/Vision inspection.

## Verification

Backup unit tests cover FORCE RLS, all owned tables, empty/current-identity restore, duplicates, remapping, search/citations, model and Vision mismatch, reindex, corrupt metadata/files/manifest, future versions, unsafe paths, symlinks, dangling references and interrupted rollback/file cleanup. Recovery tests cover digest-only storage, valid/invalid recovery, rotation and persistent rate limits. Browser tests cover preview, cancellation, download stages and corrupt-backup errors.

The explicit real-provider drill is `node scripts/verify-backup-portable.mjs` after starting the built source on port 3083. It uploads PDF + TXT + image in a browser, runs real Agent/OCR/Vision/Embedding/RAG, exports through Settings, initializes a new PostgreSQL data directory and storage root with fresh credentials, then imports through Settings. It copies runtime/build files, never database data, originals, cookies or recovery credentials. It checks Library, restored analysis/history, Search/RAG, original-file citations, corrupt import refusal, duplicates and real 512-dimensional reindex after a deliberate mismatch. Results are retained in `docs/evaluation/backup-portable-results.json`. An existing organization-plan fallback is recorded separately and cannot replace required real OCR/Vision/Embedding/RAG assertions.

The restore drill resumes the exact verified A archive after infrastructure failures with `--restore-only`; its SHA-256 must match the preceding report, and the A recovery/provider assertions must already have passed. This avoids repeating paid analysis while preserving which checks actually ran. It does not change the archive or retrieval algorithm.

Limits: unencrypted archive; quota-bounded in-memory processing; merge into current identity only; no replace mode, cloud sync, cross-database key recovery or crash-cleanup journal. The bundled Windows PostgreSQL runtime failed fresh initialization when its executable path contained Chinese characters (`invalid byte sequence for encoding UTF8`); the new-environment restore uses an ASCII installation path. This differs from relocation of an already initialized database. Model compatibility and evidence confidence are not claims of universal correctness.
