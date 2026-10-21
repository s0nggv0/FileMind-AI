import type { DocumentType } from "./documents";

export interface AgentStage {
  label: string;
  activity: string;
  detail: string;
}

export interface LandingFile {
  name: string;
  type: DocumentType;
  category: string;
}

export interface RelationshipNode {
  id: string;
  label: string;
  x: number;
  y: number;
  mobile?: boolean;
}

export interface RelationshipEdge {
  source: string;
  target: string;
}

export interface CleanupComparison {
  original: string;
  updated: string;
  similarity: number;
  addedWords: number;
  addedReferences: number;
  before: string;
  after: string;
}

export interface DashboardInsight {
  id: string;
  kind: "growth" | "overlap" | "connection" | "review";
  title: string;
  description: string;
  href: string;
}

// Shared display contracts for saved workspace data and explicitly marked examples.
export type CleanupIssueType = "duplicate" | "outdated" | "missing-tags";

export interface CleanupIssueViewModel {
  documentLinks?: {id:string;name:string}[];
  review?: {workspaceId:string;candidateId:string;revision:number;decision:"pending"|"accepted"|"ignored";kind?:string};
  id: string;
  type: CleanupIssueType;
  title: string;
  description: string;
  files: string[];
  recommendation: string;
  preview: { label: string; before: string; after: string };
}

export interface GraphNodeViewModel {
  id: string;
  label: string;
  kind: "document" | "concept";
  x: number;
  y: number;
  documentId?: string;
}

export interface GraphEdgeViewModel {
  source: string;
  target: string;
  label: string;
}

export interface OverviewMetrics {
  fileCount: number;
  categoryCount: number;
  relationCount: number;
  pendingCount: number;
}
