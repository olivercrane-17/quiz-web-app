/**
 * The Mystery round's words (PRD §3.1.4, §4.1.3; DESIGN §1.4, §6.3, §6.4,
 * §12.2). DESIGN's polished strings win where it has one; PRD wording fills
 * the rest, and the decisions after RITE rounds 1 and 2
 * (02-PRODUCT-DECISIONS §19, §22) override both: D10's three stamps, D14's
 * short placeholder nouns and D17's "No matches" line; D20's key legend,
 * D24's clue-4 line and D26's match count. One ellipsis character, never
 * three dots.
 *
 * `mysteryAnnouncementText` turns the plugin's announcement data into the
 * status message ("Not Heat. Clue 3 is in. Now worth 2. ..."), so every
 * controller that runs Mysteries (the Daily, the archive, challenges,
 * packs) speaks with the same words (ARCHITECTURE §4.4).
 */
import type { Announcement } from "@/engine/rounds";
import { worthOnClue } from "@/engine/scoring/mystery";
import type { AnswerType, DifficultyBand } from "@/engine/types";

/**
 * How each answer type is named (CONTENT_GUIDE §2.10, "Player line").
 * `short` is the placeholder's noun (D14): short enough that "Start typing
 * an element" fits beside Guess at 360 px, while the title keeps the full
 * line ("A chemical element").
 */
export const ANSWER_TYPE_WORDS: Readonly<
  Record<AnswerType, { line: string; one: string; many: string; short: string }>
> = {
  country: {
    line: "a country",
    one: "country",
    many: "countries",
    short: "a country",
  },
  city: { line: "a city", one: "city", many: "cities", short: "a city" },
  person: {
    line: "a person",
    one: "person",
    many: "people",
    short: "a person",
  },
  film: { line: "a film", one: "film", many: "films", short: "a film" },
  tv_series: {
    line: "a TV series",
    one: "TV series",
    many: "TV series",
    short: "a series",
  },
  book: { line: "a book", one: "book", many: "books", short: "a book" },
  animal: {
    line: "an animal",
    one: "animal",
    many: "animals",
    short: "an animal",
  },
  element: {
    line: "a chemical element",
    one: "chemical element",
    many: "chemical elements",
    short: "an element",
  },
  landmark: {
    line: "a landmark",
    one: "landmark",
    many: "landmarks",
    short: "a landmark",
  },
  music_artist: {
    line: "a musician or band",
    one: "musician or band",
    many: "musicians or bands",
    short: "an artist",
  },
  dish: {
    line: "a dish or drink",
    one: "dish or drink",
    many: "dishes or drinks",
    short: "a dish",
  },
  sport: {
    line: "a sport or game",
    one: "sport or game",
    many: "sports or games",
    short: "a sport",
  },
};

/** When a round names no answer type (it always should): neutral words. */
const ANY_ANSWER = {
  line: "an answer",
  one: "answer",
  many: "answers",
  short: "an answer",
} as const;

