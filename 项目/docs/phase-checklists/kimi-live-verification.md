# Kimi live verification — Phase 5 Gate 0

REAL_KIMI_VERIFIED=true

- Checked at: 2026-10-02T15:01:13.454Z
- Model: kimi-k2.6
- Provider: Kimi (current project adapter, no mock fallback)
- Request timeout: 45000 ms
- Inputs: synthetic, minimal; no personal documents

| Step | Passed | HTTP status | Error code | Latency (ms) | Total tokens |
| --- | --- | --- | --- | --- | --- |
| A: text | true | 200 | none | 714 | 23 |
| B: structured analysis | true | 200 | none | 2669 | 182 |
| C: tool registry | true | 200 | none | 1284 | 168 |

All three live probes passed: instant mode, positive usage, domain Zod validation, and execution through ToolRegistry.

The timeout is attached to every live request; cancellation behavior is also covered by offline transport tests. Successful requests alone do not prove that an actual 45-second timeout occurred.

No credentials, raw errors, provider response bodies, model output, or hidden reasoning are included.

Reproduce: `node --import tsx scripts/verify-kimi-live.ts`. This explicitly calls the paid API and overwrites this report.
