"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/retrieval/search-contract";
import { hasVerifiedAnswer, searchIssues, type SearchIssue } from "@/lib/retrieval/search-outcome";
import { systemMessage } from "@/lib/ui-labels";
import { getSearchRun, listRecentSearches, SearchClientError, submitSearch, type RecentSearch } from "./search-client";

export interface SearchInitialState {
  initialWorkspace?: string;
  initialDocument?: string;
  initialDocuments?: string[];
  initialQuery?: string;
  initialMode?: "ask" | "find";
}

const successfulResult = (data: SearchResult) => hasVerifiedAnswer(data) || data.mode === "find" && data.sources.length > 0;

export function useKnowledgeSearch({ initialWorkspace, initialDocument, initialDocuments, initialQuery = "", initialMode = "ask" }: SearchInitialState) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspace);
  const [documentIds, setDocumentIds] = useState(initialDocument ? [initialDocument] : initialDocuments);
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState(initialMode);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [retainedSuccess, setRetainedSuccess] = useState<SearchResult | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<SearchIssue | null>(null);
  const operation = useRef<{ controller: AbortController; initial: boolean } | null>(null);

  // Every entry point, including URL restoration, shares one request owner.
  const begin = useCallback((initial = false) => {
    operation.current?.controller.abort();
    const current = { controller: new AbortController(), initial };
    operation.current = current;
    setError("");
    setFailure(null);
    setBusy(!initial);
    return current;
  }, []);
  const isCurrent = useCallback((current: NonNullable<typeof operation.current>) => operation.current === current && !current.controller.signal.aborted, []);
  const finish = useCallback((current: NonNullable<typeof operation.current>) => {
    if (!isCurrent(current)) return;
    operation.current = null;
    setBusy(false);
    setStage("");
  }, [isCurrent]);

  const restore = useCallback(async (id: string, initial = false) => {
    const current = begin(initial);
    if (!initial) setStage("正在加载历史记录");
    try {
      const data = await getSearchRun(id, { signal: current.controller.signal });
      if (!isCurrent(current)) return;
      setResult(data);
      setRetainedSuccess(null);
      setQuery(data.query);
      setMode(data.mode);
      setWorkspaceId(data.workspaceId);
      setDocumentIds(data.selectedDocumentIds);
      // Initial restoration keeps focusChunk and the original URL intact.
      if (!initial) window.history.replaceState(null, "", `/search?run=${data.id}`);
    } catch (error) {
      if (!isCurrent(current)) return;
      if (initial) setError(error instanceof Error ? error.message : "这条搜索记录已不可用，请重新搜索。");
      else setFailure("SEARCH_UNAVAILABLE");
    } finally {
      finish(current);
    }
  }, [begin, finish, isCurrent]);

  useEffect(() => {
    const abort = new AbortController();
    void listRecentSearches({ signal: abort.signal }).then(items => {
      if (!abort.signal.aborted) setRecent(old => [...old, ...items.filter(item => !old.some(r => r.id === item.id))].slice(0, 10));
    }).catch(() => {});
    const runId = new URLSearchParams(window.location.search).get("run");
    if (runId) queueMicrotask(() => {
      if (!abort.signal.aborted && !operation.current) void restore(runId, true);
    });
    return () => {
      abort.abort();
      operation.current?.controller.abort();
      operation.current = null;
    };
  }, [restore]);

  async function search({ clarificationOption, compareAll = false, preparing = false }: { clarificationOption?: number; compareAll?: boolean; preparing?: boolean } = {}) {
    if (!query.trim() || preparing || operation.current && !operation.current.initial) return;
    const current = begin();
    setStage("正在搜索资料");
    const previousRunId = result?.id;
    try {
      await submitSearch({ query, mode, ...(workspaceId ? { workspaceId } : {}), ...(documentIds ? { documentIds } : {}), ...(previousRunId ? { previousRunId } : {}), ...(clarificationOption !== undefined ? { clarificationOption } : {}), ...(compareAll ? { compareAll: true } : {}) }, {
        signal: current.controller.signal,
        onStage: value => { if (isCurrent(current)) setStage(systemMessage(value)); },
        onResult: data => {
          if (!isCurrent(current)) return;
          if (result && successfulResult(result) && !successfulResult(data)) setRetainedSuccess(result);
          else if (successfulResult(data)) setRetainedSuccess(null);
          setResult(data);
          setDocumentIds(data.selectedDocumentIds ?? documentIds);
          window.history.replaceState(null, "", `/search?run=${data.id}`);
          setRecent(old => [{ id: data.id, query: data.query, mode: data.mode }, ...old.filter(r => r.id !== data.id)].slice(0, 10));
        },
      });
    } catch (error) {
      if (isCurrent(current)) setFailure(error instanceof SearchClientError ? error.reason : "SEARCH_UNAVAILABLE");
    } finally {
      finish(current);
    }
  }

  function cancel() {
    operation.current?.controller.abort();
    operation.current = null;
    setBusy(false);
    setStage("");
    setError("搜索已取消，可以重试。");
  }

  const issues = [...new Set([...(failure ? [failure] : []), ...(result ? searchIssues(result) : [])])];
  return { workspaceId, documentIds, query, setQuery, mode, setMode, result, retainedSuccess, recent, stage, busy, error, issues, search, openHistory: restore, cancel };
}
