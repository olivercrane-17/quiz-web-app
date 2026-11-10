/**
 * The two lines RITE round 2 asked of LGL-1's trust pages, which FIX2-DLY
 * wrote (decisions memo §22): How scoring works says, where it explains
 * total time, that the stopwatch keeps running while you're away (D19,
 * R2-01), in How to play's own words; and the accessibility statement only
 * says "Turn them off" of the answer keys once Settings has the switch
 * (D20, R2-02), which SET-1 builds.
 */
import { describe, expect, it } from "vitest";

import {
  KEYBOARD_SHORTCUTS_SWITCH,
  accessibilityDocument,
} from "@/features/legal/documents/accessibility";
import { howScoringWorksDocument } from "@/features/legal/documents/how-scoring-works";

import { HOW_TO_PLAY, STOPWATCH_RULE } from "./how-to-play";

const noFlags = () => false;

/** Every paragraph and list item of a document, as plain strings. */
function textOf(document: ReturnType<typeof accessibilityDocument>): string[] {
  return document.sections.flatMap((section) =>
    section.blocks.flatMap((block) => {
      switch (block.kind) {
        case "p":
          return [block.text];
        case "list":
          return [...block.items];
        case "terms":
          return block.items.flatMap((item) => [item.term, ...item.details]);
        default:
          return [];
      }
    }),
  );
}

describe("the trust pages' round 2 lines", () => {
  it("R2-01 D19 How scoring works says the stopwatch runs while a clue is open, even while you're away, once, through How to play's own text", () => {
    // The page's how-to-play slot renders HOW_TO_PLAY, whose ranking part
    // carries the sentence; its Total time paragraph doesn't repeat it.
    expect(HOW_TO_PLAY.parts.at(-1)?.body).toContain(
      "The stopwatch runs while a clue is open, even while you're away or reading this, and stops on every reveal.",
    );
    const ranking = howScoringWorksDocument(noFlags).sections.find(
      (section) => section.id === "ranking",
    );
    const total = ranking?.blocks.find(
      (block) => block.kind === "p" && block.text.startsWith("Total time"),
    );
    expect(total?.kind === "p" && total.text).not.toContain(STOPWATCH_RULE);
    expect(textOf(howScoringWorksDocument(noFlags)).join(" ")).not.toContain(
      STOPWATCH_RULE,
    );
  });

  it("R2-02 D20 the accessibility statement leaves out 'Turn them off' until Settings has the switch", () => {
    // SET-1 builds the switch and turns this on.
    expect(KEYBOARD_SHORTCUTS_SWITCH).toBe(false);
    const lines = textOf(accessibilityDocument(noFlags));
    const keys = lines.find((line) => line.startsWith("Keys A to D"));
    // D20: keys act only while focus is on an answer, never on a heading.
    expect(keys).toBe(
      "Keys A to D choose an answer while focus is on one of the answers. On the Daily's last clue, Enter or the same key again locks your choice in.",
    );
    expect(lines.join(" ")).not.toMatch(/in a question/);
    expect(lines.join(" ")).not.toMatch(/Turn them off/);
  });
});
