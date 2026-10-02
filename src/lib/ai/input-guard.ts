import { aiLimits } from "./config";
export function guardDocumentText(text: string) {
  if (text.length <= aiLimits.shortDocumentChars) return { text, sampled: false, originalCharacters: text.length };
  const budget = aiLimits.maxAnalysisChars - 200;
  if (text.length <= budget) return { text, sampled: false, originalCharacters: text.length };
  const size = Math.floor(budget / 5);
  const samples = Array.from({ length: 5 }, (_, i) => {
    const start = Math.floor((text.length - size) * i / 4);
    return `[Sample ${i + 1}; character ${start}]\n${text.slice(start, start + size)}`;
  });
  return { text: samples.join("\n\n"), sampled: true, originalCharacters: text.length };
}
export function untrustedData(value: unknown) {
  // Encode angle brackets so document text cannot close the data delimiter.
  return `<document_content>\n${JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")}\n</document_content>`;
}
export function shouldSuggestFilename(name: string) {
  return /^(?:img[_ -]?\d+|dsc[_ -]?\d+|screenshot[_ -]?\d+|untitled\d*|未命名\d*|document\d+|final\d*)$/i.test(name.replace(/\.[^.]+$/, "").trim());
}
export function sanitizeFilename(suggestion: string, original: string) {
  const extension = original.match(/\.[^.]+$/)?.[0] ?? "";
  let base = (suggestion.split(/[/\\]/).pop() ?? "").replace(/\.[^.]+$/, "").normalize("NFKC").replace(/[\x00-\x1f\x7f/\\:*?"<>|\u202a-\u202e\u2066-\u2069]/g, "-").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 180);
  if (/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(base)) base = `document-${base}`;
  return `${base || "document"}${extension}`;
}
