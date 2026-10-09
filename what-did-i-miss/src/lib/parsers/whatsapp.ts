import type { DateOrder, Message, ParseResult } from "../../types";

/**
 * Maximum allowed sender name length. Prevents runaway matches on
 * lines that happen to contain a colon far from the start.
 */
const MAX_SENDER_LENGTH = 60;

/**
 * Header regex for Android-style WhatsApp exports.
 * Example: `12/05/25, 10:32 pm - Ravi: text`
 *
 * Captures: (1) date, (2) time (with optional seconds and am/pm), (3) rest of line.
 */
const ANDROID_HEADER =
  /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?)\s+-\s+(.*)$/i;

/**
 * Header regex for iOS-style WhatsApp exports.
 * Example: `[12/05/25, 10:32:15 PM] Ravi: text`
 *
 * Captures: (1) date, (2) time (with optional seconds and am/pm), (3) rest of line.
 */
const IOS_HEADER =
  /^\[(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?)\]\s+(.*)$/i;

/**
 * Header regex for Android copy-paste format.
 * Example: `[10:32 pm, 12/05/2025] Ravi: text`
 *
 * Captures: (1) time, (2) date, (3) rest of line.
 * Note: date and time are swapped vs the other formats.
 */
const ANDROID_COPY_HEADER =
  /^\[(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?),?\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\]\s+(.*)$/i;

/**
 * Splits the "rest" portion of a header line into sender and text.
 * Sender is limited to MAX_SENDER_LENGTH chars and must be followed by `: `.
 */
const SENDER_TEXT = new RegExp(
  `^([^:]{1,${String(MAX_SENDER_LENGTH)}}?):\\s([\\s\\S]*)$`,
);

/**
 * Patterns for media / deleted messages that should be skipped entirely.
 * Matched case-insensitively against the full message text.
 */
const SKIP_TEXT_PATTERNS: readonly RegExp[] = [
  /^<media omitted>/i,
  /^image omitted/i,
  /^video omitted/i,
  /^sticker omitted/i,
  /^audio omitted/i,
  /^this message was deleted/i,
  /^you deleted this message/i,
];

/**
 * Keywords that identify a system line (only when no sender was found).
 * Checked case-insensitively.
 */
const SYSTEM_KEYWORDS: readonly string[] = [
  "end-to-end encrypted",
  "created group",
  "changed the subject",
  "changed this group's icon",
  "changed the group description",
  "joined using this group's invite link",
  "added",
  "removed",
  "left",
];

