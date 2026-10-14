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

// 只提供明确标注的演示数据；已保存资料由服务端仓库读取。
export function getDemoOverview(): OverviewMetrics {
  return {
    fileCount: demoDocuments.length,
    categoryCount: demoCategories.length,
    relationCount: demoGraphEdges.length,
    pendingCount: demoCleanupIssues.length,
  };
}

export function getDocumentViewModels() {
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

export function getCleanupIssueViewModels() {
  return demoCleanupIssues;
}

export function getDemoGraph() {
  return { nodes: demoGraphNodes, edges: demoGraphEdges };
}

export function getDemoWorkspaceSteps() {
  return demoWorkspaceSteps;
}
