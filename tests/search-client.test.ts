import { test } from "node:test";
import assert from "node:assert/strict";
import { getSearchRun, listRecentSearches, SearchClientError, submitSearch } from "../src/features/search/search-client";
import type { SearchRequest, SearchResult } from "../src/lib/retrieval/search-contract";

const input: SearchRequest = { query: "合成搜索", mode: "find" };
const result: SearchResult = {
  id: "synthetic-run", query: input.query, rewrittenQuery: input.query, mode: "find",
  answer: null, sources: [], nearest: [], mock: true, semanticUnavailable: false,
  answerUnavailable: false, evidenceCount: 0, candidateCount: 0,
};
const frame = (type: string, data: unknown) => `data: ${JSON.stringify({ type, data })}\n\n`;
const unavailable = (error: unknown): error is SearchClientError => error instanceof SearchClientError && error.reason === "SEARCH_UNAVAILABLE" && !error.message.includes("PRIVATE");
const unexpectedResult = () => assert.fail("An incomplete or failed search must not deliver a result");

function chunks(parts: (string | Uint8Array)[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(typeof part === "string" ? encoder.encode(part) : part);
      controller.close();
    },
  }));
}

test("history requests preserve URLs, return data and default a missing list to empty", async () => {
  const abort = new AbortController();
  const recent = [{ id: result.id, query: result.query, mode: result.mode }];
  const calls: string[] = [];
  const transport: typeof fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.signal, abort.signal);
    return Response.json(String(url).includes("runId=") ? result : { recent });
  };
  const options = { signal: abort.signal, transport };
  assert.deepEqual(await listRecentSearches(options), recent);
  assert.deepEqual(await getSearchRun("run /?&中文", options), result);
  assert.deepEqual(calls, ["/api/search", `/api/search?runId=${encodeURIComponent("run /?&中文")}`]);
  assert.deepEqual(await listRecentSearches({ transport: async () => Response.json({}) }), []);
});

test("history HTTP, JSON and network failures keep the safe history error", async () => {
  for (const transport of [
    async () => Response.json({ reason: "SOURCES_CHANGED", error: "PRIVATE" }, { status: 404 }),
    async () => new Response("PRIVATE: invalid JSON"),
    async () => { throw new Error("PRIVATE network details"); },
  ]) {
    for (const read of [() => listRecentSearches({ transport }), () => getSearchRun("run", { transport })]) {
      await assert.rejects(read(), error => unavailable(error) && error.message === "这条搜索记录已不可用，请重新搜索。");
    }
  }
});

test("submission preserves every request field and delivers only stages and results in order", async () => {
  const request: SearchRequest = { ...input, workspaceId: "workspace", documentIds: ["one", "two"], previousRunId: "previous", clarificationOption: 0, compareAll: true };
  const abort = new AbortController();
  const delivered: unknown[] = [];
  await submitSearch(request, {
    signal: abort.signal,
    transport: async (url, init) => {
      assert.equal(url, "/api/search"); assert.equal(init?.method, "POST");
      assert.equal(init.signal, abort.signal);
      assert.equal(new Headers(init.headers).get("content-type"), "application/json");
      assert.deepEqual(JSON.parse(String(init.body)), request);
      return chunks([frame("stage", "正在核对"), frame("draft", "PRIVATE DRAFT"), frame("future-event", {}), frame("result", result)]);
    },
    onStage: stage => delivered.push(stage), onResult: data => delivered.push(data),
  });
  assert.deepEqual(delivered, ["正在核对", result]);
});

for (const newline of ["\n", "\r\n"]) {
  test(`SSE handles UTF-8 characters, lines and event separators split at every byte (${JSON.stringify(newline)})`, async () => {
    const delivered: unknown[] = [];
    const text = (frame("stage", "正在核对中文与 🧠") + frame("result", result)).replaceAll("\n", newline);
    const response = chunks([...new TextEncoder().encode(text)].map(byte => Uint8Array.of(byte)));
    await submitSearch(input, { transport: async () => response, onStage: stage => delivered.push(stage), onResult: data => delivered.push(data) });
    assert.deepEqual(delivered, ["正在核对中文与 🧠", result]);
    assert.equal(response.body!.locked, false);
  });
}

test("comments and multiline data do not change the JSON event protocol", async () => {
  const delivered: SearchResult[] = [];
  const text = `: keepalive\n\nevent: message\ndata:{"type":"result",\ndata: "data":${JSON.stringify(result)}}\n\n`;
  await submitSearch(input, { transport: async () => chunks([text]), onResult: data => delivered.push(data) });
  assert.deepEqual(delivered, [result]);
});

test("EOF without a complete result rejects, including a valid JSON event without its final delimiter", async () => {
  for (const text of ["", frame("stage", "等待结果"), 'data: {"type":"result",', frame("result", result).slice(0, -1)]) {
    await assert.rejects(submitSearch(input, { transport: async () => chunks([text]), onResult: unexpectedResult }),
      error => unavailable(error) && error.message === "搜索已中断，请重试。");
  }
  // An unterminated trailing frame is discarded, never treated as a new event.
  const delivered: SearchResult[] = [];
  await submitSearch(input, {
    transport: async () => chunks([frame("result", result), frame("result", { ...result, id: "incomplete" }).slice(0, -2)]),
    onResult: data => delivered.push(data),
  });
  assert.deepEqual(delivered, [result]);
});

