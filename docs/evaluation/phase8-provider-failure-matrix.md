# Phase 8 provider failure matrix

All 12 local matrix cases passed. [Machine-readable results](phase8-provider-failures.json) identify each fault mode and observed outcome. No actual remote provider outage was induced and the matrix made zero external calls. Successful paid-provider acceptance is separately recorded in [isolated real RAG browser results](phase8-rag-live-browser.json).

| Fault | Method | Observed behavior |
| --- | --- | --- |
| Kimi unavailable / timeout / invalid response | Injected 503, TimeoutError and malformed structured completion through the production SDK adapter | No answer released; sources retained; public error code distinguishes failures. |
| DashScope unavailable / timeout | Injected transport failure through the production adapter and retrieval engine | Semantic unavailable; lexical evidence returned. |
| Vision unavailable | Injected Vision 503 with an actual bundled Tesseract worker reading the synthetic image | OCR text remains searchable. |
| OCR worker failure | Injected worker initialization rejection; labelled Vision fixture | Vision-only knowledge remains labelled AI interpretation. |
| Both image providers unavailable | Both production providers have injected failures | No content-search claim or manufactured extracted text. |
| PostgreSQL unavailable | Actual refused loopback connection, then production HTTP/UI against an unused loopback database port | API returns 503; visible route fallback with reload and navigation; no false save. |
| Storage read-only / disk full | Simulated EACCES / ENOSPC at the atomic publication barrier in disposable files | Failure propagates and complete old bytes survive. |
| Corrupt document | Invalid synthetic DOCX through the actual Mammoth parser | Rejected before parsed content publication. |

The database HTTP/UI drill also passed; see [result](phase8-database-outage.json). It never stopped or modified an existing database. Library and authenticated Settings use the product route error boundary because tenant startup recovery also needs PostgreSQL. The first harness attempts used an incorrect button label and incorrectly expected the Settings component to render despite startup recovery failing; correcting the harness resolved both without changing production code.

Run `node node_modules/tsx/dist/cli.mjs scripts/verify-provider-failures.ts` and `node scripts/verify-database-outage.mjs` after building. The reports are development acceptance evidence. They are separate from frozen blind-quality evaluation and from the actual process-kill recovery drills. These tests do not prove hard power-loss durability, all operating-system permission modes, or an actual full disk.
