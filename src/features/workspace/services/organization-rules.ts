import { getDocumentContent } from "./file-parser";
import type { OrganizationPlan, ParsedDocument, ProposalDocument } from "@/types/workspace";

export const organizationCategories = ["Artificial Intelligence", "Study", "Projects", "Research", "Images", "Uncategorized"];
export function normalizedFilename(name: string) {
  return name.toLowerCase().replace(/\.[^.]+$/, "").replace(/(?:[-_\s]+(?:final|copy|v\d+|\d+|副本)|\s*\(\d+\))+/g, "").replace(/[-_\s]+/g, " ").trim();
}
function proposeDocument(document: ParsedDocument): ProposalDocument {
  const text = getDocumentContent(document).replace(/\s+/g, " ").trim();
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
  const summary = document.type === "image" ? "Image metadata captured locally. Image content has not been analyzed." : text ? `Extracted excerpt: ${text.slice(0, 360)}${text.length > 360 ? "…" : ""}` : `Document named “${document.name}”. No readable text was extracted; topic suggestions use its filename.`;
  return { id: document.id, originalName: document.name, name: document.name, category, tags, summary, suggestedName, renameDecision: "pending", document };
}
export function buildOrganizationPlan(input: ParsedDocument[]): OrganizationPlan {
  const documents = input.filter((document) => document.parseStatus === "completed").map(proposeDocument);
  const groups = new Map<string, string[]>();
  for (const document of documents) {
    const key = normalizedFilename(document.originalName);
    if (key) groups.set(key, [...(groups.get(key) ?? []), document.id]);
  }
  const duplicates = [...groups.values()].filter((ids) => ids.length > 1).map((documentIds, index) => ({ id: `duplicate-${index}`, documentIds, reason: "Name similarity only · content has not been compared", decision: "pending" as const }));
  const relationships: OrganizationPlan["relationships"] = [];
  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const a = documents[i]; const b = documents[j];
      const shared = a.tags.find((tag) => !["Document", "Image"].includes(tag) && b.tags.includes(tag));
      const sameCategory = a.category === b.category && a.category !== "Uncategorized" && a.category !== "Images";
      if (shared || sameCategory) relationships.push({ id: `${a.id}-${b.id}`, source: a.id, target: b.id, reason: shared ? `Shared tag: ${shared}` : `Shared category: ${a.category}`, decision: "pending" });
    }
  }
  return { documents, duplicates, relationships, simulation: true };
}
