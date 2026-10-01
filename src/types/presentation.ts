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
