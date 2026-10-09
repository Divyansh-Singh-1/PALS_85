/** A single parsed chat message. */
export type Message = {
  /** Sequential id, starts at 0. */
  id: number;
  /** Parsed timestamp, or null if the timestamp could not be parsed. */
  ts: Date | null;
  /** Display name of the sender. */
  sender: string;
  /** Message body text. May contain \n for multiline messages. */
  text: string;
};

/** Whether dates in the export use day/month/year or month/day/year order. */
export type DateOrder = "DMY" | "MDY";

/** Result returned by a chat parser. */
export type ParseResult = {
  /** Parsed messages in order of appearance. */
  messages: Message[];
  /** True if at least one message has a non-null timestamp. */
  hasTimestamps: boolean;
  /** Detected date field order across all headers. */
  dateOrder: DateOrder;
  /** Count of system / media / deleted lines that were skipped. */
  skippedLines: number;
};
