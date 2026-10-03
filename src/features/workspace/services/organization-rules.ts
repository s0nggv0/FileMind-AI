import { getDocumentContent } from "./file-parser";
import type { OrganizationPlan, ParsedDocument, ProposalDocument } from "@/types/workspace";

export const organizationCategories = ["Artificial Intelligence", "Study", "Projects", "Research", "Images", "Uncategorized"];
export function normalizedFilename(name: string) {
  return name.toLowerCase().replace(/\.[^.]+$/, "").replace(/(?:[-_\s]+(?:final|copy|v\d+|\d+|副本)|\s*\(\d+\))+/g, "").replace(/[-_\s]+/g, " ").trim();
}
function proposeDocument(document: ParsedDocument, content: (document: ParsedDocument) => string): ProposalDocument {
  const text = content(document).replace(/\s+/g, " ").trim();
  const source = `${document.name} ${text.slice(0, 500)}`.toLowerCase();
  const tags: string[] = [];
  for (const [pattern, tag] of [[/transformer/, "Transformer"], [/attention/, "Attention"], [/machine|机器学习/, "Machine Learning"], [/\bllm\b|language model/, "LLM"], [/research|paper|研究|论文/, "Research"], [/lecture|course|notes|课程|笔记/, "Notes"], [/competition|project|report|项目|报告/, "Project"]] as const) {
    if (pattern.test(source)) tags.push(tag);
  }
  let category = "Uncategorized";
  if (/machine|\bai\b|transformer|\bllm\b|attention|人工智能/.test(source)) category = "Artificial Intelligence";
  else if (/lecture|course|notes|课程|笔记/.test(source)) category = "Study";
  else if (/competition|project|report|final\d*|项目|报告/.test(source)) category = "Projects";
  else if (/research|paper|研究|论文/.test(source)) category = "Research";
  else if (document.type === "image") category = "Images";
  if (tags.length === 0) tags.push(document.type === "image" ? "Image" : "Document");
  const extension = document.name.split(".").pop()?.toLowerCase();
  let suggestedName: string | undefined;
  if (/^(img|dsc|screenshot)[-_\d\s]+\./i.test(document.name)) suggestedName = `image-${document.metadata.addedAt.slice(0, 10)}-${document.id.slice(0, 6)}.${extension}`;
  else if (/^final\d*\./i.test(document.name)) suggestedName = `project-report-final.${extension}`;
  else if (/^(untitled|未命名)/i.test(document.name)) suggestedName = `document-${document.id.slice(0, 6)}.${extension}`;
  const summary = document.type === "image" ? text ? `Image knowledge: ${text.slice(0, 360)}${text.length > 360 ? "…" : ""}` : "Image metadata captured locally. Image content has not been analyzed." : text ? `Extracted excerpt: ${text.slice(0, 360)}${text.length > 360 ? "…" : ""}` : `Document named “${document.name}”. No readable text was extracted; topic suggestions use its filename.`;
  return { id: document.id, originalName: document.name, name: document.name, category, tags, summary, suggestedName, renameDecision: "pending", document };
}
export function buildOrganizationPlan(input: ParsedDocument[], content = getDocumentContent): OrganizationPlan {
  const documents = input.filter((document) => document.parseStatus === "completed").map(document => proposeDocument(document, content));
  const duplicates = detectDuplicates(input.filter(document => document.parseStatus === "completed"));
  return { documents, duplicates, relationships: buildRelationships(documents), simulation: true };
}
export function buildRelationships(documents: ProposalDocument[]) {
  const relationships: OrganizationPlan["relationships"] = [];
  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const a = documents[i]; const b = documents[j];
      const shared = a.tags.find((tag) => !["document", "image"].includes(tag.toLowerCase()) && b.tags.some(other => other.toLowerCase() === tag.toLowerCase()));
      const sameCategory = a.category === b.category && a.category !== "Uncategorized" && a.category !== "Images";
      if (shared || sameCategory) relationships.push({ id: `${a.id}-${b.id}`, source: a.id, target: b.id, reason: shared ? `Shared tag: ${shared}` : `Shared category: ${a.category}`, decision: "pending", kind: "rule-based" });
    }
  }
  return relationships;
}
export function detectDuplicates(documents: ParsedDocument[]) {
  const duplicates: OrganizationPlan["duplicates"] = []; const covered = new Set<string>();
  for (const [kind, key] of [["exact", "contentHash"], ["text", "normalizedTextHash"], ["name", "name"]] as const) {
    const groups = new Map<string, string[]>();
    for (const document of documents) { const value = key === "name" ? normalizedFilename(document.name) : document[key]; if (value) groups.set(value, [...(groups.get(value) ?? []), document.id]); }
    for (const ids of groups.values()) {
      if (ids.length < 2 || ids.every(id => covered.has(id))) continue;
      duplicates.push({ id: `duplicate-${kind}-${duplicates.length}`, documentIds: ids, kind, reason: kind === "exact" ? "Exact duplicate · identical SHA-256 file hash" : kind === "text" ? "Text duplicate · identical normalized full text" : "Name similarity · potential match, not semantic similarity", decision: "pending" });
      if (kind !== "name") ids.forEach(id => covered.add(id));
    }
  }
  return duplicates;
}
