import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { hash, type Observation } from "./regression/protocol";
import { exclusiveJSON, RunStore } from "./regression/execution";

const ReviewSchema = z.object({
  reportHash: z.string(), fingerprint: z.string(), reviewer: z.string().trim().min(1),
  reviews: z.array(z.object({ questionId: z.string(), attempt: z.number().int().positive(), factualSupport: z.boolean().nullable(), citationSupport: z.boolean().nullable(), refusalCorrect: z.boolean().nullable(), conflictDisclosed: z.boolean().nullable() }).strict()),
}).strict();
export function humanReview(report: { fingerprint: string; rows: Observation[] }, input: unknown) {
  const review = ReviewSchema.parse(input);
  if (hash(report) !== review.reportHash || report.fingerprint !== review.fingerprint) throw new Error("Human review belongs to a different report");
  const key = (r: { questionId: string; attempt: number }) => `${r.questionId}:${r.attempt}`;
  const expected = new Set(report.rows.map(key));
  if (review.reviews.length !== expected.size || new Set(review.reviews.map(key)).size !== expected.size || review.reviews.some(r => !expected.has(key(r)))) throw new Error("Human review attempt IDs do not match");
  return { method: "independent-human-review", reviewer: review.reviewer, reportHash: review.reportHash, samples: review.reviews.length, metrics: Object.fromEntries((["factualSupport", "citationSupport", "refusalCorrect", "conflictDisclosed"] as const).map(field => {
    const applicable = review.reviews.filter(r => r[field] !== null), passed = applicable.filter(r => r[field]).length;
    return [field, { samples: applicable.length, numerator: passed, denominator: applicable.length, value: applicable.length ? passed / applicable.length : null, pendingOrInapplicable: review.reviews.length - applicable.length, rule: "human true / human non-null judgments; null is pending or inapplicable, never a pass" }];
  })), reviews: review.reviews };
}
async function main(args: string[]) {
  if (args.length !== 2) throw new Error("Usage: npm run evaluate:review -- <report.json> <completed-review.json>");
  const report = JSON.parse(await readFile(args[0], "utf8"));
  const reviewed = humanReview(report, JSON.parse(await readFile(args[1], "utf8")));
  const store = await RunStore.create(resolve("artifacts/retrieval-qa-regression-human"));
  try {
    await exclusiveJSON(join(store.root, "human-review.json"), { ...reviewed, reviewedAt: new Date().toISOString(), reportPath: resolve(args[0]) });
    console.log(`Human review saved separately: ${join(store.root, "human-review.json")}`);
  } finally { await store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main(process.argv.slice(2)).catch(() => { console.error("Human review rejected: check report identity, reviewer and attempt IDs."); process.exitCode = 1; });
