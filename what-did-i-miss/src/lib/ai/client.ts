import { AiError } from "./errors";
import { buildPayload, validateResponse } from "./payload";
import type { ScoredMessage, AiSummary } from "../../types";

export async function fetchAiSummary(scored: ScoredMessage[]): Promise<AiSummary> {
  const payload = buildPayload(scored);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000); // 20s timeout
  
  try {
    let response = await callApi(payload, controller.signal);
    
    // If 404 (model not found) or decommissioned, retry with fallback model
    if (response.status === 404) {
      const fallbackPayload = buildPayload(scored, "llama-3.1-8b-instant");
      response = await callApi(fallbackPayload, controller.signal);
    }
    
    // If 429 or 5xx, retry once after backoff
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "2", 10);
      await sleep(Math.min(retryAfter, 10) * 1000);
      response = await callApi(payload, controller.signal);
    }
    
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const retryAfter = response.headers.get("Retry-After");
      throw AiError.fromStatus(response.status, body, retryAfter ? parseInt(retryAfter, 10) : undefined);
    }
    
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    return validateResponse(content);
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AiError(408, "timeout", "AI request timed out (20s). Try again.");
    }
    throw new AiError(0, "network", `Network error: ${err instanceof Error ? err.message : "Unknown"}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callApi(payload: ReturnType<typeof buildPayload>, signal: AbortSignal): Promise<Response> {
  return fetch("/api/groq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: payload.messages,
      model: payload.model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 600,
    }),
    signal,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
