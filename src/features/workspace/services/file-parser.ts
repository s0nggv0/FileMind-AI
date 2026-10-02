import { uploadConfig } from "@/config/upload";
import type { ParsedDocument } from "@/types/workspace";

const files = new Map<string, File>();
const contents = new Map<string, string>();
export function validateFiles(incoming: File[], currentCount: number) {
  const accepted: File[] = []; const errors: string[] = [];
  for (const file of incoming) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!uploadConfig.extensions.includes(extension) || (file.type && file.type !== "application/octet-stream" && !uploadConfig.mimeTypes[extension]?.includes(file.type))) {
      errors.push(`${file.name}: Unsupported file format`); continue;
    }
    if (file.size > uploadConfig.maxFileBytes) { errors.push(`${file.name}: File exceeds ${uploadConfig.maxFileBytes / 1024 / 1024} MB`); continue; }
    if (accepted.length + currentCount >= uploadConfig.maxFiles) { errors.push(`Maximum ${uploadConfig.maxFiles} files per workspace`); break; }
    accepted.push(file);
  }
  return { accepted, errors };
}
export function registerFile(file: File): ParsedDocument {
  const id = crypto.randomUUID(); files.set(id, file);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "txt";
  const type = ["png", "jpg", "jpeg"].includes(extension) ? "image" : extension as ParsedDocument["type"];
  return { id, name: file.name, type, mimeType: file.type || uploadConfig.mimeTypes[extension][0], size: file.size, parseStatus: "ready", metadata: { addedAt: new Date().toISOString() } };
}
export function getDocumentContent(document: ParsedDocument) { return contents.get(document.contentRef ?? "") ?? ""; }
export function releaseDocument(id: string) { files.delete(id); contents.delete(id); }
export function releaseFile(id: string) { files.delete(id); }
export function parserResourceCounts() { return { files: files.size, contents: contents.size }; }

export async function parseDocument(document: ParsedDocument, signal: AbortSignal): Promise<ParsedDocument> {
  signal.throwIfAborted();
  const file = files.get(document.id);
  if (!file) throw new Error("Original file is no longer available. Select it again.");
  let text = ""; let pageCount: number | undefined; let width: number | undefined; let height: number | undefined;
  let truncated = false; let warnings: string[] = [];
  if (document.type === "txt" || document.type === "md") {
    text = await file.text();
  } else if (document.type === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    signal.throwIfAborted();
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value; warnings = result.messages.map((message) => message.message);
  } else if (document.type === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
    const abort = () => { void task.destroy().catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const pdf = await task.promise; pageCount = pdf.numPages;
      const chunks: string[] = [];
      for (let page = 1; page <= Math.min(pdf.numPages, uploadConfig.maxPdfPages); page++) {
        signal.throwIfAborted();
        const data = await (await pdf.getPage(page)).getTextContent();
        const chunk = data.items.map((item) => "str" in item ? item.str : "").join(" ");
        chunks.push(chunk); text = chunks.join("\n");
        if (text.length >= uploadConfig.maxContentCharacters) { truncated = page < pdf.numPages; break; }
      }
      truncated ||= pdf.numPages > uploadConfig.maxPdfPages;
    } finally { signal.removeEventListener("abort", abort); await task.destroy(); }
  } else {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width; height = bitmap.height; bitmap.close();
  }
  signal.throwIfAborted();
  truncated ||= text.length > uploadConfig.maxContentCharacters;
  text = text.slice(0, uploadConfig.maxContentCharacters);
  contents.set(document.id, text);
  return { ...document, parseStatus: "completed", parseError: undefined, contentRef: document.id, pageCount, metadata: { ...document.metadata, characters: text.length, width, height, truncated, warnings } };
}
