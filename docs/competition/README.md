# FileMind AI

**Turn scattered files into connected knowledge.**

FileMind AI transforms scattered personal files into an intelligent, searchable and connected knowledge space using AI Agents, multimodal understanding and citation-grounded RAG.

FileMind AI 通过 AI Agent、多模态理解与可引用 RAG，将散乱的个人数字资料转化为可理解、可搜索、可关联的个人知识空间。

This competition README is separate to preserve five existing uncommitted documents, including the root README. Candidate version: **v1.0.0-rc.1**. The newly authorized real-provider acceptance passed Conflict, Ambiguity, the flat context schema, and the complete eight-file Demo with `llm_success=1`, `fallback_count=0` and **12/12 READY**. See [the current release freeze](release-freeze.md). Earlier failed Phase 9 receipts remain historical evidence.

## Introduction

A personal knowledge space for students and researchers. Import mixed materials, watch FileMind Agent propose organization, review its decisions, and ask questions with clickable sources. The application preserves originals and makes the user's approval part of the workflow.

## Problem

Useful knowledge is spread across lecture PDFs, project documents, Markdown notes and classroom images. A user may remember an idea while forgetting its filename. Filename search cannot connect the same concept across these formats, and unsupported AI answers make the result hard to trust.

## Solution

FileMind connects document understanding, reviewed organization and source-grounded answers. It proposes categories, tags, names and relationships, then searches only the current user's saved knowledge. It distinguishes supported answers, absent evidence, source conflicts and questions needing clarification.

## Core Features

- FileMind Agent with visible tools and human Review → Apply.
- PDF, DOCX, Markdown and TXT parsing, plus PNG/JPG image understanding and local OCR.
- Semantic and lexical retrieval, with an evaluation-driven adaptive Router.
- Grounded answers, source locations, clickable citations and original-file previews.
- Knowledge Graph from saved document relationships and concepts, plus reviewed cleanup suggestions.
- Private PostgreSQL persistence, scoped recovery, integrity-checked backup and Windows portable runtime.

## AI Architecture

Kimi `kimi-k2.6` handles structured analysis, Agent planning, grounded generation and fact checking. Kimi Vision and bundled Tesseract provide separate image interpretation and visible-text extraction. DashScope `qwen3.7-text-embedding-flash` provides independent 1024-dimensional embeddings. Credentials remain server-side. See [one-page architecture](architecture.svg).

## Agent Workflow

Upload → local parsing → allowlisted tools → structured proposal → human review → Apply → saved Library and index. Tool inputs and outputs are validated. The Agent has no arbitrary shell, browser or deletion tools. Failure preserves the workspace and exposes a retry path.

## RAG Architecture

Question → owner-scoped retrieval → source context → question-scope/source-difference verification → generation → citation identity/freshness validation → atomic-claim and factual support verification → bounded repair → final result. Unverified model drafts never reach the browser. Clarification returns choices; selecting one resolves server-stored document IDs and retrieves again.

## Multimodal AI

Image sources preserve the original image, OCR text and separately labelled AI interpretation. OCR can continue locally during a Vision outage. Failed extraction does not produce fabricated searchable content. Text-layer PDFs are supported; automatic scanned-PDF page rendering is outside the current scope.

## Adaptive Retrieval

Phase 6 found that always combining rankings degraded Hit@1: Vector 0.942 versus Hybrid 0.733. FileMind therefore chooses a strategy from the question rather than always blending scores. Phase 7 independent holdout measured Adaptive Hit@1 0.9674, Hit@5 1.0 and MRR 0.9837. Phase 9 retains the frozen model, chunk settings, Router, VectorStore, RRF and evidence thresholds.

## AI Safety

Human approval, untrusted-content boundaries, allowlisted tools, source ownership, citation checks, numerical checks, factual verification, explicit no-answer, conflict disclosure and clarification. These reduce specific risks; none is a guarantee of universal correctness. Competition Mode requires real AI and disables development controls. Cloud failure remains visible.

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
| Phase 9 live samples | Not passed | Six calls exhausted; invalid structured output preserved |

See [Phase 5–8 evaluation](../evaluation/final-evaluation-summary.md) and [new targeted regression](../evaluation/phase9-targeted-regression.md). Do not merge local and live denominators.

## System Architecture

Next.js App Router + React + TypeScript; server Route Handlers; FileMind Agent and tool registry; local document pipeline; Kimi/Vision/OCR/Embedding layer; retrieval and verification; PostgreSQL with FORCE RLS; private originals and PortableVectorStore. Operation Journal and atomic writes support recovery. [Architecture diagram](architecture.svg) and [technical report](technical-report.pdf) describe the boundaries.

## Quick Start

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

Ten original fixtures, eight recommended, cover PDF/DOCX/Markdown/TXT/PNG/JPG. Open the dedicated Competition Demo Workspace in Settings and download its fixture ZIP. Follow the [single main script](demo-script.md), [video script](video-script.md), [12-slide pitch outline](pitch-deck-outline.md) and [outage Plan B](fallback-demo.md). Five backup queries are listed with their evidence and current acceptance status. Main Demo on the current candidate still needs online rehearsal; the prior Phase 8 success is historical.

## Privacy

Parsing and OCR run locally. Real AI mode sends extracted text to Kimi, image bytes to Kimi Vision and index/query text to DashScope. Private storage and PostgreSQL isolate browser identities; TLS and filesystem permissions remain deployment responsibilities. Recovery keys act as bearer credentials. Backups are integrity-checked ZIP archives and **not encrypted**.

## Known Limitations

Fresh real-model verification is incomplete under the six-call budget. The context wire schema was subsequently flattened and locally checked, but not re-tested with Kimi. PortableVectorStore uses a linear scan, scanned PDFs need a text layer, OCR/Vision can misinterpret content, provider outages affect answers, and the synthetic shared-model evaluation does not establish general accuracy. No OAuth, multi-user collaboration, cloud sync, payments or mobile application. Unicode installation paths remain unsupported in this release scope.

## Team

Repository maintainer: `s0nggv0`. Formal competition team name, school, members and role assignments have not been supplied. Confirm them before submission. [Repository](https://github.com/s0nggv0/FileMind-AI) · [MIT license](../../LICENSE).
