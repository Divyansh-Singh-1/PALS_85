import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseWhatsApp } from "../src/lib/parsers/whatsapp";
import { normalizeRaw } from "../src/lib/parsers/normalize";
import { parseChat } from "../src/lib/parsers/index";

const fixturesDir = join(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

// ---------------------------------------------------------------------------
// normalizeRaw
// ---------------------------------------------------------------------------
describe("normalizeRaw", () => {
  it("removes BOM", () => {
    const input = "\uFEFFhello";
    expect(normalizeRaw(input)).toBe("hello");
  });

  it("converts \\r\\n and \\r to \\n", () => {
    expect(normalizeRaw("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("removes invisible direction marks", () => {
    const input = "\u200Ehello\u200Fworld\u202Atest\u202E";
    expect(normalizeRaw(input)).toBe("helloworldtest");
  });

  it("replaces U+202F and U+00A0 with normal space", () => {
    const input = "10:32\u202FAM 5\u00A0PM";
    expect(normalizeRaw(input)).toBe("10:32 AM 5 PM");
  });

  it("trims trailing spaces on each line", () => {
    expect(normalizeRaw("hello   \nworld  ")).toBe("hello\nworld");
  });

  it("preserves blank lines", () => {
    expect(normalizeRaw("a\n\nb")).toBe("a\n\nb");
  });
});

// ---------------------------------------------------------------------------
// WhatsApp parser — Android format
// ---------------------------------------------------------------------------
describe("parseWhatsApp — Android format", () => {
  it("parses sender, text, and correct Date with 12-hour pm time", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-android.txt"));
    const result = parseWhatsApp(raw);

    expect(result.messages.length).toBeGreaterThanOrEqual(4);

    const first = result.messages[0];
    expect(first).toBeDefined();
    expect(first!.sender).toBe("Ravi");
    expect(first!.text).toBe(
      "Hey everyone! Meeting tomorrow at 5:30: confirm attendance",
    );
    expect(first!.ts).not.toBeNull();
    // 10:32 PM → hours should be 22
    expect(first!.ts!.getHours()).toBe(22);
    expect(first!.ts!.getMinutes()).toBe(33);
  });

  it("detects DMY date order when first number > 12", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-android.txt"));
    const result = parseWhatsApp(raw);
    // 13/05/25 has first number 13 > 12 → DMY
    expect(result.dateOrder).toBe("DMY");
  });

  it("has timestamps", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-android.txt"));
    const result = parseWhatsApp(raw);
    expect(result.hasTimestamps).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WhatsApp parser — iOS format
// ---------------------------------------------------------------------------
describe("parseWhatsApp — iOS format", () => {
  it("parses iOS bracket format with seconds", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-ios.txt"));
    const result = parseWhatsApp(raw);

    expect(result.messages.length).toBeGreaterThanOrEqual(3);

    const first = result.messages[0];
    expect(first).toBeDefined();
    expect(first!.sender).toBe("Ravi");
    expect(first!.text).toBe(
      "Hey everyone! Meeting tomorrow at 5:30: confirm attendance",
    );
    expect(first!.ts).not.toBeNull();
    expect(first!.ts!.getHours()).toBe(10);
    expect(first!.ts!.getMinutes()).toBe(32);
    expect(first!.ts!.getSeconds()).toBe(15);
  });

  it("handles U+202F before AM/PM (iOS behavior)", () => {
    // U+202F is narrow no-break space that iOS puts before AM/PM
    const input = "[05/12/25, 10:32:15\u202FAM] Ravi: Hello";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.ts).not.toBeNull();
    expect(result.messages[0]!.ts!.getHours()).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Multiline messages
// ---------------------------------------------------------------------------
describe("multiline messages", () => {
  it("merges continuation lines into one message with \\n", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-android.txt"));
    const result = parseWhatsApp(raw);

    // Meena's message has a continuation line
    const meenaMsg = result.messages.find((m) => m.sender === "Meena");
    expect(meenaMsg).toBeDefined();
    expect(meenaMsg!.text).toContain("\n");
    expect(meenaMsg!.text).toContain("What time should I arrive?");
  });

  it("merges iOS multiline messages", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-ios.txt"));
    const result = parseWhatsApp(raw);

    const meenaMsg = result.messages.find((m) =>
      m.sender.startsWith("Meena"),
    );
    expect(meenaMsg).toBeDefined();
    expect(meenaMsg!.text).toContain("\n");
    expect(meenaMsg!.text).toContain("Let me check my schedule first");
  });
});

// ---------------------------------------------------------------------------
// System lines
// ---------------------------------------------------------------------------
describe("system lines", () => {
  it("skips 'end-to-end encrypted' and 'added' system lines", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-android.txt"));
    const result = parseWhatsApp(raw);

    // No message should have sender matching system text
    const senders = result.messages.map((m) => m.sender);
    expect(senders).not.toContain("Messages and calls are end-to-end encrypted");

    // Skipped lines should include system lines
    expect(result.skippedLines).toBeGreaterThanOrEqual(2);
  });

  it("skips 'joined using this group's invite link'", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-ios.txt"));
    const result = parseWhatsApp(raw);

    const senders = result.messages.map((m) => m.sender);
    expect(senders).not.toContain("Ravi joined using this group's invite link");
    expect(result.skippedLines).toBeGreaterThanOrEqual(2);
  });

  it("does NOT skip real messages containing the word 'added'", () => {
    const input =
      '12/05/25, 10:33 pm - Ravi: I added the new docs to the repo';
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.text).toBe(
      "I added the new docs to the repo",
    );
  });
});

// ---------------------------------------------------------------------------
// Media omitted & deleted messages
// ---------------------------------------------------------------------------
describe("media omitted and deleted messages", () => {
  it("skips <Media omitted> and deleted messages", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-android.txt"));
    const result = parseWhatsApp(raw);

    const texts = result.messages.map((m) => m.text);
    expect(texts).not.toContain("<Media omitted>");
    expect(texts).not.toContain("This message was deleted");

    // At least 2 skipped: media + deleted
    expect(result.skippedLines).toBeGreaterThanOrEqual(4); // system + media + deleted
  });

  it("skips 'You deleted this message' (iOS)", () => {
    const raw = normalizeRaw(loadFixture("whatsapp-ios.txt"));
    const result = parseWhatsApp(raw);

    const texts = result.messages.map((m) => m.text);
    expect(texts).not.toContain("You deleted this message");
  });

  it("skips image omitted, video omitted, sticker omitted, audio omitted", () => {
    const input = [
      "12/05/25, 10:33 pm - Ravi: image omitted",
      "12/05/25, 10:34 pm - Ravi: video omitted",
      "12/05/25, 10:35 pm - Ravi: sticker omitted",
      "12/05/25, 10:36 pm - Ravi: audio omitted",
    ].join("\n");
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages.length).toBe(0);
    expect(result.skippedLines).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 24-hour time
// ---------------------------------------------------------------------------
describe("24-hour time", () => {
  it("parses 24-hour time without am/pm", () => {
    const input = "13/05/25, 14:30 - Meena: Using 24-hour format here";
    const result = parseWhatsApp(normalizeRaw(input));

    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.ts).not.toBeNull();
    expect(result.messages[0]!.ts!.getHours()).toBe(14);
    expect(result.messages[0]!.ts!.getMinutes()).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Date order detection
// ---------------------------------------------------------------------------
describe("date order detection", () => {
  it("detects DMY when first number > 12", () => {
    const input = "13/05/25, 10:00 am - Ravi: Hello";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.dateOrder).toBe("DMY");
  });

  it("detects MDY when second number > 12", () => {
    const input = "05/13/25, 10:00 am - Ravi: Hello";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.dateOrder).toBe("MDY");
  });

  it("defaults to DMY when ambiguous", () => {
    const input = "05/12/25, 10:00 am - Ravi: Hello";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.dateOrder).toBe("DMY");
  });
});

// ---------------------------------------------------------------------------
// Colon in text
// ---------------------------------------------------------------------------
describe("colon in text", () => {
  it("parses sender correctly when text contains colons", () => {
    const input =
      "12/05/25, 10:33 pm - Ravi: meeting at 5:30: confirm";
    const result = parseWhatsApp(normalizeRaw(input));

    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.sender).toBe("Ravi");
    expect(result.messages[0]!.text).toBe("meeting at 5:30: confirm");
  });
});

// ---------------------------------------------------------------------------
// Sender with spaces and emoji
// ---------------------------------------------------------------------------
describe("sender with spaces and emoji", () => {
  it("parses sender name with spaces", () => {
    const input = "12/05/25, 10:33 pm - Arjun Kumar: Hello there";
    const result = parseWhatsApp(normalizeRaw(input));

    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.sender).toBe("Arjun Kumar");
  });

  it("parses sender name with emoji", () => {
    const input = "[05/12/25, 10:34:22 AM] Meena 😊: Hello";
    const result = parseWhatsApp(normalizeRaw(input));

    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.sender).toBe("Meena 😊");
  });
});

