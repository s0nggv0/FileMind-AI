# Phase 6 — Multimodal Knowledge Ingestion & Retrieval Evaluation

Phase 6 implements owned image ingestion and a more demanding retrieval evaluation. It does not enter Phase 7. Only the dedicated FileMind portable PostgreSQL is used. Original files remain private and immutable, and organization still requires human Apply.

## Completed behavior

- Strict PNG/JPG/JPEG validation, dimensions, private original access and image detail.
- Separate `VisionProvider` / `OCRProvider`, real Kimi Vision Gate, portable Chinese/English OCR, explicit test-only MockVision.
- Independently cached image interpretation and OCR, failure fallback, labelled knowledge provenance and version invalidation.
- Agent `analyze_image`, real activity/usage, conservative rename suggestions and existing review/Apply.
- Image chunking, real embedding, lexical/vector/hybrid search, grounded answers, current-source citation validation and original-first source drawer.
- Cross-modal shared concepts/related documents, Library thumbnails/status, original/OCR/AI/concepts/tags detail, mobile full-size image link.
- 72 synthetic sources, 144 labelled questions, all four retrieval comparisons, per-type metrics, failure cases and Chunk/RRF experiments.
- Backup/import/identity recovery design in `../architecture/backup-recovery.md`; implementation belongs to a later phase.

## Real evidence

Gate: `vision-live-verification.md`, HTTP 200, Kimi / kimi-k2.6, schema-valid authored image analysis, measured request tokens and latency. Real image adapter/SDK 7 file content is also exercised by the final browser and hard evaluation.

`multimodal-live-browser.json` records the production-browser sequence: 3 actual image analyses plus text, human review/Apply, image indexes, unchanged-image cache reuse with zero repeat Vision requests, cross-modal Find, related text source, Transformer question/citation, byte-identical original, whiteboard question/original, cross-user original denial, refresh and mobile no overflow. OCR/AI sections are separate. Injection specimen is extracted as literal data without exposing credentials or authorizing dangerous tools. Vision-failure display is an explicitly injected API response; genuine pipeline fallback is separately unit tested.

The final UI correction is also exercised: one injected source-load 503 exposes a retry button, retry fetches the real source again and opens the original. Ranked passage previews are limited to three lines while the drawer retains complete evidence. Desktop/mobile captures disable entrance animations and wait for image decoding before review.

`multimodal-portable-copy.json` records the real whole-folder relocation: Windows Unicode/spaces path, no root `node_modules` or global Node/OCR, real cached Vision and independently rerun bundled OCR, original/analysis/chunk/vector/citation identity preserved, fresh text/image grounded searches, two simultaneously isolated database copies and clean shutdown. The test removes its synthetic records and temporary copy. Cookie/session secret moves with the folder for this test; it does not prove cross-device identity recovery.

## Retrieval results

Full reproducible results: `../evaluation/rag-hard-results.json` and method/interpretation: `../evaluation/rag-hard-evaluation.md`.

| Retrieval | Hit@1 | Hit@5 | MRR |
| --- | ---: | ---: | ---: |
| Vector | 0.942 | 0.992 | 0.964 |
| Lexical | 0.550 | 0.700 | 0.614 |
| Hybrid RRF | 0.733 | 0.975 | 0.818 |
| Hybrid + deterministic rerank | 0.700 | 0.975 | 0.800 |

Image-only Hit@5: 1.00 (12/12). Image grounded answers: 12/12. Returned citation validity: 19/19, verified against live source identity/content; this is not factual entailment accuracy. Final no-answer classification: 22/24 (0.917); cases `none-20` (missing sample-size value) and `none-23` (unrelated diagnosis) remain in the report. Hybrid's weakest categories are semantic, paraphrase and cross-language; it improves Lexical coverage but trails Vector. No per-query production special cases were added.

Keep target 800 estimated tokens, overlap 100 and RRF 60. The 24-question Chunk experiment gives Hit@5 0.875 / 0.958 / 0.958 for 400 / 800 / 1200. 800 has stronger first-hit and evidence coverage than 1200; 1200's MRR advantage is only 0.001. RRF 20/60/100 do not materially differ here.

## Verification

Production build passes with traced Sharp Windows DLLs, offline OCR worker/core/languages and relocated standalone. TypeScript passes. ESLint reports zero errors/warnings. The 61 unit/integration tests cover schemas, genuine Chinese/English OCR, cache/version invalidation, partial failures, image provenance, FORCE RLS, foreign sources, changed-chunk replacement, concept links across differing tags and one bounded citation format retry. Existing browser regression: 13/13. Dedicated portable browser regression: 2/2. The final scoped design verdict is recorded in `phase6-ui-review.md` after its correction round.

`scripts/verify-secret-boundary.mjs` passes: two configured secrets checked against 33 browser assets. Public reports omit request headers, keys and raw provider errors. Dependencies, originals, database/runtime/cache/build directories and screenshots are ignored by Git.

## Known boundaries and next phase

Automatic scanned-PDF page rendering/OCR is not implemented; low extracted text produces a warning, and exported PNG/JPEG scan pages work. OCR can confuse formulas, small text, skewed or photographed handwriting. Image type classification varies between screenshot/slide/diagram, so acceptance checks semantic content and validated output rather than an exact overlapping category label. Bounding boxes are stored, but citations identify an image/chunk without a precise region overlay. Cross-modal relationships use normalized tags/topics and saved text matches, not learned semantic relation scoring. Portable vectors remain a small-library exact cosine scan. LLM no-answer and factual correctness are imperfect; this synthetic benchmark is not a production guarantee.

Phase 7 should prioritize authenticated/recoverable identity and validated backup export/import. In retrieval work, use held-out data to calibrate no-answer and compare a learned reranker before changing fusion defaults. No Phase 7 implementation is started here.