/** The words for a type, or the neutral ones. */
export function answerWords(type: AnswerType | null) {
  return type === null ? ANY_ANSWER : ANSWER_TYPE_WORDS[type];
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const points = (n: number) => `${String(n)} ${n === 1 ? "point" : "points"}`;

function matchCount(type: AnswerType | null, n: number): string {
  return n === 1
    ? `1 ${answerWords(type).one} matches`
    : `${String(n)} ${answerWords(type).many} match`;
}

function showingCount(shown: number): string {
  return `Showing ${String(shown)}, so keep typing.`;
}

/** Clue 4's rule, after "Pick one of four" (D24). */
const ONE_PICK = "One pick: a wrong one scores 0.";

export const MYSTERY_COPY = {
  roundLabel: (ordinal: number, ofType: number) =>
    `Mystery ${String(ordinal)} of ${String(ofType)}`,
  kicker: { single: "Mystery" },
  difficulty: {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  } satisfies Record<DifficultyBand, string>,
  /** The title is the answer type: "A person" (DESIGN §11, one h1 per route). */
  title: (type: AnswerType | null) => capitalize(answerWords(type).line),
  /** Read before the title, so the heading says "The answer is a person". */
  titlePrefix: "The answer is",
  /** A verdict past 1.5 s (PRD §3.0.2); one ellipsis character. */
  checking: "Checking…",

  stake: {
    /** AC-DLY-29: the indicator's accessible name. */
    name: (worth: number) => `Worth ${points(worth)} now`,
    description: "Each clue costs a point: 4, 3, 2, 1.",
    label: "points now",
  },

  ladder: {
    label: "Clues",
    clue: (n: number) => `Clue ${String(n)}`,
    newTag: "New",
    lastTag: "Last clue",
    /** The stamp on a clue a wrong guess was made on: "Not Mary Shelley", never struck through. */
    stamp: (name: string) => `Not ${name}`,
    stampPrefix: "You guessed ",
    /**
     * Under Mystery 1's clue 1 in the player's first Daily (PRD §3.1.4,
     * R1-04): what a wrong guess costs, before the first one.
     */
    firstDailyHint:
      "Get it from this clue for 4 points. A wrong guess costs the same as Next clue, so have a go.",
  },

  nextClue: {
    next: "Next clue",
    nextAndOptions: "Next clue and options",
    last: "Last clue",
    lastAndOptions: "Last clue and options",
    thenWorth: (worth: number) => `then worth ${String(worth)}`,
  },

  guess: {
    label: "Your guess",
    /** D14: a short noun, so the placeholder fits beside Guess at 360 px. */
    placeholder: (type: AnswerType | null) =>
      `Start typing ${answerWords(type).short}`,
    button: "Guess",
    clear: "Clear your guess",
    /** The field's description, and shown when Guess or Enter finds no pick (D5, R1-29). */
    hint: "Pick a name from the list, then Guess.",
    /** Under the field once a row is chosen, so the whole name shows (R1-28). */
    pickLead: "Your pick:",
    /** A row that only a typo matched (R1-37). */
    typo: "Similar spelling",
    listLabel: (type: AnswerType | null, query: string) =>
      `${capitalize(answerWords(type).many)} matching ${query}`,
    /** The count announced on each change: "4 people match", "1 film matches". */
    count: matchCount,
    /**
     * D26: under the list when more match than it shows (PRD §4.1.3 caps
     * it), so nobody goes looking for the seventh.
     */
    showing: showingCount,
    /** D26, spoken: "7 countries match. Showing 6, so keep typing." */
    countMore: (type: AnswerType | null, total: number, shown: number) =>
      `${matchCount(type, total)}. ${showingCount(shown)}`,
    /** Spoken when a row is chosen, since the field's new value is not. */
    selected: (name: string) => `${name} selected.`,
    /** D17: "use", not "tap", since a keyboard may be what the player has. */
    noMatches: "No matches. Try another spelling, or use Next clue.",
    listFailed:
      "We couldn't load the suggestions. You can still use Next clue and pick from four options at the end.",
    listLoading: "Loading the suggestions…",
    alreadyGuessed: "Already guessed",
  },

  options: {
    /** The options' line, and the group's name, while a later clue is still to come. */
    lead: "Pick one of four",
    /**
     * D24: the line on clue 4, where the one pick is the last chance, so
     * nobody has to guess that a wrong one scores 0 (R2-16).
     */
    lastLead: `Last clue. Pick one of four. ${ONE_PICK}`,
    /**
     * D32: the line above the options on a device with no keyboard in use,
     * where a tap chooses and the button under the options locks in (D31).
     */
    tapLegend: "Tap one, then Lock in.",
    /**
     * D20, D32: the same line once a keyboard is in use, and the options'
     * description: a key chooses, Enter locks in. Digits choose too where
     * no option reads as a number (D6); each option names its own keys in
     * `aria-keyshortcuts`.
     */
    legend: "Keys A to D choose. Enter locks in.",
    /**
     * Said when an option is chosen, however it was (D31, R4-11): a
     * keyboard also hears how to lock it in.
     */
    chosenNamed: (label: string, keys: boolean) =>
      keys ? `${label} chosen. Enter locks it in.` : `${label} chosen.`,
    /** The button under the options, before a choice and once it names one (D31). */
    lockIn: "Lock in",
    lockInNamed: (label: string) => `Lock in ${label}`,
  },

  errors: {
    guess: "We couldn't check that guess. Try again.",
    retry: "Try again",
    offline:
      "You're offline. Your progress is saved, and we'll pick up where you left off.",
    notOnList:
      "That name isn't on our list for this Mystery. Pick one from the suggestions.",
    alreadyGuessed: "You've tried that one already. Pick another.",
  },

  reveal: {
    /**
     * The solved stamp (D10, `solvedStamp`): the pun lives here and nowhere
     * else (DESIGN §1.1), and only for a solve on clue 1 or 2 with no miss.
     */
    solved: "Knew it.",
    /** A solve on clue 3, or any solve after a wrong guess or pick (D10). */
    gotThere: "Got there.",
    /** A solve picked from the four options on clue 4 (D10). */
    picked: "Got it.",
    missed: "This one got away.",
    solvedOn: (clue: number) => `Solved on clue ${String(clue)}`,
    points,
    answerWas: "The answer was",
    clues: "All four clues",
    solvedHere: "Solved here",
    notNeeded: "Not needed",
    youGuessed: (name: string) => `You guessed ${name}`,
    youPicked: (name: string) => `You picked ${name}`,
    sources: (labels: readonly string[]) =>
      `${labels.length === 1 ? "Source" : "Sources"}: ${labels.join(", ")}`,
    /**
     * Beside the reveal's button once a keyboard is in use (R4-14): Enter
     * on the answer moves on, so the next press is never a surprise.
     */
    enterContinues: "Enter continues.",
    learnMore: "Learn more",
    /** The rest of the link's name: what it searches, and that it opens a tab. */
    learnMoreAbout: (name: string) =>
      `about ${name} on Wikipedia (opens in a new tab)`,
  },

  crowd: {
    title: "How everyone did",
    bar: (n: number) => `Clue ${String(n)}`,
    missed: "Missed",
    missedShort: "×",
    you: "you",
    topWrongGuess: (name: string) => `Most common wrong guess: ${name}`,
    coldStart: (n: number) =>
      `Only ${String(n)} ${n === 1 ? "player has" : "players have"} finished this one. Check back later for the numbers.`,
    tableCaption: "How everyone did, by the clue that solved it",
    share: (percent: number) => `${String(percent)}%`,
    column: { outcome: "Outcome", share: "Share of players" },
  },

  withdrawn: {
    title: "This Mystery was withdrawn because we got it wrong.",
    body: "Everyone gets 4 points.",
  },
} as const;

/**
 * The stamp for a solve (D10): "Got it." for a pick among the options on
 * clue 4, "Knew it." for a typed solve on clue 1 or 2 with no wrong guess
 * or pick before it, and "Got there." for the rest: a solve on clue 3 (a
 * pick there too, when the options come from clue 3), or any solve after a
 * miss. "Knew it." after a miss read as unearned (R1-22).
 */
export function solvedStamp(solve: {
  clue: number;
  picked: boolean;
  missed: boolean;
}): string {
  const copy = MYSTERY_COPY.reveal;
  if (solve.picked && solve.clue >= 4) return copy.picked;
  return solve.clue <= 2 && !solve.missed ? copy.solved : copy.gotThere;
}

/**
 * True when the round shows a miss before its resolution: a wrong typed
 * guess, or an option disabled by a wrong pick (or by an earlier guess).
 */
export function mysteryMissed(
  open: {
    wrongGuesses: readonly unknown[];
    options: readonly { alreadyGuessed: boolean }[] | null;
  } | null,
): boolean {
  if (open === null) return false;
  return (
    open.wrongGuesses.length > 0 ||
    (open.options?.some((option) => option.alreadyGuessed) ?? false)
  );
}

/**
 * The status message for a Mystery announcement (PRD §3.1.4, DESIGN §1.4,
 * §7.4), or null for another family's. A wrong guess and Next clue name the
 * new worth, so the status region repeats it (AC-DLY-29); a wrong guess
 * also reads the new clue in full, because focus stays in the field.
 *
 * A solve speaks its stamp (`solvedStamp`). The announcement doesn't say
 * whether a miss came first, so a controller that knows passes `history`
 * (`mysteryMissed` over the round's open); without it a typed solve on
 * clue 1 or 2 reads "Knew it.", as the reveal does after a reload.
 */
export function mysteryAnnouncementText(
  announcement: Announcement,
  rules: { optionsFromClue: 3 | 4 },
  history?: { missed: boolean },
): string | null {
  switch (announcement.kind) {
    case "wrong_guess":
    case "next_clue": {
      const clue = announcement.clue;
      const worth = worthOnClue(
        clue === 1 || clue === 2 || clue === 3 ? clue : 4,
      );
      const opened =
        clue === 4
          ? `Last clue, now worth ${points(worth)}.`
          : `Clue ${String(clue)} is in. Now worth ${String(worth)}.`;
      // When the options arrive, focus moves to their group (D28), whose
      // description is their line ("Last clue. Pick one of four. One pick:
      // a wrong one scores 0.", D24), so the status region doesn't say it
      // again (R3-05 after review).
      return announcement.kind === "wrong_guess"
        ? `Not ${announcement.guess}. ${opened} ${announcement.clueText}`
        : opened;
    }
    case "mystery_solved": {
      const stamp = solvedStamp({
        clue: announcement.clue,
        picked: announcement.clue >= rules.optionsFromClue,
        missed: history?.missed ?? false,
      });
      return `${stamp} ${announcement.answer}. Solved on clue ${String(announcement.clue)}, ${points(announcement.points)}.`;
    }
    case "mystery_missed":
      // An empty answer marks a withdrawal (the plugin's convention).
      return announcement.answer === ""
        ? `${MYSTERY_COPY.withdrawn.title} ${MYSTERY_COPY.withdrawn.body}`
        : `${MYSTERY_COPY.reveal.missed} ${MYSTERY_COPY.reveal.answerWas} ${announcement.answer}. ${points(0)}.`;
    default:
      return null;
  }
}
