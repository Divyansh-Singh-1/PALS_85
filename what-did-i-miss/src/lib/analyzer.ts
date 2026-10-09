import type { Message } from "../types";

export type AnalysisResult = {
  filteredMessages: Message[];
  importantMeetings: Message[];
  importantDates: Message[];
};

/**
 * Basic heuristic analyzer to extract important messages without an AI backend.
 */
export function analyzeMessages(
  messages: Message[],
  startDate: Date | null,
  endDate: Date | null,
): AnalysisResult {
  // 1. Filter by date
  let filtered = messages;
  if (startDate) {
    filtered = filtered.filter((m) => m.ts && m.ts >= startDate);
  }
  if (endDate) {
    // End date inclusive of the entire day
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter((m) => m.ts && m.ts <= end);
  }

  // 2. Extract meetings (heuristics: "meet", "meeting", "zoom", "call", "schedule")
  const meetingKeywords = ["meet", "meeting", "zoom", "call", "schedule", "interview"];
  const importantMeetings = filtered.filter((m) => {
    const lowerText = m.text.toLowerCase();
    return meetingKeywords.some((kw) => lowerText.includes(kw));
  });

  // 3. Extract dates/deadlines (heuristics: "deadline", "due", "tomorrow", "by monday")
  const dateKeywords = ["deadline", "due", "tomorrow", "urgent", "by "];
  const importantDates = filtered.filter((m) => {
    const lowerText = m.text.toLowerCase();
    return dateKeywords.some((kw) => lowerText.includes(kw));
  });

  return {
    filteredMessages: filtered,
    importantMeetings,
    importantDates,
  };
}
