/**
 * Normalize raw chat export text for consistent parsing.
 *
 * - Removes BOM (U+FEFF).
 * - Converts \r\n and \r to \n.
 * - Strips invisible direction marks: U+200E, U+200F, U+202A–U+202E.
 * - Replaces U+202F (narrow no-break space) and U+00A0 (NBSP) with a normal space.
 *   iOS inserts U+202F before AM/PM.
 * - Trims trailing spaces on each line but preserves blank lines.
 */
export function normalizeRaw(input: string): string {
  let result = input;

  // Remove BOM
  if (result.charCodeAt(0) === 0xfeff) {
    result = result.slice(1);
  }

  // Normalize line endings: \r\n → \n, then lone \r → \n
  result = result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove invisible direction marks: LRM, RLM, LRE, RLE, PDF, LRO, RLO
  result = result.replace(/[\u200E\u200F\u202A-\u202E]/g, "");

  // Replace narrow no-break space (U+202F) and NBSP (U+00A0) with normal space
  result = result.replace(/[\u202F\u00A0]/g, " ");

  // Trim trailing spaces on each line (preserve blank lines and leading spaces)
  result = result.replace(/[ \t]+$/gm, "");

  return result;
}
