"use client";
import { useEffect, useRef, useState } from "react";
import type { IndexScope } from "./index-status";
import { indexStatusURL } from "./index-status";
import { prepareSearch } from "./prepare-search";

export function useSearchPreparation(scope: IndexScope) {
  const key = indexStatusURL(scope);
  const operation = useRef<{ key: string; controller: AbortController } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [failure, setFailure] = useState({ key: "", message: "" });
  useEffect(() => () => { if (operation.current?.key === key) operation.current.controller.abort(); }, [key]);
  async function run() {
    if (operation.current?.key === key && !operation.current.controller.signal.aborted) return;
    operation.current?.controller.abort();
    const controller = new AbortController(); operation.current = { key, controller };
    setBusyKey(key); setFailure({ key, message: "" });
    try {
      const result = await prepareSearch(scope, fetch, controller.signal);
      if (!controller.signal.aborted) return result;
    } catch (error) {
      if (!controller.signal.aborted) setFailure({ key, message: error instanceof Error ? error.message : "暂时无法准备搜索，请稍后重试。" });
    } finally {
      if (!controller.signal.aborted) { setBusyKey(null); operation.current = null; }
    }
  }
  return { run, busy: busyKey === key, error: failure.key === key ? failure.message : "" };
}
