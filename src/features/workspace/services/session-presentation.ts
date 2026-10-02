import { formatFileSize } from "@/config/upload";
import type { DemoDocument, DemoGraphEdge, DemoGraphNode } from "@/types";
import type { OrganizationPlan } from "@/types/workspace";

export function sessionDocuments(plans: OrganizationPlan[]): DemoDocument[] {
  return plans.flatMap((plan) => plan.documents.map((document) => ({
    id: document.id, name: document.name, type: document.document.type, category: document.category,
    summary: document.summary, tags: document.tags, updatedAt: document.document.metadata.addedAt.slice(0, 10), size: formatFileSize(document.document.size),
    relations: plan.relationships.filter((item) => item.source === document.id || item.target === document.id).length,
  })));
}
export function sessionGraph(plan: OrganizationPlan) {
  const nodes: DemoGraphNode[] = plan.documents.map((document, index) => ({ id: document.id, documentId: document.id, kind: "document", label: document.name.length > 20 ? `${document.name.slice(0, 18)}…` : document.name, x: 90 + index % 5 * 180, y: 45 + Math.floor(index / 5) * 80 }));
  const edges: DemoGraphEdge[] = plan.relationships.map((item) => ({ source: item.source, target: item.target, label: item.reason }));
  return { nodes, edges };
}
