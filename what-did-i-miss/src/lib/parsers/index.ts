import type { ParseResult } from "../../types";
import { normalizeRaw } from "./normalize";
import { parseWhatsApp } from "./whatsapp";

/**
 * Parse a raw chat export into structured messages.
 *
 * Currently supports WhatsApp (Android & iOS) exports.
 * Normalizes the input once before passing it to the format-specific parser.
 *
 * @param raw - The raw chat export text as pasted by the user.
 * @returns Parsed messages with metadata.
 */
// Phase 2 will add Discord and Slack parsers here with auto-detection
// of the chat format based on the input content.
export function parseChat(raw: string): ParseResult {
  const normalized = normalizeRaw(raw);
  return parseWhatsApp(normalized);
}
