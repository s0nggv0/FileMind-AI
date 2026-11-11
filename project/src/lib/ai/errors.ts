export type AIErrorCode = "TIMEOUT" | "RATE_LIMIT" | "INVALID_KEY" | "UNAVAILABLE" | "STRUCTURED_OUTPUT" | "NETWORK" | "CONTENT_TOO_LONG" | "STEP_LIMIT" | "CONFIGURATION";
export class AIError extends Error {
  constructor(public code: AIErrorCode, message: string, public retryable: boolean, public provider: string, public status?: number) { super(message); this.name = "AIError"; }
}
export function normalizeAIError(error: unknown, provider = "ai"): AIError {
  if (error instanceof AIError) return error;
  const e = error as { statusCode?: number; status?: number; name?: string } | null;
  const status = e?.statusCode ?? e?.status;
  if (status === 401 || status === 403) return new AIError("INVALID_KEY", "AI service credentials need attention.", false, provider, status);
  if (status === 429) return new AIError("RATE_LIMIT", "AI service is busy. Retry shortly.", true, provider, status);
  if (status === 413) return new AIError("CONTENT_TOO_LONG", "Document exceeds the AI input limit.", false, provider, status);
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return new AIError("TIMEOUT", "AI analysis timed out. You can retry.", true, provider);
  if (/NoObjectGenerated|NoOutputGenerated|TypeValidation|ZodError/.test(e?.name ?? "")) return new AIError("STRUCTURED_OUTPUT", "AI returned an invalid result. You can retry.", true, provider);
  return new AIError(status ? "UNAVAILABLE" : "NETWORK", "AI service is temporarily unavailable.", true, provider, status);
}
