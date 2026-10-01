export interface DemoActivity {
  id: string;
  title: string;
  description: string;
  time: string;
  status: "completed" | "pending";
}

export type CleanupIssueType = "duplicate" | "outdated" | "missing-tags";

export interface DemoCleanupIssue {
  id: string;
  type: CleanupIssueType;
  title: string;
  description: string;
  files: string[];
  recommendation: string;
  preview: {
    label: string;
    before: string;
    after: string;
  };
}

export interface DemoGraphNode {
  id: string;
  label: string;
  kind: "document" | "concept";
  x: number;
  y: number;
  documentId?: string;
}

export interface DemoGraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface DemoWorkspaceStep {
  id: string;
  label: string;
  tool: string;
}

export interface OverviewMetrics {
  fileCount: number;
  categoryCount: number;
  relationCount: number;
  pendingCount: number;
}
