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
import { aboutOurQuestionsDocument } from "@/features/legal/documents/about-our-questions";
import { contentPolicyDocument } from "@/features/legal/documents/content-policy";
import { howScoringWorksDocument } from "@/features/legal/documents/how-scoring-works";
import { privacyDocument } from "@/features/legal/documents/privacy";
import {
  CHALLENGES,
  CROWD_NUMBERS,
  EVERYTHING_SHIPPED,
  GROUPS,
  REPORTS,
  SHIPPED_FEATURES,
  STREAKS,
  STREAK_FREEZES_AND_REPAIRS,
  type ShippedFeatures,
} from "@/features/legal/documents/shipped";
import { termsDocument } from "@/features/legal/documents/terms";

import {
  HOW_TO_PLAY,
  PRACTICE_DIFFERS,
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
    // D36 (R5-01): practice answers at once, the last clue only chooses.
    expect(keys).toBe(
      "Keys A to D work while focus is on one of the answers. In Practice a key answers at once. On the Daily's last clue a key only chooses: the Lock in button, or Enter on your chosen answer, locks it in.",
    );
    expect(lines.join(" ")).not.toMatch(/in a question/);
    expect(lines.join(" ")).not.toMatch(/Turn them off/);
  });
});

describe("the help pages promise only what exists (RITE round 3, R3-06)", () => {
  const scoring = (shipped?: Partial<ShippedFeatures>) =>
    textOf(howScoringWorksDocument(noFlags, shipped)).join("\n");
  const a11y = (shipped?: {
    settings: boolean;
    moreMenuReduceMotion: boolean;
  }) => textOf(accessibilityDocument(noFlags, shipped)).join("\n");
  const terms = (shipped?: Partial<ShippedFeatures>) =>
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
    expect(later).toContain("“So far today”\n");
    // With every feature built, nothing is marked.
    expect(scoring(EVERYTHING_SHIPPED)).not.toMatch(/coming later/);
  });

  it("R3-06 How scoring works describes streaks, freezes and repairs, Groups, challenges and the crowd's numbers only once each is built", () => {
    for (const unbuilt of [
      STREAKS,
      STREAK_FREEZES_AND_REPAIRS,
      GROUPS,
      CHALLENGES,
      CROWD_NUMBERS,
    ]) {
      expect(unbuilt).toBe(false);
    }
    const now = scoring();
    // Streaks: no rule reads as if a streak were on screen.
    expect(now).not.toMatch(/your streak/);
    expect(now).not.toMatch(/Streaks never change/);
    expect(now).not.toMatch(/freezes and repairs/);
    expect(now).toContain("Time zones\n");
    expect(now).toContain("Streaks are coming later");
    // Groups and challenges.
    expect(now).not.toMatch(/Groups? /);
    expect(now).not.toMatch(/challenges/);
    expect(now).toContain(
      "These runs still count everywhere else. Nothing on screen changes.",
    );
    // The crowd's numbers stay in the honest-play rules (AC-LGL-02), marked.
    expect(now).toContain(
      "The crowd's numbers are coming later: results don't show how everyone did yet.",
    );
    expect(now).toContain(
      "The chart of how everyone did, and the numbers under each round, are coming later.",
    );
    expect(now).not.toMatch(/Percentiles,|worked out again/);
    expect(now).toContain(
      "You'll see a one-time note. A corrected practice question arrives with the next update",
    );

    // Each ticket turns its own sentences on.
    const streaks = scoring({ streaks: true });
    expect(streaks).toContain("Time zones and your streak");
    expect(streaks).toContain(
      "so changing time zone can't fill in a day you missed. If your device's time zone changed",
    );
    expect(streaks).toContain("so your streak is safe");
    expect(streaks).toContain("Streaks never change because of a correction.");
    expect(streaks).toContain("everywhere else, streaks included.");
    expect(streaks).not.toMatch(/freezes and repairs|Groups/);
    expect(scoring({ streaks: true, freezesAndRepairs: true })).toContain(
      "can't fill in a day you missed: freezes and repairs are there for that.",
    );
    const groups = scoring({ groups: true });
    expect(groups).toContain("everywhere else, Groups included.");
    expect(groups).toContain("Group boards are worked out again");
    expect(scoring({ challenges: true })).toContain(
      "Challenges are worked out again, and you'll see a one-time note.",
    );
    const crowd = scoring({ crowdNumbers: true });
    expect(crowd).not.toMatch(/crowd's numbers are coming later/);
    expect(crowd).not.toMatch(/under each round, are coming later/);
    expect(crowd).toContain("The crowd's numbers are worked out again");

    const built = scoring(EVERYTHING_SHIPPED);
    expect(built).toContain(
      "These runs still count everywhere else, streaks and Groups included, and you still see your own percentile. Nothing on screen changes.",
    );
    expect(built).toContain(
      "Percentiles, the crowd's numbers, challenges and Group boards are worked out again, and you'll see a one-time note. Streaks never change because of a correction.",
    );
  });

  it("R3-06 the Terms speak of streaks, challenge links and the crowd's numbers only once each is built", () => {
    const now = terms();
    expect(now).not.toMatch(/streak/i);
    expect(now).not.toMatch(/challenge/i);
    expect(now).toContain("Share your results anywhere you like.");
    expect(now).toContain("or for lost progress.");
    expect(now).toContain(
      "Some runs will stay out of the crowd's numbers, which are coming later, as",
    );
    expect(terms({ streaks: true })).toContain(
      "that day is covered for everyone, so your streak is safe.",
    );
    expect(terms({ streaks: true })).toContain("lost streaks or progress");
    expect(terms({ challenges: true })).toContain(
      "Share your results and challenge links anywhere you like.",
    );
    expect(terms({ crowdNumbers: true })).toContain(
      "Some runs stay out of the crowd's numbers, as",
    );
  });

  it("R3-06 the privacy page says Delete my data will remove the cookie, coming later, until Settings has the button", () => {
    const cookie = (shipped?: { settings: boolean }) =>
      textOf(privacyDocument(noFlags, shipped)).find((line) =>
        line.startsWith("There is one cookie, `"),
      );
    expect(cookie()).not.toMatch(/Delete my data removes it\./);
    expect(cookie()).toMatch(
      /Delete my data, which is coming later, will remove it\.$/,
    );
    expect(cookie({ settings: true })).toMatch(/Delete my data removes it\.$/);
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
      termsDocument(
        (flag) => flag === "editor" || flag === "rooms",
        EVERYTHING_SHIPPED,
      ),
    ).join("\n");
    expect(built).not.toMatch(/coming later/);
    expect(built).toContain("delete your data in Settings");
  });

  it("R3-06 the privacy page marks Download my data and Delete my data as coming later until Settings is built, and says who to email meanwhile", () => {
    const privacy = (shipped?: { settings: boolean }) =>
      textOf(privacyDocument(noFlags, shipped)).join("\n");
    const now = privacy();
    expect(now).not.toMatch(/at any time in Settings/);
    expect(now).not.toMatch(/Settings has two buttons/);
    expect(now).toContain(
      "Downloading and deleting your data from Settings is coming later. Until then, email",
    );
    expect(now).toContain("Taking or deleting your data (coming later)");
    expect(now).toContain("Settings will have two buttons for this.");
    // The retention list names no button nobody can press.
    expect(now).not.toMatch(/Delete my data clears this device/);
    // What the buttons will do stays written out.
    expect(now).toContain("**Download my data**");
    expect(now).toContain("**Delete my data**");
    // SET-1 builds Settings, and nothing is marked.
    const built = privacy({ settings: true });
    expect(built).not.toMatch(/coming later/);
    expect(built).toContain(
      "You can download or delete your data at any time in Settings.",
    );
    expect(built).toContain("Settings has two buttons for this:");
    expect(built).toContain("Delete my data clears this device");
  });
});

