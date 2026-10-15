import * as landing from "@/mocks/landing";
import * as dashboard from "@/mocks/dashboard";
import { getDemoDocuments, getDemoOverview } from "./repository";

export function getDemoLandingPresentation() {
  return {
    ...landing,
    metrics: {
      files: landing.landingFiles.length,
      categories: new Set(landing.landingFiles.map((file) => file.category)).size,
      connections: landing.agentConnections.length,
      similarFiles: 2,
    },
  };
}

export function getDemoDashboardPresentation() {
  return {
    ...dashboard,
    overview: getDemoOverview(),
    topicCount: dashboard.dashboardTopics.length,
    recentFiles: [...getDemoDocuments()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4),
    snapshot: "2026.09.30",
  };
}
