# Phase 9 dependency audit

Checked against the official npm registry on 2026-10-04. `npm audit --json` reports **0 Critical / 5 High**. All five findings are the development chain `eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`, for the same braces stack-exhaustion advisory GHSA-vfj7-8cjw-p6xm. `npm audit --omit=dev --json` reports **zero runtime vulnerabilities**.

Registry latest braces is 3.0.3, within the affected range; no published patch was available at the check. npm suggests eslint-config-next 14.2.35, a major framework-tooling downgrade which was not applied. The candidate discloses the development advisory and retains the lockfile.

| Package | Current | Registry latest | Decision |
| --- | --- | --- | --- |
| @types/node | 26.6.3 | 26.6.4 | Freeze; no required type fix |
| eslint | 9.39.4 | 10.12.0 | Major; freeze |
| framer-motion | 13.5.0 | 14.0.0 | Major; freeze |
| lucide-react | 1.49.0 | 1.51.0 | No required UI fix; freeze |
| pdfjs-dist | 6.3.289 | 6.4.299 | Freeze ingestion pipeline |
| typescript | 6.0.3 | 7.0.2 | Major; freeze |

All **599** non-root lockfile entries have recorded licenses in `phase9-dependency-licenses.json`. Source has MIT `LICENSE`; the Windows artifact includes Node and PostgreSQL runtime licenses. This inventory is not a full legal opinion. Raw npm outputs are ignored local artifacts.