describe("How scoring works says each thing once (RITE round 4, R4-20)", () => {
  /** The page's text: the document's own, and How to play's in its slot. */
  const pageText = (built: Partial<ShippedFeatures>) => [
    ...textOf(howScoringWorksDocument(noFlags, built)),
    ...HOW_TO_PLAY.parts.flatMap((part) => [part.heading, ...part.body]),
  ];
  const sentences = (texts: readonly string[]) =>
    texts.flatMap((text) =>
      String(text)
        .split(/(?<=[.!?”])\s+(?=[A-Z“])/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.split(/\s+/).length >= 4),
    );
  const twice = (values: readonly string[]) =>
    values.filter((value, index) => values.indexOf(value) !== index);

  for (const [name, built] of [
    ["as it ships today", {}],
    ["with everything built", EVERYTHING_SHIPPED],
  ] as const) {
    it(`R4-20 no paragraph and no sentence appears twice on How scoring works, ${name}`, () => {
      // Headings aside: How to play's "The ranking" and the page's own
      // section of that name are two headings, not a repeated paragraph.
      const texts = pageText(built)
        .map(String)
        .filter((text) => text.split(/\s+/).length >= 4);
      expect(twice(texts)).toEqual([]);
      expect(twice(sentences(texts))).toEqual([]);
    });

    it(`R4-20 the chart of how everyone did is named once, ${name}`, () => {
      const all = pageText(built).map(String).join(" ");
      expect(all.match(/The chart of how everyone did/g)).toHaveLength(1);
    });
  }

  it("R4-20 while the crowd's numbers are still to come, one sentence says so and the next gives the threshold", () => {
    const soFar = howScoringWorksDocument(noFlags, {
      crowdNumbers: false,
    }).sections.find((section) => section.id === "so-far-today");
    const last = soFar?.blocks.at(-1);
    expect(last?.kind === "p" && String(last.text)).toMatch(
      /^The chart of how everyone did, and the numbers under each round, are coming later\. (They will wait for \d+ players too\.|The chart will wait for \d+ players too, and the numbers for \d+\.)$/,
    );
  });
});

