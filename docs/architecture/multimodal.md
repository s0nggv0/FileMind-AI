# Phase 6: multimodal knowledge

> Historical Phase 6 record. Phase 8 now serializes whole-workspace image preparation with the tenant storage lease, publishes replacement indexes atomically and checks factual support before releasing an answer. See [current system](system-overview.md) and [answer gate](answer-verification.md). Original/OCR/Vision source distinctions below still apply.

PNG, JPG and JPEG originals enter the same owned Workspace, review, Apply and index flow as text documents. The server checks extension, declared MIME, magic bytes, full decoding, 20 MB and 40 million pixel limits before accepting an image. SVG, animation and mismatched payloads are rejected. Private originals are served only through an authenticated document ID, with containment checks and no-store/nosniff headers.

## Two independent sources

`VisionProvider` and `OCRProvider` are separate interfaces. `MultimodalPipeline` runs them concurrently inside a process-wide bounded queue (default `VISION_CONCURRENCY=2`, maximum 3). Kimi Vision uses `kimi-k2.6` in instant mode with image bytes, no tools, an untrusted-image prompt and strict Zod output. Real Vision is enabled only after a successful Gate for the configured model and endpoint. `MockVisionProvider` accepts explicitly injected fixtures for tests; an unavailable Gate never silently substitutes it.

Portable OCR uses Tesseract.js 7, English and Simplified Chinese `4.0.0_best_int` language data and bundled WASM. It needs no Python, global OCR installation or runtime language download. Native path resolution avoids Turbopack virtual IDs. Windows Sharp DLLs, OCR workers, core and language packages are included in standalone tracing. OCR confidence is the engine's extraction score, not calibrated factual accuracy. Formulas and photographs may be misread.

Vision supplies image type, summary, topics, visible concepts, tags, conservative optional category/filename suggestions and confidence. OCR supplies visible extracted text and available bounding boxes. Neither output is claimed as a perfect transcript. The original remains available for verification. Filenames are metadata, not a substitute for reading the image.

## Knowledge and provenance

Merged knowledge has explicit `Image OCR · extracted text`, `Image Semantic Summary · AI interpretation` and `Detected Concepts · AI interpretation` sections. Their offsets and `chunkSource` survive chunking and retrieval. Image chunks never invent PDF pages, text line numbers or bounding-box precision. The source drawer opens the original first and separately shows cited evidence, OCR and AI interpretation. OCR blocks are stored, but citations currently identify the image/chunk rather than highlighting an exact box.

Chunks use the existing embedding queue, lexical index, PortableVectorStore, RRF and deterministic reranker. Search results label images; shared tags/concepts connect text and images through `shared_concept` relations and owned related-document links. Related links normalize tag punctuation and also match interpreted topics/tags to saved text, so different model tag wording does not alone hide a shared concept. Matching is bounded and tenant scoped. These links are rule based, not a learned similarity model. `semantic` is a supported future relation kind, not automatically claimed today.

Citation validation checks inline source markers, exact context IDs, document ID, tenant/workspace, current content, hash and chunk version against live persistence. A missing or mismatched marker can trigger one bounded regeneration from the same context; validation runs again. Expired evidence fails immediately. The server never invents a marker or repairs IDs to pass validation. Citation validity establishes provenance, not factual correctness.

## Persistence, cache and failures

`multimodal_analysis` stores separate OCR/Vision fields and the validated full record under FORCE RLS, linked to the owned document. Document columns store source type, dimensions and OCR/Vision states; chunks store provenance. Original bytes remain under `.filemind/storage`.

Vision cache keys include original content hash, provider, model and prompt version. OCR keys independently include hash, engine and language/engine version. Index-version changes mark indexes stale. Unchanged image analyses and vectors are reused; an offline session can retain previously verified Vision for the exact original. Content changes do not inherit that interpretation. Replacing changed chunks uses generation-checked deletion followed by insertion to avoid collisions at a reused chunk position.

When Vision fails but OCR succeeds, extracted text remains searchable with “Visual understanding unavailable. Text extraction succeeded.” When OCR fails, interpretation remains explicitly labelled. When both fail, the image is retained and the index records `NO_CONTENT`, rather than claiming it is searchable. Cache failures can be retried from the index controls. Run activity reports real metadata, extraction, understanding and concept work; Vision request/token usage is separate from text LLM usage.

## Scanned PDF boundary

PDF text extraction detects low-text pages and warns about a possible scanned document. Automatic PDF page rendering followed by OCR/Vision is not implemented in Phase 6. A scanned page exported as PNG/JPEG is supported by the image flow. The PDF warning must not be presented as completed scan ingestion.

## Verification commands

`npm run test:vision` uses one self-created image and records HTTP status, latency, usage and schema-validated analysis without credentials. `npm run test:multimodal-live` targets the dedicated running server on 3082 and uses synthetic images. `npm run evaluate:hard` runs the isolated live benchmark. These commands make paid provider requests. `npm run test:portable:copy` tests real Vision/OCR/embedding and whole-folder relocation; stop the current FileMind launcher first. No command targets Yunxiu PostgreSQL.
