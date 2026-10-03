export type DocumentType = "pdf" | "docx" | "md" | "txt" | "image";

export interface DemoDocument {
  id: string;
  name: string;
  type: DocumentType;
  category: string;
  summary: string;
  tags: string[];
  updatedAt: string;
  size: string;
  relations: number;
  indexStatus?: string;
  storageStatus?: "available" | "missing" | "not_stored";
}