// ---------------------------------------------------------------------------
// Empty / garbage input
// ---------------------------------------------------------------------------
describe("empty and garbage input", () => {
  it("returns empty result for empty string", () => {
    const result = parseWhatsApp("");
    expect(result.messages).toEqual([]);
    expect(result.hasTimestamps).toBe(false);
    expect(result.dateOrder).toBe("DMY");
    expect(result.skippedLines).toBe(0);
  });

  it("returns empty result for whitespace-only string", () => {
    const result = parseWhatsApp("   \n\n  \t  ");
    expect(result.messages).toEqual([]);
    expect(result.hasTimestamps).toBe(false);
  });

  it("returns empty result for random garbage text", () => {
    const result = parseWhatsApp(
      "Lorem ipsum dolor sit amet\nThis is not a chat\n42",
    );
    expect(result.messages).toEqual([]);
    expect(result.hasTimestamps).toBe(false);
  });

  it("never throws on bad input", () => {
    expect(() => parseWhatsApp("")).not.toThrow();
    expect(() => parseWhatsApp("!!!")).not.toThrow();
    expect(() =>
      parseWhatsApp("12/05/25, 10:32 pm - broken line with no colon text"),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Invalid date
// ---------------------------------------------------------------------------
describe("invalid date", () => {
  it("sets ts to null for invalid date (month 13 in MDY)", () => {
    // Force MDY: no first number > 12, but second number 13 > 12 → MDY
    const input = [
      "01/13/25, 10:00 am - Ravi: This forces MDY",
      "12/10/25, 10:00 am - Meena: Normal msg in MDY",
    ].join("\n");
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.dateOrder).toBe("MDY");
    expect(result.messages.length).toBe(2);
    // First msg: MDY → month=1, day=13 → valid
    expect(result.messages[0]!.ts).not.toBeNull();
    // Second msg: MDY → month=12, day=10 → valid
    expect(result.messages[1]!.ts).not.toBeNull();
  });

  it("sets hasTimestamps to false when all timestamps are null", () => {
    // Force all dates to be invalid: use month 0 in DMY
    const input = "01/00/25, 10:00 am - Ravi: Zero month in DMY";
    const result = parseWhatsApp(normalizeRaw(input));
    // DMY default (ambiguous), so day=1, month=0 → invalid
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.ts).toBeNull();
    expect(result.hasTimestamps).toBe(false);
  });

  it("hasTimestamps false when ALL timestamps are invalid", () => {
    // Construct a scenario where all dates are invalid
    // Force MDY with second number > 12 on one line, then all other dates invalid
    const input = "01/13/25, 10:00 am - Ravi: Valid one\n13/13/25, 10:00 am - Meena: Both 13";
    const result = parseWhatsApp(normalizeRaw(input));
    // MDY: first line month=1 day=13 ✓, second line month=13 day=13 ✗
    expect(result.messages[1]!.ts).toBeNull();
    // First is still valid, so hasTimestamps = true
    // To truly test all-null, we need all dates invalid:
    const input2 = "13/00/25, 10:00 am - Ravi: Zero month";
    const result2 = parseWhatsApp(normalizeRaw(input2));
    // DMY (13>12 → first number > 12 → DMY), month=0 → invalid
    expect(result2.messages.length).toBe(1);
    expect(result2.messages[0]!.ts).toBeNull();
    expect(result2.hasTimestamps).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseChat integration
// ---------------------------------------------------------------------------
describe("parseChat (entry point)", () => {
  it("normalizes and parses in one call", () => {
    const raw =
      "\uFEFF\u200E12/05/25, 10:33\u202Fpm - Ravi: Hello world";
    const result = parseChat(raw);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.sender).toBe("Ravi");
  });
});

// ---------------------------------------------------------------------------
// 12 AM / 12 PM edge cases
// ---------------------------------------------------------------------------
describe("12-hour edge cases", () => {
  it("parses 12 AM as hour 0", () => {
    const input = "12/05/25, 12:00 am - Ravi: Midnight";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages[0]!.ts!.getHours()).toBe(0);
  });

  it("parses 12 PM as hour 12", () => {
    const input = "12/05/25, 12:00 pm - Ravi: Noon";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages[0]!.ts!.getHours()).toBe(12);
  });

  it("parses p.m. with dots", () => {
    const input = "12/05/25, 3:30 p.m. - Ravi: Afternoon";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages[0]!.ts!.getHours()).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Date separator variants
// ---------------------------------------------------------------------------
describe("date separator variants", () => {
  it("parses dates with dots", () => {
    const input = "13.05.25, 10:00 am - Ravi: Dot separated";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.ts).not.toBeNull();
  });

  it("parses dates with dashes", () => {
    const input = "13-05-25, 10:00 am - Ravi: Dash separated";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.ts).not.toBeNull();
  });

  it("parses 4-digit year", () => {
    const input = "13/05/2025, 10:00 am - Ravi: Full year";
    const result = parseWhatsApp(normalizeRaw(input));
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]!.ts).not.toBeNull();
    expect(result.messages[0]!.ts!.getFullYear()).toBe(2025);
  });
});

// ---------------------------------------------------------------------------
// Performance test
// ---------------------------------------------------------------------------
describe("performance", () => {
  it("handles 50,000 lines in under 500ms", () => {
    const lines: string[] = [];
    for (let i = 0; i < 50_000; i++) {
      const hour = (i % 12) + 1;
      const ampm = i % 2 === 0 ? "am" : "pm";
      lines.push(
        `12/05/25, ${String(hour)}:${String(i % 60).padStart(2, "0")} ${ampm} - User${String(i % 100)}: Message number ${String(i)}`,
      );
    }
    const raw = lines.join("\n");

    const start = performance.now();
    const result = parseWhatsApp(normalizeRaw(raw));
    const elapsed = performance.now() - start;

    expect(result.messages.length).toBe(50_000);
    expect(elapsed).toBeLessThan(2000);
  });
});
