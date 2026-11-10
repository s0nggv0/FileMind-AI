import type { SearchRequest, SearchResult } from "@/lib/retrieval/search-contract";
import { SearchIssueSchema, type SearchIssue } from "@/lib/retrieval/search-contract";

export type RecentSearch = Pick<SearchResult, "id" | "query" | "mode">;

interface ClientOptions {
  signal?: AbortSignal;
  transport?: typeof fetch;
}

interface SearchOptions extends ClientOptions {
  onStage?: (stage: string) => void;
  onResult: (result: SearchResult) => void;
}

export class SearchClientError extends Error {
  constructor(message = "搜索连接不可用，请重试。", readonly reason: SearchIssue = "SEARCH_UNAVAILABLE") {
    super(message);
    this.name = "SearchClientError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function failure(data: unknown) {
  const reason = SearchIssueSchema.safeParse(isRecord(data) ? data.reason : undefined);
  return new SearchClientError(undefined, reason.success ? reason.data : "SEARCH_UNAVAILABLE");
}

async function request(url: string, init: RequestInit, { signal, transport = fetch }: ClientOptions) {
  signal?.throwIfAborted();
  const response = await transport(url, { ...init, signal });
  if (signal?.aborted) {
    void response.body?.cancel(signal.reason).catch(() => {});
    signal.throwIfAborted();
  }
  return response;
}

async function readHistory<T>(url: string, options: ClientOptions): Promise<T> {
  try {
    const response = await request(url, {}, options);
    if (!response.ok) throw new SearchClientError("这条搜索记录已不可用，请重新搜索。");
    const data: T = await response.json();
    options.signal?.throwIfAborted();
    return data;
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof SearchClientError) throw error;
    throw new SearchClientError("这条搜索记录已不可用，请重新搜索。");
  }
}

export async function listRecentSearches(options: ClientOptions = {}): Promise<RecentSearch[]> {
  const data = await readHistory<{ recent?: RecentSearch[] }>("/api/search", options);
  return data.recent ?? [];
}

export function getSearchRun(runId: string, options: ClientOptions = {}): Promise<SearchResult> {
  return readHistory(`/api/search?runId=${encodeURIComponent(runId)}`, options);
}

export async function submitSearch(input: SearchRequest, options: SearchOptions): Promise<void> {
  const { signal, onStage, onResult } = options;
  try {
    const response = await request("/api/search", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, options);
    if (!response.ok) throw failure(await response.json());
    const reader = response.body?.getReader();
    if (!reader) throw new SearchClientError();
    const decoder = new TextDecoder();
    let buffer = "", completed = false, ended = false;
    const cancel = () => { void reader.cancel(signal?.reason).catch(() => {}); };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      signal?.throwIfAborted();
      while (true) {
        const { value, done } = await reader.read();
        signal?.throwIfAborted();
        if (done) { ended = true; break; }
        buffer += decoder.decode(value, { stream: true });
        // Keep partial UTF-8 characters, lines and events for the next chunk.
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = event.split(/\r?\n/).filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).replace(/^ /, "")).join("\n");
          if (!data) continue;
          signal?.throwIfAborted();
          const payload: unknown = JSON.parse(data);
          if (!isRecord(payload)) throw new SearchClientError();
          if (payload.type === "error") throw failure(payload.data);
          if (payload.type === "stage") {
            if (typeof payload.data !== "string") throw new SearchClientError();
            onStage?.(payload.data);
          }
          if (payload.type === "result") {
            if (!isRecord(payload.data)) throw new SearchClientError();
            onResult(payload.data as unknown as SearchResult);
            completed = true;
          }
          // Unknown events (including unverified drafts) are never delivered.
        }
      }
      // EOF cannot complete an unterminated event. A complete result is required.
      if (!completed) throw new SearchClientError("搜索已中断，请重试。");
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (!ended) cancel();
      reader.releaseLock();
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof SearchClientError) throw error;
    throw new SearchClientError();
  }
}
