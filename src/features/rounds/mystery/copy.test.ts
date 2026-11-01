import { describe, expect, it } from "vitest";

import { ANSWER_TYPES } from "@/engine/types";

import {
  ANSWER_TYPE_WORDS,
  MYSTERY_COPY,
  mysteryAnnouncementText,
} from "./copy";
import { nextClueLabel } from "./next-clue";
import { splitDisplay } from "./combobox";

const four = { optionsFromClue: 4 } as const;
const three = { optionsFromClue: 3 } as const;

describe("the Mystery's announcement copy", () => {
  it("names the new worth after a wrong guess and reads the new clue (PRD §3.1.4)", () => {
    expect(
      mysteryAnnouncementText(
        {
          kind: "wrong_guess",
          guess: "Heat",
          clue: 3,
          clueText: "A bank job goes wrong.",
        },
        four,
      ),
    ).toBe("Not Heat. Clue 3 is in. Now worth 2. A bank job goes wrong.");
    expect(
      mysteryAnnouncementText(
        {
          kind: "wrong_guess",
          guess: "Heat",
          clue: 4,
          clueText: "Pacino and De Niro.",
        },
        four,
      ),
    ).toBe(
      "Not Heat. Last clue, now worth 1 point. Pacino and De Niro. Pick one of four.",
    );
  });

  it("names the new worth after Next clue, and the options when they arrive", () => {
    expect(
      mysteryAnnouncementText(
        { kind: "next_clue", clue: 2, clueText: "x" },
        four,
      ),
    ).toBe("Clue 2 is in. Now worth 3.");
    expect(
      mysteryAnnouncementText(
        { kind: "next_clue", clue: 3, clueText: "x" },
        three,
      ),
    ).toBe("Clue 3 is in. Now worth 2. Pick one of four.");
    expect(
      mysteryAnnouncementText(
        { kind: "next_clue", clue: 4, clueText: "x" },
        four,
      ),
    ).toBe("Last clue, now worth 1 point. Pick one of four.");
  });

  it("stamps a solve, picks with Got it., and words a miss and a withdrawal", () => {
    expect(
      mysteryAnnouncementText(
        { kind: "mystery_solved", answer: "Ada Lovelace", clue: 2, points: 3 },
        four,
      ),
    ).toBe("Knew it. Ada Lovelace. Solved on clue 2, 3 points.");
    expect(
      mysteryAnnouncementText(
        {
          kind: "mystery_solved",
          answer: "Spirited Away (2001)",
          clue: 4,
          points: 1,
        },
        four,
      ),
    ).toBe("Got it. Spirited Away (2001). Solved on clue 4, 1 point.");
    expect(
      mysteryAnnouncementText(
        { kind: "mystery_missed", answer: "Heat (1995)" },
        four,
      ),
    ).toBe("This one got away. The answer was Heat (1995). 0 points.");
    expect(
      mysteryAnnouncementText({ kind: "mystery_missed", answer: "" }, four),
    ).toBe(
      "This Mystery was withdrawn because we got it wrong. Everyone gets 4 points.",
    );
    expect(
      mysteryAnnouncementText({ kind: "correct", answer: "x" }, four),
    ).toBeNull();
  });
});

describe("the Next clue label (PRD §3.1.4)", () => {
  it.each([
    [1, 4, false, "Next clue", 3],
    [2, 4, false, "Next clue", 2],
    [3, 4, false, "Last clue and options", 1],
    [1, 3, false, "Next clue", 3],
    [2, 3, false, "Next clue and options", 2],
    [3, 3, true, "Last clue", 1],
  ] as const)(
    "clue %i with options from clue %i reads %s · then worth %i",
    (clue, from, showing, action, worth) => {
      expect(nextClueLabel(clue, from, showing === true)).toEqual({
        action,
        worth,
      });
    },
  );

  it("doesn't exist on clue 4", () => {
    expect(nextClueLabel(4, 4, true)).toBeNull();
  });
});

describe("answer-type words", () => {
  it("names every answer type", () => {
    for (const type of ANSWER_TYPES) {
      const words = ANSWER_TYPE_WORDS[type];
      expect(words.line).toMatch(/^an? /);
      expect(MYSTERY_COPY.title(type)).toMatch(/^An? /);
    }
    expect(MYSTERY_COPY.title("element")).toBe("A chemical element");
    expect(MYSTERY_COPY.guess.placeholder("animal")).toBe(
      "Start typing an animal",
    );
    expect(MYSTERY_COPY.guess.count("person", 4)).toBe("4 people match");
    expect(MYSTERY_COPY.guess.count("film", 1)).toBe("1 film matches");
    expect(MYSTERY_COPY.title(null)).toBe("An answer");
  });

  it("never uses an em dash or three dots", () => {
    const text = JSON.stringify(MYSTERY_COPY);
    expect(text).not.toMatch(/—|\.\.\./);
  });
});

describe("splitting a row's display", () => {
  it.each([
    ["Ada Morrow (cartographer)", "person", "Ada Morrow", "cartographer"],
    ["Heat (1995)", "film", "Heat", "1995"],
    ["Paris, France", "city", "Paris", "France"],
    ["Machu Picchu, Peru", "landmark", "Machu Picchu", "Peru"],
    ["Earth, Wind & Fire", "music_artist", "Earth, Wind & Fire", null],
    ["Odile Marsh", "person", "Odile Marsh", null],
  ] as const)("%s (%s)", (display, type, name, aside) => {
    expect(splitDisplay(display, type)).toEqual({ name, aside });
  });
});
