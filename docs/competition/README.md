# FileMind AI

Turn scattered files into connected knowledge.

FileMind AI organizes personal documents and images. An Agent proposes categories, tags and filenames for review. Users can then search their saved library, ask questions and open the cited originals.

FileMind AI 整理个人文档和图片，提供可审阅的分类建议，并支持搜索、提问和原文核对。

Candidate version: v1.0.0-rc.1. On 2026-10-04, real-provider checks passed Conflict, Ambiguity, the flat context schema and the complete eight-file Demo, with `llm_success=1`, `fallback_count=0` and 12/12 READY. Results and test scope are in [the release record](release-freeze.md). Earlier failed attempts are retained separately. The older ZIP still needs to be rebuilt before distribution.

## Introduction

Students and researchers can import mixed materials into one saved library. FileMind preserves the originals and applies organization suggestions only after the user reviews them.

## Problem

An idea may appear in a lecture PDF, a project note and a classroom image. Remembering the idea often does not help locate its filename. Answers also need a way to check the original passage or diagram.

## Solution

FileMind extracts document text and image content, proposes organization changes and searches the current user's saved library. Answers include sources. Missing evidence, conflicting sources and ambiguous questions have separate result states.

## Features

- FileMind Agent shows tool activity and sends suggestions to Review before Apply.
- PDF, DOCX, Markdown and TXT parsing, plus PNG/JPG image understanding and local OCR.
- Semantic and lexical retrieval use a Router that selects a strategy for each query.
- Grounded answers, source locations, clickable citations and original-file previews.
- Knowledge Graph from saved document relationships and concepts, plus reviewed cleanup suggestions.
- Private PostgreSQL persistence, scoped recovery, integrity-checked backup and Windows portable runtime.

## Models and processing

Kimi `kimi-k2.6` handles structured analysis, Agent planning, grounded generation and fact checking. Kimi Vision and bundled Tesseract provide separate image interpretation and visible-text extraction. DashScope `qwen3.7-text-embedding-flash` provides independent 1024-dimensional embeddings. Credentials remain server-side. See [one-page architecture](architecture.svg).

## Agent workflow

After local parsing, the Agent calls registered tools and produces a structured proposal. The user reviews it before Apply saves the Library and index. Tool inputs and outputs are validated; the Agent has no arbitrary shell, browser or deletion tools. Failures preserve the workspace and offer a retry.

## Answer pipeline

Retrieval first limits evidence to the current owner. The pipeline checks question scope and source differences, generates a draft, then validates citation identity, freshness and factual support. A failed check can use one repair attempt. Only a checked result reaches the browser. Clarification returns choices; selecting one resolves server-stored document IDs and retrieves again.

## Images and OCR

Image sources preserve the original image, OCR text and separately labelled AI interpretation. OCR can continue locally during a Vision outage. Failed extraction does not produce fabricated searchable content. Text-layer PDFs are supported; automatic scanned-PDF page rendering is outside the current scope.

## Retrieval strategy

In Phase 6, Vector Hit@1 was 0.942 and fixed Hybrid Hit@1 was 0.733. FileMind uses question features to choose a retrieval strategy. The Phase 7 holdout measured Adaptive Hit@1 0.9674, Hit@5 1.0 and MRR 0.9837. Phase 9 kept the model, chunk settings, Router, VectorStore, RRF and evidence thresholds frozen.

## Safety checks

Organization changes require approval. Uploaded content is treated as untrusted data, tools are restricted, and answers pass ownership, citation, numerical and factual checks. The pipeline can report insufficient evidence, show source conflicts or ask for clarification. These checks cover specific failure cases and still need human source review. Competition Mode requires real AI, disables development controls and reports cloud failures.

## Evaluation

