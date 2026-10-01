import { FileText, FileType, Image as ImageIcon } from "lucide-react";
import type { DocumentType } from "@/types";
import { cn } from "@/lib/utils";

export function DocumentTypeIcon({ type, className }: { type: DocumentType; className?: string }) {
  const Icon = type === "image" ? ImageIcon : type === "md" || type === "txt" ? FileType : FileText;
  return <Icon aria-hidden="true" strokeWidth={1.5} className={cn("size-5 shrink-0 text-muted-foreground", className)} />;
}
