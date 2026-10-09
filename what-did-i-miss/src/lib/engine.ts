import type { Message, ScoredMessage, ExtractedDate, AnalysisResult, Priority, FlagReason } from "../types";

export function filterByDateRange(messages: Message[], start: Date | null, end: Date | null): Message[] {
  return messages.filter(msg => {
    if (!msg.ts && (start || end)) return false;
    if (!msg.ts) return true;
    
    if (start && msg.ts < start) return false;
    if (end) {
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      if (msg.ts > endOfDay) return false;
    }
    return true;
  });
}

export function findMentions(messages: Message[], names: string[]): Message[] {
  if (names.length === 0) return [];
  
  const namePatterns = names.map(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Phone numbers: just use includes (no word boundary needed)
    if (/^\+?\d[\d\s-]{5,}$/.test(name)) {
      return { regex: new RegExp(escaped, "i"), isPhone: true };
    }
    return { regex: new RegExp(`\\b${escaped}\\b`, "i"), isPhone: false };
  });

  return messages.filter(msg => {
    // Exclude user's own messages
    if (names.some(name => msg.sender.toLowerCase() === name.toLowerCase())) {
      return false;
    }
    
    return namePatterns.some(p => p.regex.test(msg.text));
  });
}

export function extractDates(messages: Message[], now: Date): ExtractedDate[] {
  const dates: ExtractedDate[] = [];
  
  const keywords = {
    meeting: ["meet", "meeting", "zoom", "call", "standup", "sync", "catch up"],
    deadline: ["deadline", "due", "submit", "submission"],
    exam: ["exam", "test", "quiz", "midterm", "final"],
    event: ["event", "party", "celebration", "workshop", "seminar", "hackathon"],
  };

  const datePatterns = [
    /tomorrow/i,
    /today/i,
    /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /on\s+\d{1,2}(st|nd|rd|th)?/i,
    /by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i,
    /\d{1,2}\/\d{1,2}/i
  ];

  for (const msg of messages) {
    let type: ExtractedDate["type"] | null = null;
    let matchStr = "";
    
    const textLower = msg.text.toLowerCase();
    for (const [k, v] of Object.entries(keywords)) {
      if (v.some(word => textLower.includes(word))) {
        type = k as ExtractedDate["type"];
        break;
      }
    }

    let hasDatePattern = false;
    for (const pattern of datePatterns) {
      const match = msg.text.match(pattern);
      if (match) {
        hasDatePattern = true;
        matchStr = match[0];
        break;
      }
    }

    if (type || hasDatePattern) {
      if (!type) type = "other";
      const dateToUse = msg.ts ? new Date(msg.ts) : new Date(now);
      
      dates.push({
        messageId: msg.id,
        date: dateToUse,
        type,
        source: matchStr || type,
        overdue: dateToUse < now
      });
    }
  }

  return dates.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function scoreMessages(messages: Message[], names: string[], _now: Date): ScoredMessage[] {
  return messages.map(msg => {
    let score = 0;
    const reasons: FlagReason[] = [];
    
    if (names.some(name => msg.sender.toLowerCase() === name.toLowerCase())) {
      const p: Priority = "fyi";
      return { ...msg, score: 0, priority: p, reasons: [] };
    }

    const textLower = msg.text.toLowerCase();
    
    const mentions = findMentions([msg], names);
    if (mentions.length > 0) {
      score += 50;
      reasons.push("mention");
    }

    const dateKeywords = ["deadline", "due", "submit", "submission", "tomorrow", "today"];
    if (dateKeywords.some(kw => textLower.includes(kw)) || msg.text.match(/\d{1,2}\/\d{1,2}/)) {
      score += 40;
      reasons.push("date");
    }

    const taskKeywords = ["todo", "action item", "please do", "need to", "make sure", "don't forget", "remember to", "assign"];
    if (taskKeywords.some(kw => textLower.includes(kw))) {
      score += 35;
      reasons.push("task");
    }

    const decisionKeywords = ["decided", "agreed", "final", "confirmed", "approved", "let's go with"];
    if (decisionKeywords.some(kw => textLower.includes(kw))) {
      score += 30;
      reasons.push("decision");
    }

    if (msg.text.includes("?") && mentions.length > 0) {
      score += 25;
      reasons.push("question");
    }

    const meetingKeywords = ["meet", "meeting", "zoom", "call", "standup", "sync", "catch up"];
    if (meetingKeywords.some(kw => textLower.includes(kw))) {
      score += 20;
      reasons.push("meeting");
    }

    if (msg.text.length > 100) {
      score += 5;
    }

    if (msg.text.includes("!")) {
      score += 3;
    }

    let priority: Priority = "fyi";
    if (score >= 80) priority = "critical";
    else if (score >= 50) priority = "high";
    else if (score >= 25) priority = "medium";

    return { ...msg, score, priority, reasons };
  }).sort((a, b) => b.score - a.score);
}

export function findNextMeeting(dates: ExtractedDate[], now: Date): ExtractedDate | null {
  for (const date of dates) {
    if (date.type === "meeting" && date.date >= now) {
      return date;
    }
  }
  return null;
}

export function analyze(messages: Message[], names: string[], start: Date | null, end: Date | null, now: Date): AnalysisResult {
  const filtered = filterByDateRange(messages, start, end);
  const scored = scoreMessages(filtered, names, now);
  const mentionMessages = findMentions(filtered, names);
  const extractedDates = extractDates(filtered, now);
  const nextMeeting = findNextMeeting(extractedDates, now);

  const importantCount = scored.filter(s => s.priority !== "fyi").length;
  const actionItemCount = scored.filter(s => s.reasons.includes("task")).length;
  const upcomingDateCount = extractedDates.filter(d => !d.overdue).length;

  return {
    filtered,
    scored,
    mentionMessages,
    extractedDates,
    nextMeeting,
    stats: {
      totalInRange: filtered.length,
      mentionCount: mentionMessages.length,
      importantCount,
      upcomingDateCount,
      actionItemCount
    }
  };
}
