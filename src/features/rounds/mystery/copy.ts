/**
 * The Mystery round's words (PRD §3.1.4, §4.1.3; DESIGN §1.4, §6.3, §6.4,
 * §12.2). DESIGN's polished strings win where it has one; PRD wording fills
 * the rest. One ellipsis character, never three dots.
 *
 * `mysteryAnnouncementText` turns the plugin's announcement data into the
 * status message ("Not Heat. Clue 3 is in. Now worth 2. ..."), so every
 * controller that runs Mysteries (the Daily, the archive, challenges,
 * packs) speaks with the same words (ARCHITECTURE §4.4).
 */
import type { Announcement } from "@/engine/rounds";
import { worthOnClue } from "@/engine/scoring/mystery";
import type { AnswerType, DifficultyBand } from "@/engine/types";

/** How each answer type is named (CONTENT_GUIDE §2.10, "Player line"). */
export const ANSWER_TYPE_WORDS: Readonly<
  Record<AnswerType, { line: string; one: string; many: string }>
> = {
  country: { line: "a country", one: "country", many: "countries" },
  city: { line: "a city", one: "city", many: "cities" },
  person: { line: "a person", one: "person", many: "people" },
  film: { line: "a film", one: "film", many: "films" },
  tv_series: { line: "a TV series", one: "TV series", many: "TV series" },
  book: { line: "a book", one: "book", many: "books" },
  animal: { line: "an animal", one: "animal", many: "animals" },
  element: {
    line: "a chemical element",
    one: "chemical element",
    many: "chemical elements",
  },
  landmark: { line: "a landmark", one: "landmark", many: "landmarks" },
  music_artist: {
    line: "a musician or band",
    one: "musician or band",
    many: "musicians or bands",
  },
  dish: {
    line: "a dish or drink",
    one: "dish or drink",
    many: "dishes or drinks",
  },
  sport: {
    line: "a sport or game",
    one: "sport or game",
    many: "sports or games",
  },
};

/** When a round names no answer type (it always should): neutral words. */
const ANY_ANSWER = {
  line: "an answer",
  one: "answer",
  many: "answers",
} as const;

/** The words for a type, or the neutral ones. */
export function answerWords(type: AnswerType | null) {
  return type === null ? ANY_ANSWER : ANSWER_TYPE_WORDS[type];
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const points = (n: number) => `${String(n)} ${n === 1 ? "point" : "points"}`;

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
    placeholder: (type: AnswerType | null) =>
      `Start typing ${answerWords(type).line}`,
    button: "Guess",
    clear: "Clear your guess",
    hint: "Pick a name from the list, then Guess.",
    listLabel: (type: AnswerType | null, query: string) =>
      `${capitalize(answerWords(type).many)} matching ${query}`,
    /** The count announced on each change: "4 people match", "1 film matches". */
    count: (type: AnswerType | null, n: number) =>
      n === 1
        ? `1 ${answerWords(type).one} matches`
        : `${String(n)} ${answerWords(type).many} match`,
    /** Spoken when a row is chosen, since the field's new value is not. */
    selected: (name: string) => `${name} selected.`,
    noMatches: "No matches. Try another spelling, or tap Next clue.",
    listFailed:
      "We couldn't load the suggestions. You can still use Next clue and pick from four options at the end.",
    listLoading: "Loading the suggestions…",
    alreadyGuessed: "Already guessed",
  },

  options: {
    lead: "Pick one of four",
    group: "Four options",
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
    /** The solved stamp; the pun lives here and nowhere else (DESIGN §1.1). */
    solved: "Knew it.",
    /** A solve picked from the four options. */
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
 * The status message for a Mystery announcement (PRD §3.1.4, DESIGN §1.4,
 * §7.4), or null for another family's. A wrong guess and Next clue name the
 * new worth, so the status region repeats it (AC-DLY-29); a wrong guess
 * also reads the new clue in full, because focus stays in the field.
 */
export function mysteryAnnouncementText(
  announcement: Announcement,
  rules: { optionsFromClue: 3 | 4 },
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
      const pick =
        clue >= rules.optionsFromClue ? ` ${MYSTERY_COPY.options.lead}.` : "";
      return announcement.kind === "wrong_guess"
        ? `Not ${announcement.guess}. ${opened} ${announcement.clueText}${pick}`
        : `${opened}${pick}`;
    }
    case "mystery_solved": {
      const stamp =
        announcement.clue >= rules.optionsFromClue
          ? MYSTERY_COPY.reveal.picked
          : MYSTERY_COPY.reveal.solved;
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