| Dataset / measurement | Result | Scope |
| --- | --- | --- |
| Phase 8 Blind Run #1 | 90 documents / 180 queries | New synthetic corpus after algorithm freeze, same-agent authorship disclosed |
| Adaptive Hit@1 / Hit@5 / MRR | 1.0000 / 1.0000 / 1.0000 | 136 relevant-document questions |
| No-answer | 36/36 | Gold no-answer questions |
| False refusal / answer recall | 8/136 (5.88%) / 114/136 (83.82%) | Both remain part of the published result |
| Multimodal Hit@5 | 37/37 | Image-only question subset |
| Citation validity | 169/169 | Returned citations |
| Post-publication completeness / faithfulness | 378/378 claims | Automated checks, conditional on 127 released answers |
| Full conflict / ambiguity | 2/8 / 0/8 | Original Phase 8 weaknesses, never overwritten |
| Phase 9 local targeted pipeline | 10/10 conflicts, 10/10 clarification cases | Scripted transport decisions, not real-model accuracy |
| Phase 9 initial live samples | Failed | Six calls exhausted; invalid structured output preserved |
| Release live acceptance, 2026-10-04 | Passed | Separate Conflict/Ambiguity samples and eight-file main Demo; 12/12 preflight |

See [Phase 5-8 evaluation](../evaluation/final-evaluation-summary.md) and [targeted regression](../evaluation/phase9-targeted-regression.md). Local pipeline tests and real-model checks have separate denominators.

## System architecture

Next.js App Router + React + TypeScript; server Route Handlers; FileMind Agent and tool registry; local document pipeline; Kimi/Vision/OCR/Embedding layer; retrieval and verification; PostgreSQL with FORCE RLS; private originals and PortableVectorStore. Operation Journal and atomic writes support recovery. [Architecture diagram](architecture.svg) and [technical report](technical-report.pdf) describe the boundaries.

## Quick start

Use an ASCII installation directory on Windows x64, Node.js ≥22.13 and a dedicated PostgreSQL database. The bundled runtime is an alternative to global installations; PostgreSQL runtime binaries are distributed in the private release artifact, not Git.

```powershell
npm ci
Copy-Item .env.example .env.local
# Configure DATABASE_URL, WORKSPACE_SESSION_SECRET and real provider credentials.
npm run db:migrate
npm run build
npm start
```

For competition, set `AI_ENGINE=llm`, `COMPETITION_MODE=true`, `DEMO_MODE=true`, real Kimi/DashScope credentials, and the existing verified Vision marker. `npm run portable:start -- --port 3000` starts the bundled Windows runtime after the private artifact is prepared. It initializes a new dedicated local instance when needed. Keep the `.env.local`, recovery key, database and originals outside the public repository. Follow [deployment and runtime guide](release-guide.md) for the actual package structure and negative offline acceptance.

## Demo

Ten original fixtures, with eight recommended for the main Demo, cover PDF/DOCX/Markdown/TXT/PNG/JPG. Open the dedicated Competition Demo Workspace in Settings and download its fixture ZIP. Use the [main script](demo-script.md), [video script](video-script.md), [12-slide pitch outline](pitch-deck-outline.md) and [outage plan](fallback-demo.md). The current-source main Demo passed on 2026-10-04. Five backup queries are listed separately with their evidence and acceptance status; they were not all freshly verified.

## Privacy

Parsing and OCR run locally. Real AI mode sends extracted text to Kimi, image bytes to Kimi Vision and index/query text to DashScope. Private storage and PostgreSQL isolate browser identities; TLS and filesystem permissions remain deployment responsibilities. Recovery keys act as bearer credentials. Backups are integrity-checked ZIP archives and **not encrypted**.

## Limitations

The flat context schema passed real Kimi checks on 2026-10-04, after the failed six-call attempt. The new targeted samples used 16 of their separate 24-call budget, including failures; they do not establish an overall accuracy rate. Extra backup queries and a new full regression were outside that acceptance. PortableVectorStore uses a linear scan, scanned PDFs need a text layer, and OCR/Vision can misinterpret content. Provider outages affect answers. The synthetic evaluation and shared model used for generation and judging limit how far its scores can be generalized. OAuth, multi-user collaboration, cloud sync, payments and a mobile application are not implemented. Unicode installation paths remain outside this release's supported scope.

## Team

Repository maintainer: `s0nggv0`. Team name, school, members and roles remain to be filled in before submission. [Repository](https://github.com/s0nggv0/FileMind-AI) · [MIT license](../../LICENSE).
