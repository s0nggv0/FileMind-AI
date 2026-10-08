# FileMind AI / 知序 AI

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router, React, TypeScript strict, Tailwind CSS, shadcn/ui, Lucide, Framer Motion and Zustand, with private PostgreSQL persistence, Kimi and independent DashScope Embedding.

## Users

Students and researchers who need to organize documents and find information in their study materials.

## Product Purpose

Import documents and images, review the Agent's organization suggestions, then search the saved library and check answers against their sources. Document relationships and duplicate suggestions help with later review.

## Capabilities and Constraints

FileMind parses PDF/DOCX/Markdown/TXT locally and accepts validated PNG/JPG/JPEG images. Bundled OCR extracts visible text; Kimi Vision provides a separate interpretation. Originals stay in private storage. Reviewed documents enter a versioned index, and retrieval chooses a strategy for each query. Ask publishes answers after citation and factual checks; Find returns passages. Image citations open the original and distinguish extracted text from AI interpretation. Search is limited to the signed browser identity's saved library. Recovery keys restore that identity within the same database, and checked backups support export and import. Mock results are labelled; Competition Mode requires real services and reports outages. Automatic scanned-PDF page rendering, internet RAG and full account login are not implemented. Demo fixtures remain separate from personal knowledge.

## Brand Commitments

FileMind AI / 知序 AI. The interface follows the restraint of Linear, Raycast and Notion: navigation stays focused on document tasks, with limited colour and clear typography. Avoid blue-purple gradients, glass effects and enterprise admin layouts.

## Evidence on Hand

Architecture: docs/superpowers/specs/2026-10-01-filemind-ai-design.md. Evaluation records use original synthetic documents and disclose their test scope. The 2026-10-04 release checks include the real-provider main Demo and 12/12 preflight; performance and failure records remain in docs/evaluation. Demo statistics must be labelled. User documents and service credentials stay outside Git.

## Product Principles

Show what the Agent is doing and where each answer came from. Ask for confirmation before applying organization changes. Label examples, service failures and AI interpretations, and isolate each identity's private data.
