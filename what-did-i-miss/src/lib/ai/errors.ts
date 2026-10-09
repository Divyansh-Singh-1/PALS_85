export type AiErrorKind = "auth" | "rate_limit" | "model" | "too_large" | "network" | "timeout" | "invalid_response";

export class AiError extends Error {
  readonly status: number;
  readonly kind: AiErrorKind;
  readonly retryAfter: number | null; // seconds, from Retry-After header
  
  constructor(status: number, kind: AiErrorKind, message: string, retryAfter?: number) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.kind = kind;
    this.retryAfter = retryAfter ?? null;
  }
  
  static fromStatus(status: number, _body: string, retryAfter?: number): AiError {
    if (status === 401) {
      return new AiError(status, "auth", "Groq rejected the API key (401). Update GROQ_API_KEY and restart the server.", retryAfter);
    }
    if (status === 429) {
      return new AiError(status, "rate_limit", `Rate limit reached, retry in ${retryAfter ?? 2} seconds`, retryAfter);
    }
    if (status === 404) {
      return new AiError(status, "model", "Model not found. The server will try a fallback.", retryAfter);
    }
    if (status === 413) {
      return new AiError(status, "too_large", "Request too large. Try a shorter date range.", retryAfter);
    }
    if (status === 408) {
      return new AiError(status, "timeout", "AI request timed out (20s). Try again.", retryAfter);
    }
    if (status >= 500 && status <= 599) {
      return new AiError(status, "network", `Groq server error (${status}). Try again later.`, retryAfter);
    }
    return new AiError(status, "network", `Unexpected error (${status}).`, retryAfter);
  }
}
