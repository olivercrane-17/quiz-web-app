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
  MORE_MENU_REDUCE_MOTION,
  SETTINGS_CONTROLS,
  accessibilityDocument,
} from "@/features/legal/documents/accessibility";
import { howScoringWorksDocument } from "@/features/legal/documents/how-scoring-works";
import { termsDocument } from "@/features/legal/documents/terms";

import {
  HOW_TO_PLAY,
  STOP_SCREEN_PERCENTILE,
  STOP_SCREEN_PLAYER_COUNT,
  STOPWATCH_RULE,
} from "./how-to-play";

const noFlags = () => false;

/** Every heading, paragraph and list item of a document, as plain strings. */
function textOf(document: ReturnType<typeof accessibilityDocument>): string[] {
  return document.sections.flatMap((section) => [
    section.heading,
    ...section.blocks.flatMap((block) => {
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
  ]);
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

describe("the help pages promise only what exists (RITE round 3, R3-06)", () => {
  const scoring = (shipped?: { percentile: boolean; playerCount: boolean }) =>
    textOf(howScoringWorksDocument(noFlags, shipped)).join("\n");
  const a11y = (shipped?: {
    settings: boolean;
    moreMenuReduceMotion: boolean;
  }) => textOf(accessibilityDocument(noFlags, shipped)).join("\n");
  const terms = (shipped?: { settings: boolean }) =>
    textOf(termsDocument(noFlags, shipped)).join("\n");

  it("R3-06 How scoring works says nothing of a player count, or of seeing your percentile, until the stop screen shows them", () => {
    expect(STOP_SCREEN_PERCENTILE).toBe(false);
    expect(STOP_SCREEN_PLAYER_COUNT).toBe(false);
    const now = scoring();
    expect(now).not.toMatch(/how many have played/);
    expect(now).not.toMatch(/you still see your own percentile/);
    expect(now).not.toMatch(/When you finish, you see how you compare/);
    expect(now).toContain("“So far today” (coming later)");
    // The rules themselves stay: the threshold and the regions.
    expect(now).toContain("once 50 have finished there");
    // DLY-3 turns the switches on, and the sentences come back.
    const later = scoring({ percentile: true, playerCount: true });
    expect(later).toContain(
      "Until 50 players have finished in all, you see how many have played instead of a percentage.",
    );
    expect(later).toContain("you still see your own percentile");
    expect(later).not.toMatch(/coming later/);
  });

  it("R3-06 the accessibility statement lists only the choices that exist, and no Reduce motion in the More menu", () => {
    expect(SETTINGS_CONTROLS).toBe(false);
    expect(MORE_MENU_REDUCE_MOTION).toBe(false);
    const now = a11y();
    expect(now).not.toMatch(/In Settings/);
    expect(now).not.toMatch(/Settings that help/);
    expect(now).not.toMatch(/More menu during a game/);
    for (const unbuilt of ["Sound effects", "Auto-advance", "Theme\n"]) {
      expect(now).not.toContain(unbuilt);
    }
    expect(now).toContain("Choices you can make");
    expect(now).toContain("Hide stopwatch in the More menu");
    // SET-1's Settings bring the list back; the More-menu line waits for
    // Reduce motion to be there.
    const settings = a11y({ settings: true, moreMenuReduceMotion: false });
    expect(settings).toContain("Settings that help");
    expect(settings).toContain("Sound effects");
    expect(settings).not.toMatch(/More menu during a game/);
    expect(a11y({ settings: true, moreMenuReduceMotion: true })).toContain(
      "Reduce motion is also in the More menu during a game",
    );
  });

  it("R3-06 the Terms mark quiz-making, rooms and deleting from Settings as coming later, and keep the 13+ and 18+ rules", () => {
    const now = terms();
    expect(now).toContain("You must be 13 or older to play Knewt.");
    expect(now).toContain(
      "Sharing a quiz you made, or hosting one in a room, needs you to be 18 or older.",
    );
    expect(now).toContain("Both are coming later.");
    expect(now).toContain("Quizzes you make (coming later)");
    expect(now).not.toMatch(/delete your data in Settings/);
    expect(now).toContain("Deleting your data from Settings is coming later.");
    // With the editor and rooms built, and Settings, nothing is marked.
    const built = textOf(
      termsDocument((flag) => flag === "editor" || flag === "rooms", {
        settings: true,
      }),
    ).join("\n");
    expect(built).not.toMatch(/coming later/);
    expect(built).toContain("delete your data in Settings");
  });
});
