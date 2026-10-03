import { uploadConfig } from "@/config/upload";
import type { ParsedDocument } from "@/types/workspace";
import type { ParsedStructure } from "@/lib/retrieval/types";

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
export function getOriginalFile(id: string) { return files.get(id); }
export function restoreDocumentContent(id: string, text: string) { contents.set(id, text); }
async function hashBytes(bytes: ArrayBuffer) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join(""); }
export function releaseDocument(id: string) { files.delete(id); contents.delete(id); }
export function releaseFile(id: string) { files.delete(id); }
export function parserResourceCounts() { return { files: files.size, contents: contents.size }; }

export async function parseDocument(document: ParsedDocument, signal: AbortSignal): Promise<ParsedDocument> {
  signal.throwIfAborted();
  const file = files.get(document.id);
  if (!file) {
    if (contents.has(document.id)) return { ...document, contentRef: document.id, parseStatus: "completed", parseError: undefined };
    throw new Error("Original file is no longer available. Select it again.");
  }
  let text = ""; let pageCount: number | undefined; let width: number | undefined; let height: number | undefined;
  let truncated = false; let warnings: string[] = [];
  const structure: ParsedStructure = {};
  if (document.type === "txt" || document.type === "md") {
    text = await file.text();
  } else if (document.type === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    signal.throwIfAborted();
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    // Parse in an inert document; never render converted HTML. Page numbers in
    // Word depend on layout, so store headings and paragraph offsets only.
    const dom = new DOMParser().parseFromString(result.value, "text/html");
    structure.paragraphs = [];
    for (const node of dom.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li")) {
      if (node.tagName === "LI" && node.querySelector("p")) continue;
      const value = node.textContent ?? "";
      if (!value.trim()) continue;
      if (text) text += "\n\n";
      const charStart = text.length; text += value;
      const level = /^H[1-6]$/.test(node.tagName) ? Number(node.tagName.slice(1)) : undefined;
      structure.paragraphs.push({ index: structure.paragraphs.length + 1, charStart, charEnd: text.length, ...(level ? { heading: value, level } : {}) });
    }
    warnings = result.messages.map((message) => message.message);
  } else if (document.type === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const bytes = new Uint8Array(await file.arrayBuffer()); signal.throwIfAborted();
    const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/" });
    const abort = () => { void task.destroy().catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const pdf = await task.promise; pageCount = pdf.numPages;
      const chunks: string[] = [];
      structure.pages = [];
      for (let page = 1; page <= Math.min(pdf.numPages, uploadConfig.maxPdfPages); page++) {
        signal.throwIfAborted();
        const data = await (await pdf.getPage(page)).getTextContent();
        const chunk = data.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
        const charStart = text.length + (chunks.length ? 1 : 0);
        chunks.push(chunk); text = chunks.join("\n");
        structure.pages.push({ page, charStart, charEnd: text.length });
        if (text.length >= uploadConfig.maxContentCharacters) { truncated = page < pdf.numPages; break; }
      }
      truncated ||= pdf.numPages > uploadConfig.maxPdfPages;
      const lowTextPages = structure.pages.filter(p => text.slice(p.charStart, p.charEnd).trim().length < 80).length;
      if (lowTextPages) warnings.push(`Low extracted text on ${lowTextPages} page(s). Possible scanned document; OCR / Vision PDF fallback is not available yet.`);
    } finally { signal.removeEventListener("abort", abort); await task.destroy(); }
  } else {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width; height = bitmap.height; bitmap.close();
  }
  signal.throwIfAborted();
  truncated ||= text.length > uploadConfig.maxContentCharacters;
  text = text.slice(0, uploadConfig.maxContentCharacters);
  if (structure.pages) structure.pages = structure.pages.filter(p => p.charStart < text.length).map(p => ({ ...p, charEnd: Math.min(p.charEnd, text.length) }));
  if (structure.paragraphs) structure.paragraphs = structure.paragraphs.filter(p => p.charStart < text.length).map(p => ({ ...p, charEnd: Math.min(p.charEnd, text.length) }));
  contents.set(document.id, text);
  const contentHash = await hashBytes(await file.arrayBuffer());
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const normalizedTextHash = normalized && !truncated ? await hashBytes(new TextEncoder().encode(normalized).buffer) : undefined;
  signal.throwIfAborted();
  return { ...document, contentHash, normalizedTextHash, parseStatus: "completed", parseError: undefined, contentRef: document.id, pageCount, metadata: { ...document.metadata, characters: text.length, width, height, truncated, warnings, structure } };
}
