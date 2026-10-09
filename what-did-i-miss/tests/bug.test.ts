import { expect, test } from "vitest";
import { findMentions } from "../src/lib/engine";
import type { Message } from "../src/types";

test("Mentions are whole-word only, Divya does not match Divyansh Singh", () => {
  const msg: Message = {
    id: "1",
    ts: new Date(),
    sender: "Someone",
    text: "Here is Divya"
  };

  // User's name is Divyansh Singh
  const mentions = findMentions([msg], ["Divyansh Singh"]);
  expect(mentions.length).toBe(0); // Should not match
});

