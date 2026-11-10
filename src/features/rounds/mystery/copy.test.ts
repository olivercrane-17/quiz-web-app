import { describe, expect, it } from "vitest";

import { ANSWER_TYPES } from "@/engine/types";

import {
  ANSWER_TYPE_WORDS,
  MYSTERY_COPY,
  mysteryAnnouncementText,
  mysteryMissed,
  solvedStamp,
} from "./copy";
import { nextClueLabel } from "./next-clue";
import { loneSelectableRow, splitDisplay } from "./combobox";
import { digitsPick, optionForKey } from "./options";

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
    ).toBe("Not Heat. Last clue, now worth 1 point. Pacino and De Niro.");
  });

  it("names the new worth after Next clue, and leaves the options' line to their focused group (D28, R3-05 after review)", () => {
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
    ).toBe("Clue 3 is in. Now worth 2.");
    expect(
      mysteryAnnouncementText(
        { kind: "next_clue", clue: 4, clueText: "x" },
        four,
      ),
    ).toBe("Last clue, now worth 1 point.");
  });

  it("R2-16 D24 says on clue 4 that there is one pick and a wrong one scores 0, and on clue 3 only that there are four", () => {
    // Lena and Marcus had to assume it: "Pick one of four" said nothing more.
    expect(MYSTERY_COPY.options.lastLead).toBe(
      "Last clue. Pick one of four. One pick: a wrong one scores 0.",
    );
    // Options from clue 3: a wrong pick there opens clue 4, so no rule yet.
    expect(
      mysteryAnnouncementText(
        { kind: "next_clue", clue: 3, clueText: "x" },
        three,
      ),
    ).not.toMatch(/One pick/);
    expect(
      mysteryAnnouncementText(
        { kind: "next_clue", clue: 4, clueText: "x" },
        three,
      ),
    ).toBe("Last clue, now worth 1 point.");
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

  it("R1-22 stamps Knew it. only for a typed solve on clue 1 or 2 with no miss, Got there. for the rest, Got it. for a clue-4 pick", () => {
    expect(solvedStamp({ clue: 1, picked: false, missed: false })).toBe(
      "Knew it.",
    );
    expect(solvedStamp({ clue: 2, picked: false, missed: false })).toBe(
      "Knew it.",
    );
    expect(solvedStamp({ clue: 2, picked: false, missed: true })).toBe(
      "Got there.",
    );
    expect(solvedStamp({ clue: 3, picked: false, missed: false })).toBe(
      "Got there.",
    );
    // D10 gives clue 3 "Got there.", a pick there too (options from clue 3).
    expect(solvedStamp({ clue: 3, picked: true, missed: false })).toBe(
      "Got there.",
    );
    expect(solvedStamp({ clue: 3, picked: true, missed: true })).toBe(
      "Got there.",
    );
    expect(solvedStamp({ clue: 4, picked: true, missed: false })).toBe(
      "Got it.",
    );
    expect(solvedStamp({ clue: 4, picked: true, missed: true })).toBe(
      "Got it.",
    );
    const solved = {
      kind: "mystery_solved",
      answer: "Ada Lovelace",
      clue: 2,
      points: 3,
    } as const;
    // A controller that knows of a miss says so; one that doesn't says Knew it.
    expect(mysteryAnnouncementText(solved, four, { missed: true })).toBe(
      "Got there. Ada Lovelace. Solved on clue 2, 3 points.",
    );
    expect(mysteryAnnouncementText(solved, four, { missed: false })).toBe(
      "Knew it. Ada Lovelace. Solved on clue 2, 3 points.",
    );
    expect(
      mysteryAnnouncementText({ ...solved, clue: 3, points: 2 }, four),
    ).toBe("Got there. Ada Lovelace. Solved on clue 3, 2 points.");
    // With options from clue 3, a clue-3 solve is a pick, stamped as clue 3.
    expect(
      mysteryAnnouncementText({ ...solved, clue: 3, points: 2 }, three),
    ).toBe("Got there. Ada Lovelace. Solved on clue 3, 2 points.");
    expect(
      mysteryAnnouncementText({ ...solved, clue: 4, points: 1 }, three),
    ).toBe("Got it. Ada Lovelace. Solved on clue 4, 1 point.");
  });

  it("finds a miss in a wrong guess or in an option a wrong pick disabled", () => {
    expect(mysteryMissed(null)).toBe(false);
    expect(mysteryMissed({ wrongGuesses: [], options: null })).toBe(false);
    expect(mysteryMissed({ wrongGuesses: [{}], options: null })).toBe(true);
    expect(
      mysteryMissed({
        wrongGuesses: [],
        options: [{ alreadyGuessed: false }, { alreadyGuessed: true }],
      }),
    ).toBe(true);
  });
});

