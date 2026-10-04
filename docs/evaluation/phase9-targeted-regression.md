# Phase 9 Targeted Regression

This is a new, targeted regression. Phase 8 Blind Run #1 and its frozen corpus, protocol, inputs and results remain immutable. The user subsequently limited Phase 9 to **at most six new Kimi calls**. Offline scripted semantic tests prove pipeline behavior, not real-model accuracy. Historical real-provider receipts are not counted as a fresh RC acceptance.

## Root causes

| Phase 8 cases | Failure class | Evidence and correction |
| --- | --- | --- |
| B129/B131/B132/B135 | State / structured verification | Both attributed values passed claim support, but `verification.conflicts` was empty. Source differences are now assessed before generation and independently checked again by the release verifier. The final answer carries `conflict.detected`, claims and values. No answer-text keyword detection. |
| B130 | Verifier rejection | Numeric support was false for supported edition dates followed by English words. The quantity regex could consume the first `s` or `m` of a word as a unit. Latin unit suffixes now require a word boundary. Neither evidence thresholds nor Router changed. |
| B133 | Answer generation decision | Retrieval had relevant candidates but the final cited-evidence assessment was empty and no verifier attempts were recorded. This establishes a generation/no-citations refusal, not a raised retrieval threshold. A verified source difference now permits one bounded regeneration explaining both values. The original trace does not retain the raw draft, so a more specific causal claim is unavailable. |
| Eight ambiguous cases | Missing clarification path | No clarification schema existed. A structured question-scope check now returns distinct entity options without answering. Option clicks reference an owner-scoped saved run; the server resolves its stored document IDs, retrieves again and filters evidence to the selection. |

## Local targeted results

`npx tsx --test tests/answer-context.test.ts tests/answer-verifier.test.ts`: **28/28 passed** on 2026-10-04. Includes 10 conflict cases, 10 ambiguous cases, 10 follow-up resolutions, stale-source/foreign-ID failures, short specific queries and the numeric parsing reproduction. Transport responses are explicitly scripted laboratory fixtures.

| Conflict cases | Languages | Documents | Local state |
| --- | --- | --- | --- |
| Deadline (2) | Chinese / English | Two project plans | conflicting |
| Policy versions (2) | Chinese / English | Two editions, including explicit supersession | conflicting |
| Sensor offset (2) | Chinese / English | Two reports | conflicting |
| Course credits (2) | Chinese / English | Two course records | conflicting |
| Budget and retry limit (2) | Chinese / English | Two planning or policy records | conflicting |

| Ambiguous cases | Languages | Candidate entities | Local state / selected follow-up |
| --- | --- | --- | --- |
| Deadline (2), credits (2), offset (2), budget (2), retention (2) | Five Chinese / five English | Three distinct projects in each scripted transport case | needs_clarification / answered |

The ambiguity laboratory checks publication and resolution of independently supplied structured decisions. Its generic project candidates do **not** establish semantic classification accuracy for courses or policies. Real-model sampling and browser interaction receipts are separate.

## Acceptance interpretation

The local generation false-refusal reproduction recovers to a conflict answer and preserves both citations. The numeric rejection reproduction now passes while an invented quantity remains blocked. This is demonstrated defect correction, **not** a remeasurement of the Phase 8 aggregate 5.88% false-refusal rate. No new global false-refusal metric is claimed.

Fresh model samples, call counts, browser receipts and unresolved gates are recorded in the Phase 9 delivery checklist and accompanying result files. A service failure or unrun check is never counted as a passed answer or a Ready preflight.
