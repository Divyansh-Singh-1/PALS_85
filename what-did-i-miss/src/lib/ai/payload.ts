import { AiError } from "./errors";
import type { ScoredMessage } from "../../types";

export type AiPayload = {
  messages: { role: "system" | "user"; content: string }[];
  model: string;
};

const SYSTEM_PROMPT = `You are analyzing a chat export. You must summarize ONLY what appears in the messages. Never invent facts, names, dates, or meetings.

Reply with EXACTLY this JSON structure and nothing else:
{
  "tldr": "Summary of long text chats in simple words (max 3 sentences)",
  "importantDates": ["List of important dates and deadlines"],
  "decisions": ["List of important discussions, final results, or conclusions"],
  "actionItems": ["List of important action items or tasks"],
  "missedTasks": ["List of deadlines and tasks the user specifically missed or needs to do"],
  "mentions": [{"reason": "Why the user's name was mentioned in context"}]
}`;

const MAX_MESSAGES = 40;
const MAX_CHAR_PER_MSG = 300;
const MAX_TOTAL_CHARS = 6000;
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function formatDate(ts: Date | null): string {
  if (!ts) return "Unknown time";
  return ts.toLocaleString();
}

function buildFormattedLines(scored: ScoredMessage[]): string[] {
  const topScored = scored.slice(0, MAX_MESSAGES);

  // Sort by time for coherent reading
  const sorted = [...topScored].sort((a, b) => {
    const ta = a.ts ? a.ts.getTime() : 0;
    const tb = b.ts ? b.ts.getTime() : 0;
    return ta - tb;
  });

  let totalChars = 0;
  const lines: string[] = [];

  for (const msg of sorted) {
    const date = formatDate(msg.ts);
    const sender = msg.sender;
    let text = msg.text;

    if (text.length > MAX_CHAR_PER_MSG) {
      text = text.substring(0, MAX_CHAR_PER_MSG - 3) + "...";
    }

    const formatted = `[${date}] ${sender}: ${text}`;
    if (totalChars + formatted.length > MAX_TOTAL_CHARS) {
      break;
    }
    lines.push(formatted);
    totalChars += formatted.length + 1; // +1 for newline
  }

  return lines;
}

export function buildPayload(scored: ScoredMessage[], model: string = DEFAULT_MODEL): AiPayload {
  const lines = buildFormattedLines(scored);

  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: lines.join("\n") },
    ],
    model,
  };
}

export function getPreviewText(scored: ScoredMessage[]): string {
  const lines = buildFormattedLines(scored);
  return lines.join("\n");
}

export function validateResponse(raw: string): { tldr: string; importantDates: string[]; decisions: string[]; actionItems: string[]; missedTasks: string[]; mentions: { reason: string }[] } {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiError(200, "invalid_response", "AI returned an unreadable answer");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new AiError(200, "invalid_response", "AI returned an unreadable answer");
  }

  const obj = parsed as Record<string, unknown>;
  const tldr = typeof obj["tldr"] === "string" ? obj["tldr"] : "Summary unavailable.";
  const importantDates = Array.isArray(obj["importantDates"]) ? obj["importantDates"] : [];
  const decisions = Array.isArray(obj["decisions"]) ? obj["decisions"] : [];
  const actionItems = Array.isArray(obj["actionItems"]) ? obj["actionItems"] : [];
  const missedTasks = Array.isArray(obj["missedTasks"]) ? obj["missedTasks"] : [];
  const mentions = Array.isArray(obj["mentions"]) ? obj["mentions"] : [];

  return { tldr, importantDates, decisions, actionItems, missedTasks, mentions };
}
