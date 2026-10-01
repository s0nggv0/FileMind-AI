import {
  demoActivities,
  demoCategories,
  demoCleanupIssues,
  demoDocuments,
  demoGraphEdges,
  demoGraphNodes,
  demoSearchSuggestions,
  demoWorkspaceSteps,
} from "@/mocks";
import type { OverviewMetrics } from "@/types";

/** Phase 1's local data adapter. Replace this boundary when persistence is added. */
export function getDemoOverview(): OverviewMetrics {
  return {
    fileCount: demoDocuments.length,
    categoryCount: demoCategories.length,
    relationCount: demoGraphEdges.length,
    pendingCount: demoCleanupIssues.length,
  };
}

export function getDemoDocuments() {
  return demoDocuments;
}

export function getDemoCategories() {
  return demoCategories;
}

export function getDemoActivities() {
  return demoActivities;
}

export function getDemoSearchSuggestions() {
  return demoSearchSuggestions;
}

export function getDemoCleanupIssues() {
  return demoCleanupIssues;
}

export function getDemoGraph() {
  return { nodes: demoGraphNodes, edges: demoGraphEdges };
}

export function getDemoWorkspaceSteps() {
  return demoWorkspaceSteps;
}
