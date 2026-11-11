import { aiLimits } from "./config";
export async function analysisQueue<T, R>(items: T[], task: (item: T, index: number) => Promise<R>, signal: AbortSignal, concurrency = aiLimits.analysisConcurrency) {
  let next = 0; const results = new Array<R>(items.length);
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (next < items.length) { signal.throwIfAborted(); const index = next++; results[index] = await task(items[index], index); }
  }));
  signal.throwIfAborted(); return results;
}
