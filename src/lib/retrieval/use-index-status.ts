"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { IndexScope } from "./index-status";
import { indexStatusClient } from "./index-status-client";
const empty = { data: null, error: "" };
export function useIndexStatus(scope: IndexScope) {
  const workspaceId = scope.workspaceId;
  const ids = scope.documentIds ? [...new Set(scope.documentIds)].sort().join(",") : undefined;
  const entry = useMemo(() => indexStatusClient.entry({ workspaceId, documentIds: ids === undefined ? undefined : ids ? ids.split(",") : [] }), [workspaceId, ids]);
  return { ...useSyncExternalStore(entry.subscribe, entry.getSnapshot, () => empty), refresh: entry.refresh };
}