describe("D5 and D6: what picks without a pointer", () => {
  const row = (alreadyGuessed: boolean) => ({
    entityId: "fx.x.person.x" as never,
    display: "X",
    alreadyGuessed,
    match: null,
  });

  it("R1-29 highlights the one selectable row, and nothing for two or for a longer list", () => {
    expect(loneSelectableRow([row(false)], 1)).toBe(0);
    expect(loneSelectableRow([row(true), row(false)], 2)).toBe(1);
    expect(loneSelectableRow([row(false), row(false)], 2)).toBe(-1);
    expect(loneSelectableRow([row(true)], 1)).toBe(-1);
    // Six shown of seven: the hidden one can be picked too.
    expect(
      loneSelectableRow([row(false), ...Array(5).fill(row(true))], 7),
    ).toBe(-1);
  });

  it("R1-13 picks by letter, and by digit only when no option reads as a number", () => {
    const options = (labels: string[]) =>
      labels.map((label, index) => ({ index, label, alreadyGuessed: false }));
    const words = options(["Iron", "Cobalt", "Nickel", "Copper"]);
    expect(optionForKey("c", words)?.index).toBe(2);
    expect(optionForKey("C", words)?.index).toBe(2);
    expect(optionForKey("3", words)?.index).toBe(2);
    expect(optionForKey("e", words)).toBeNull();
    expect(optionForKey("5", words)).toBeNull();
    expect(digitsPick(words)).toBe(true);
    for (const labels of [
      ["2", "4", "9", "15"],
      ["1917", "Heat", "Up", "Jaws"],
      ["1,250 km", "300 km", "2,400 km", "80 km"],
    ]) {
      const numeric = options(labels);
      expect(digitsPick(numeric)).toBe(false);
      expect(optionForKey("4", numeric)).toBeNull();
      expect(optionForKey("d", numeric)?.index).toBe(3);
    }
    const guessed = options(["Iron", "Cobalt", "Nickel", "Copper"]).map(
      (option) => ({ ...option, alreadyGuessed: option.index === 1 }),
    );
    expect(optionForKey("b", guessed)).toBeNull();
    expect(optionForKey("2", guessed)).toBeNull();
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
    // D26: more match than show.
    expect(MYSTERY_COPY.guess.countMore("country", 7, 6)).toBe(
      "7 countries match. Showing 6, so keep typing.",
    );
    expect(MYSTERY_COPY.guess.showing(6)).toBe("Showing 6, so keep typing.");
    expect(MYSTERY_COPY.title(null)).toBe("An answer");
  });

  it("never uses an em dash or three dots", () => {
    const text = JSON.stringify(MYSTERY_COPY);
    expect(text).not.toMatch(/—|\.\.\./);
  });

  it("R1-24 gives every type a placeholder with a short noun, short enough to sit beside Guess at 360 px", () => {
    // "Start typing a chemic…": the full line didn't fit.
    expect(MYSTERY_COPY.guess.placeholder("element")).toBe(
      "Start typing an element",
    );
    for (const type of ANSWER_TYPES) {
      const placeholder = MYSTERY_COPY.guess.placeholder(type);
      expect(placeholder).toBe(`Start typing ${ANSWER_TYPE_WORDS[type].short}`);
      // D14's example, "Start typing an element", is the longest that fits.
      expect(placeholder.length).toBeLessThanOrEqual(23);
    }
    expect(MYSTERY_COPY.guess.placeholder(null)).toBe("Start typing an answer");
  });

  it("D17 says use Next clue, not tap it, when nothing matches", () => {
    expect(MYSTERY_COPY.guess.noMatches).toBe(
      "No matches. Try another spelling, or use Next clue.",
    );
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
    const split = splitDisplay(display, type);
    expect(split).toMatchObject({ name, aside });
    // Where the aside starts, so a highlight running into it lands right.
    expect(
      display.slice(split.asideStart, split.asideStart + (aside?.length ?? 0)),
    ).toBe(aside ?? "");
  });
});