/** Check if a text matches any of the skip patterns (media/deleted). */
function isSkippableText(text: string): boolean {
  return SKIP_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

/** Check if a no-sender line is a system message. */
function isSystemLine(text: string): boolean {
  const lower = text.toLowerCase();
  return SYSTEM_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Detect date order (DMY vs MDY) by scanning all date strings.
 *
 * - If any first number > 12, it must be a day → DMY.
 * - Else if any second number > 12, it must be a day → MDY.
 * - Otherwise ambiguous → default DMY.
 */
function detectDateOrder(dateStrings: readonly string[]): DateOrder {
  for (const ds of dateStrings) {
    const parts = ds.split(/[./-]/);
    const first = Number(parts[0]);
    if (first > 12) return "DMY";
  }
  for (const ds of dateStrings) {
    const parts = ds.split(/[./-]/);
    const second = Number(parts[1]);
    if (second > 12) return "MDY";
  }
  return "DMY";
}

/**
 * Parse a date string and time string into a Date object.
 *
 * @returns A valid Date, or null if the result would be invalid.
 */
function parseDateTime(
  dateStr: string,
  timeStr: string,
  dateOrder: DateOrder,
): Date | null {
  const dateParts = dateStr.split(/[./-]/);
  if (dateParts.length < 3) return null;

  const a = Number(dateParts[0]);
  const b = Number(dateParts[1]);
  const rawYear = Number(dateParts[2]);

  let day: number;
  let month: number;
  if (dateOrder === "DMY") {
    day = a;
    month = b;
  } else {
    month = a;
    day = b;
  }

  // 2-digit year → 2000+yy
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

  // Validate month range
  if (month < 1 || month > 12) return null;
  // Validate day range (rough)
  if (day < 1 || day > 31) return null;

  // Parse time
  const timeLower = timeStr.toLowerCase().replace(/\./g, "");
  const isPM = /pm$/.test(timeLower);
  const isAM = /am$/.test(timeLower);
  const timeDigits = timeLower.replace(/[ap]m$/i, "").trim();
  const timeParts = timeDigits.split(":");
  let hours = Number(timeParts[0]);
  const minutes = Number(timeParts[1] ?? 0);
  const seconds = Number(timeParts[2] ?? 0);

  if (isPM || isAM) {
    // 12-hour format
    if (isPM && hours !== 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
  }

  const date = new Date(year, month - 1, day, hours, minutes, seconds);

  // Validate the Date isn't NaN
  if (isNaN(date.getTime())) return null;

  return date;
}

/**
 * Parse a raw WhatsApp chat export into structured messages.
 *
 * Supports both Android and iOS export formats. Pure function with no
 * DOM access or side effects. Performs a single pass over lines, O(n).
 *
 * @param raw - The raw chat export text (should be normalized first via `normalizeRaw`).
 * @returns Parsed messages, metadata, and skip count.
 */
export function parseWhatsApp(raw: string): ParseResult {
  const empty: ParseResult = {
    messages: [],
    hasTimestamps: false,
    dateOrder: "DMY",
    skippedLines: 0,
  };

  if (!raw || !raw.trim()) return empty;

  const lines = raw.split("\n");

  type HeaderMatch = {
    dateStr: string;
    timeStr: string;
    rest: string;
  };

  /**
   * Try to match a line as a WhatsApp header (Android or iOS format).
   * Returns the parsed header parts or null.
   */
  function tryMatchHeader(line: string): HeaderMatch | null {
    let match = ANDROID_HEADER.exec(line);
    if (!match) {
      match = IOS_HEADER.exec(line);
    }
    if (match) {
      return {
        dateStr: match[1] ?? "",
        timeStr: match[2] ?? "",
        rest: match[3] ?? "",
      };
    }
    // Android copy format: [time, date] Sender: text — captures are swapped
    const copyMatch = ANDROID_COPY_HEADER.exec(line);
    if (copyMatch) {
      return {
        dateStr: copyMatch[2] ?? "", // date is capture 2
        timeStr: copyMatch[1] ?? "", // time is capture 1
        rest: copyMatch[3] ?? "",
      };
    }
    return null;
  }

  // Single regex pass: match all headers and cache results
  const headerCache = new Map<number, HeaderMatch>();
  const allDateStrings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const header = tryMatchHeader(lines[i] ?? "");
    if (header) {
      headerCache.set(i, header);
      allDateStrings.push(header.dateStr);
    }
  }

  if (allDateStrings.length === 0) return empty;

  const dateOrder = detectDateOrder(allDateStrings);

  // Build messages using cached header matches
  const messages: Message[] = [];
  let skippedLines = 0;
  let currentMessage: Message | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const header = headerCache.get(i);

    if (header) {
      const { dateStr, timeStr, rest } = header;

      // Step B: try to split rest into sender + text
      const senderMatch = SENDER_TEXT.exec(rest);
      if (!senderMatch) {
        // No sender → check if it's a system line
        if (isSystemLine(rest)) {
          skippedLines++;
        } else {
          // If it's an unknown no-sender format, we still count it as skipped
          skippedLines++;
        }
        continue;
      }

      const sender = (senderMatch[1] ?? "").trim();
      const text = (senderMatch[2] ?? "").trim();

      // Check if this is a skippable message (media/deleted)
      if (isSkippableText(text)) {
        skippedLines++;
        continue;
      }

      const ts = parseDateTime(dateStr, timeStr, dateOrder);

      currentMessage = {
        id: messages.length,
        ts,
        sender,
        text,
      };
      messages.push(currentMessage);
    } else {
      // Not a header line → continuation of previous message
      if (currentMessage !== null) {
        currentMessage.text += "\n" + line;
      }
      // If no previous message, ignore this line (spec rule 1)
    }
  }

  // Trim trailing whitespace from all message texts (from final newlines)
  for (const msg of messages) {
    msg.text = msg.text.trimEnd();
  }

  const hasTimestamps = messages.some((m) => m.ts !== null);

  return {
    messages,
    hasTimestamps,
    dateOrder,
    skippedLines,
  };
}

