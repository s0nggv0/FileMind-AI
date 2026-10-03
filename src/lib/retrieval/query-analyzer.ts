export type QueryType = "semantic" | "exact" | "mixed" | "filename" | "code" | "identifier" | "short_ambiguous" | "followup";
export interface QueryProfile {
  language: "zh" | "en" | "mixed" | "other";
  tokenCount: number;
  containsCodeToken: boolean;
  containsVersion: boolean;
  containsErrorCode: boolean;
  containsQuotedPhrase: boolean;
  containsFilename: boolean;
  containsAcronym: boolean;
  exactTerms: string[];
  exactnessScore: number;
  semanticScore: number;
  type: QueryType;
}
// Scores count deterministic routing signals, never probabilities.
export class QueryAnalyzer {
  analyze(query: string): QueryProfile {
    const text = query.normalize("NFKC").replace(/\s+/g, " ").trim();
    const words = text.match(/[\p{L}\p{N}_+.\/-]+/gu) ?? [];
    const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
    const latin = /[a-z]/i.test(text);
    const filenames = text.match(/(?:[\w\u4e00-\u9fff-]+\.)+(?:pdf|docx|txt|md|png|jpe?g|csv|tsx?|jsx?|json|ya?ml)\b/gi) ?? [];
    const code = text.match(/\b(?:[a-z]+[A-Z][\w]*|[A-Z][a-z]+[A-Z][\w]*|[A-Za-z]+_[A-Za-z_\d]+|(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*\(\))/g) ?? [];
    const versions = text.match(/\b(?:[\w-]*v?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)\b/gi) ?? [];
    const errors = text.match(/\b(?:HTTP\s*[1-5]\d{2}|RFC\s*\d{3,5}|[A-Z][A-Z_]*\d{3,}|[A-Z][A-Z_]+_[A-Z_]+)\b/g) ?? [];
    const quotes = [...text.matchAll(/["“`「]([^"”`」]{1,160})["”`」]/g)].map(m => m[1]);
    const acronyms = text.match(/\b[A-Z]{2,12}\b/g) ?? [];
    const symbolic = text.match(/\b[A-Za-z]\+\s*[A-Za-z]+\b/g) ?? [];
    const exactTerms = [...new Set([...filenames, ...code, ...versions, ...errors, ...quotes, ...acronyms, ...symbolic])];
    const exactnessScore = Number(!!filenames.length) * 3 + Number(!!code.length) * 2 + Number(!!versions.length) * 2 + Number(!!errors.length) * 3 + Number(!!quotes.length) * 2 + Number(!!acronyms.length) + Number(!!symbolic.length) * 2;
    const semanticScore = Number(han >= 6) + Number(words.length >= 5) + Number(/[?？]|\b(?:how|why|which|compare|explain|what)\b|什么|如何|怎样|哪些|哪份|原理/i.test(text));
    let type: QueryType;
    if (/Follow-up:|\b(?:it|that|those|these)\b|^(?:它|这(?:个|些)?|那(?:个|些)?)/i.test(text)) type = "followup";
    else if (filenames.length) type = "filename";
    else if (exactnessScore && semanticScore) type = "mixed";
    else if (errors.length || quotes.length || acronyms.length || symbolic.length) type = "exact";
    else if (code.length) type = "code";
    else if (versions.length || (words.length === 1 && /^[a-z][a-z\d.-]{2,}$/.test(text))) type = "identifier";
    else if (semanticScore) type = "semantic";
    else type = words.length <= 3 && han < 6 ? "short_ambiguous" : "semantic";
    return { language: han ? latin ? "mixed" : "zh" : latin ? "en" : "other", tokenCount: words.length + han, containsCodeToken: !!code.length, containsVersion: !!versions.length, containsErrorCode: !!errors.length, containsQuotedPhrase: !!quotes.length, containsFilename: !!filenames.length, containsAcronym: !!acronyms.length, exactTerms, exactnessScore, semanticScore, type };
  }
}
