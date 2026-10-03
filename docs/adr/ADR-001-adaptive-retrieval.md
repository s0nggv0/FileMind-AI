# ADR-001: Vector first adaptive retrieval

Status: accepted for Phase 7 implementation, 2026-10-03.

## Context

Phase 6 measured Vector Only at 0.942 / 0.992 / 0.964 (Hit@1 / Hit@5 / MRR), Hybrid at 0.733 / 0.975 / 0.818 and Reranked Hybrid at 0.700 / 0.975 / 0.800. Always adding lexical ranks and a title heuristic harmed the observed ordering.

## Decision

Use deterministic query signals to preserve vector ranking for natural language, add exact-term evidence when applicable, match filenames first and fall back to lexical on embedding failure. Retain RRF k=60 only for queries routed to both candidate streams. Disable the experimental reranker by default.

## Alternatives

Always Hybrid has measured regressions. Always Vector cannot reliably serve identifiers or provider outages. LLM routing adds latency and an unnecessary dependency for simple observable syntax.

## Evaluation

Keep development and holdout corpora distinct. Freeze implementation and independent dataset before a single final evaluation. Compare four strategies and report per-type metrics, route distribution, refusals and source validity; do not invent gold route accuracy.

## Consequences

Fewer lexical calls for semantic queries; deterministic decisions remain inspectable. Syntax cannot capture every intent and RRF may still hurt some exact/mixed queries. Synthetic evaluation does not prove quality for every user collection. Future changes need a new evaluation set rather than repeated tuning on this holdout.