test("HTTP and SSE errors preserve known reasons and safely normalize unknown or malformed errors", async () => {
  for (const [body, reason] of [
    [{ reason: "SOURCES_CHANGED", error: "PRIVATE" }, "SOURCES_CHANGED"],
    [{ reason: "PREPARATION_INCOMPLETE" }, "PREPARATION_INCOMPLETE"],
    [{ reason: "UNKNOWN_FUTURE_CODE", error: "PRIVATE" }, "SEARCH_UNAVAILABLE"],
    ["PRIVATE", "SEARCH_UNAVAILABLE"], [null, "SEARCH_UNAVAILABLE"],
  ] as const) {
    const responses = [Response.json(body, { status: 503 }), chunks([frame("error", body), frame("result", result)])];
    for (const response of responses) {
      await assert.rejects(submitSearch(input, { transport: async () => response, onResult: unexpectedResult }),
        error => error instanceof SearchClientError && error.reason === reason && !error.message.includes("PRIVATE"));
      if (response.ok) assert.equal(response.body!.locked, false);
      else assert.equal(response.bodyUsed, true);
    }
  }
  await assert.rejects(submitSearch(input, { transport: async () => new Response("PRIVATE", { status: 500 }), onResult: unexpectedResult }), unavailable);
});

test("invalid events, missing bodies and broken streams reject without exposing transport details", async () => {
  for (const response of [
    chunks(["data: PRIVATE invalid JSON\n\n"]), chunks(["data: null\n\n"]),
    chunks([frame("stage", {})]), chunks([frame("result", null)]), new Response(null),
    new Response(new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE broken stream")); } })),
  ]) {
    await assert.rejects(submitSearch(input, { transport: async () => response, onResult: unexpectedResult }), unavailable);
    assert.equal(response.body?.locked ?? false, false);
  }
  await assert.rejects(submitSearch(input, { transport: async () => { throw new Error("PRIVATE network"); }, onResult: unexpectedResult }), unavailable);
});

test("a terminal SSE error cancels the open body and prevents later callbacks", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(frame("error", { reason: "SEARCH_UNAVAILABLE" }) + frame("result", result))); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(submitSearch(input, { transport: async () => response, onResult: unexpectedResult }), unavailable);
  assert.equal(cancelled, true); assert.equal(response.body!.locked, false);
});

test("already aborted operations never issue HTTP requests", async () => {
  const signal = AbortSignal.abort();
  const transport: typeof fetch = async () => assert.fail("aborted operation issued a request");
  for (const run of [
    () => listRecentSearches({ signal, transport }), () => getSearchRun("run", { signal, transport }),
    () => submitSearch(input, { signal, transport, onResult: unexpectedResult }),
  ]) await assert.rejects(run(), error => error === signal.reason);
});

test("abort propagates to fetch and cancels a late response even if transport ignores the signal", async () => {
  const abort = new AbortController();
  let cancelled = false;
  const transport: typeof fetch = async (_url, init) => {
    assert.equal(init?.signal, abort.signal); abort.abort();
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  };
  await assert.rejects(submitSearch(input, { signal: abort.signal, transport, onResult: unexpectedResult }), error => error === abort.signal.reason);
  assert.equal(cancelled, true);
});

test("abort interrupts a pending stream read, releases its lock and preserves the abort reason", { timeout: 2000 }, async () => {
  const abort = new AbortController();
  let reading!: () => void, cancelled: unknown;
  const pendingRead = new Promise<void>(resolve => { reading = resolve; });
  const response = new Response(new ReadableStream<Uint8Array>({
    pull() { reading(); }, cancel(reason) { cancelled = reason; },
  }, { highWaterMark: 0 }));
  const pending = submitSearch(input, { signal: abort.signal, transport: async () => response, onStage: () => assert.fail("late stage"), onResult: unexpectedResult });
  const rejected = assert.rejects(pending, error => error === abort.signal.reason);
  await pendingRead; abort.abort(new DOMException("Synthetic cancellation", "AbortError"));
  await rejected;
  assert.equal(cancelled, abort.signal.reason); assert.equal(response.body!.locked, false);
});

test("abort between response headers and reader setup still cancels with the original reason", async () => {
  const abort = new AbortController();
  let cancelled: unknown;
  const response = new Response(new ReadableStream({ cancel(reason) { cancelled = reason; } }));
  await assert.rejects(submitSearch(input, {
    signal: abort.signal,
    transport: async () => { queueMicrotask(() => queueMicrotask(() => abort.abort())); return response; },
    onResult: unexpectedResult,
  }), error => error === abort.signal.reason);
  assert.equal(cancelled, abort.signal.reason); assert.equal(response.body!.locked, false);
});

test("abort during a callback prevents further events already buffered in the same chunk", async () => {
  const abort = new AbortController();
  let stages = 0;
  await assert.rejects(submitSearch(input, {
    signal: abort.signal, transport: async () => chunks([frame("stage", "取消点") + frame("stage", "late") + frame("result", result)]),
    onStage: () => { stages++; abort.abort(); }, onResult: unexpectedResult,
  }), error => error === abort.signal.reason);
  assert.equal(stages, 1);
});

test("history cancellation after headers prevents a decoded response from being delivered", async () => {
  for (const run of [listRecentSearches, (options: Parameters<typeof getSearchRun>[1]) => getSearchRun("run", options)]) {
    const abort = new AbortController();
    const response = Response.json(result);
    response.json = async () => { abort.abort(); return result; };
    await assert.rejects(run({ signal: abort.signal, transport: async () => response }), error => error === abort.signal.reason);
  }
});