describe("the help pages after RITE round 5 (decisions memo §28)", () => {
  const questions = (shipped?: Partial<ShippedFeatures>) =>
    textOf(aboutOurQuestionsDocument(noFlags, shipped)).join("\n");
  const policy = (
    flags: (flag: string) => boolean = noFlags,
    shipped?: Partial<ShippedFeatures>,
  ) => textOf(contentPolicyDocument(flags, shipped)).join("\n");

  it("R5-06 with the reports switch off, neither About our questions nor the content policy names Report a problem", () => {
    // RPT-1 builds the control and turns this on.
    expect(REPORTS).toBe(false);
    expect(SHIPPED_FEATURES.reports).toBe(false);
    expect(questions()).not.toContain("Report a problem");
    expect(policy()).not.toContain("Report a problem");
    // Nor with every flag on: a shared quiz has its own Report (EDT-3).
    expect(policy(() => true)).not.toContain("Report a problem");
    // No reveal or explanation is promised a control it doesn't have.
    expect(questions()).not.toMatch(/Every reveal and explanation has/);
    expect(policy()).not.toMatch(/on its reveal or explanation/);
  });

  it("R5-06 until then both pages say how to tell us: by email, with which question and what's wrong", () => {
    for (const page of [questions(), policy()]) {
      expect(page).toContain(
        "Email [hello@knewt.app](mailto:hello@knewt.app) and tell us which question it was and what's wrong",
      );
      // A Mystery guess can still be contested.
      expect(page).toMatch(/your guess should have counted/);
    }
    // The rest of both sections stands: what a report leads to, and when.
    expect(questions()).toContain("We read every report");
    expect(questions()).toContain("When you spot a mistake");
    expect(policy()).toContain("How to report");
    expect(policy()).toContain("We read every report.");
  });

  it("R5-06 RPT-1's switch brings the sentences back, word for word", () => {
    expect(questions({ reports: true })).toContain(
      "Every reveal and explanation has **Report a problem**. Tell us what's wrong; on a Mystery you can also say your guess should have counted. We read every report, and the [content policy](/content-policy) says how quickly.",
    );
    expect(policy(noFlags, { reports: true })).toContain(
      "Use **Report a problem** on its reveal or explanation. Pick what's wrong (wrong answer, ambiguous, out of date, offensive, or a typo) and add a note if you like. On a Mystery you can also tell us your guess should have counted.",
    );
    expect(EVERYTHING_SHIPPED.reports).toBe(true);
    expect(questions(EVERYTHING_SHIPPED)).toContain("Report a problem");
    expect(policy(noFlags, EVERYTHING_SHIPPED)).toContain("Report a problem");
  });

  it("R5-01 How to play's Clue 4 part says practice differs: there the first choice counts", () => {
    const clue4 = HOW_TO_PLAY.parts.find((part) => part.id === "clue4");
    expect(clue4?.body).toEqual([
      "The last clue comes with four options. Choose one, then Lock in. You get one pick, and a wrong pick scores 0.",
      PRACTICE_DIFFERS,
    ]);
    expect(PRACTICE_DIFFERS).toBe(
      "Practice is quicker: there, your first choice counts straight away.",
    );
  });

  it("R5-01 the accessibility statement tells practice from the Daily's last clue: a key answers at once there, and only chooses here", () => {
    const text = textOf(accessibilityDocument(noFlags)).join("\n");
    expect(text).toContain("In Practice a key answers at once.");
    expect(text).toContain(
      "On the Daily's last clue a key only chooses: the Lock in button, or Enter on your chosen answer, locks it in.",
    );
  });
});
