/**
 * The choice plugin: multiple choice, true/false and comparison rounds
 * (ARCHITECTURE §4.4.1, PRD §3.3.1, §3.3.2). Both halves.
 *
 * Everything the client sees counts options in display order:
 * `OptionView.index`, the intent's `option`, and the reveal's `correctIndex`
 * and `chosenIndex`. Source order stays inside the judge, because the build
 * puts a multiple-choice key first (CONTENT_GUIDE §2.4), so a source index
 * would give the answer away. How the display order is chosen is in
 * ./order.ts.
 *
 * One `answer` intent resolves the round: 1 point when right, 0 when wrong,
 * in practice and in sealed play alike, with the share cell `correct` or
 * `wrong` (PRD §3.3.2). A comparison's reveal carries both checked values,
 * in display order. Crowd stats and `next` stay null: the sealed layer
 * fills them in (§4.4).
 */
import type { ChoiceItem } from "../../types/content.ts";
import type {
  OptionView,
  RoundOpen,
  RoundOutcome,
  RoundReveal,
  RoundVerdict,
} from "../../types/rounds.ts";
import type {
  Announcement,
  IntentCheck,
  JudgeResult,
  RoundPlugin,
} from "../types.ts";
import { choiceDisplayOrder } from "./order.ts";

export { choiceDisplayOrder, isPermutation } from "./order.ts";
export { displayLabels, hasNumberOption, midSentence } from "./labels.ts";

/** What the judge half reads: a practice item or sealed choice content. */
export type ChoiceContent = Omit<ChoiceItem, "predicted">;

export type ChoiceOpen = Extract<RoundOpen, { family: "choice" }>;
export type ChoiceReveal = Extract<RoundReveal, { family: "choice" }>;
type WithdrawnReveal = Extract<RoundReveal, { family: "withdrawn" }>;

/** The client half: what the player can see. */
export interface ChoiceClient {
  open: ChoiceOpen;
  /** Set once the round resolves (a withdrawn round never reaches the plugin, but is kept if it does). */
  reveal: ChoiceReveal | WithdrawnReveal | null;
}

/** The judge half: the key, by display position. */
export interface ChoiceJudge {
  /** Display position to source index. */
  order: number[];
  /** The key's display position. */
  correct: number;
  /** The display position answered, once the round has resolved. */
  answered: number | null;
}

const refuse = (
  error: "already_guessed" | "invalid_input" | "not_selectable",
): IntentCheck => ({ ok: false, error });

function labelAt(open: ChoiceOpen, index: number | null): string {
  if (index === null) return "";
  return open.options.find((option) => option.index === index)?.label ?? "";
}

/** Both checked values of a comparison, in display order; null for other formats. */
function displayValues(
  content: ChoiceContent,
  order: readonly number[],
): readonly [string, string] | null {
  const values = content.valueDisplay;
  if (content.format !== "comparison" || values === null) return null;
  const first = values[order[0] ?? 0];
  const second = values[order[1] ?? 1];
  return first === undefined || second === undefined ? null : [first, second];
}

export const choicePlugin: RoundPlugin<
  "choice",
  ChoiceContent,
  ChoiceClient,
  ChoiceJudge
> = {
  family: "choice",
  types: ["mc", "tf", "comparison"],
  maxPoints: () => 1,

  init: (open) => ({ open, reveal: null }),

  check(client, intent): IntentCheck {
    if (client.reveal !== null) return refuse("not_selectable");
    if (!Number.isInteger(intent.option)) return refuse("invalid_input");
    const option = client.open.options.find((o) => o.index === intent.option);
    if (option === undefined) return refuse("not_selectable");
    return option.alreadyGuessed ? refuse("already_guessed") : { ok: true };
  },

  apply(client, verdict: RoundVerdict): ChoiceClient {
    if (verdict.kind === "continue") {
      return verdict.open.family === "choice"
        ? { ...client, open: verdict.open }
        : client;
    }
    const reveal = verdict.reveal;
    return reveal.family === "choice" || reveal.family === "withdrawn"
      ? { ...client, reveal }
      : client;
  },

  outcome(client): Extract<RoundOutcome, { family: "choice" }> | null {
    const reveal = client.reveal;
    if (reveal === null) return null;
    if (reveal.family === "withdrawn") {
      return {
        family: "choice",
        correct: false,
        points: reveal.points,
        voided: true,
        answerMs: null,
        cells: ["voided"],
      };
    }
    return {
      family: "choice",
      correct: reveal.correct,
      points: reveal.points,
      voided: false,
      answerMs: null,
      cells: [reveal.correct ? "correct" : "wrong"],
    };
  },

  /**
   * `correct` names the answer; `wrong_choice` names the pick and the
   * answer, with `chosen` empty when the round resolved without one (a room
   * deadline). Anything else is not a choice verdict and carries empty
   * words, which the feature layer turns into no announcement at all.
   */
  announce(client, verdict): Announcement {
    if (verdict.kind === "resolved" && verdict.reveal.family === "choice") {
      const reveal = verdict.reveal;
      const answer = labelAt(client.open, reveal.correctIndex);
      return reveal.correct
        ? { kind: "correct", answer }
        : {
            kind: "wrong_choice",
            chosen: labelAt(client.open, reveal.chosenIndex),
            answer,
          };
    }
    return { kind: "correct", answer: "" };
  },

  open(content, meta, ctx) {
    const order = choiceDisplayOrder(content, ctx.rng, ctx.shuffle);
    const options: OptionView[] = order.map((source, index) => ({
      index,
      label: content.options[source] ?? "",
      alreadyGuessed: false,
    }));
    return {
      open: {
        family: "choice",
        index: meta.index,
        format: content.format,
        stem: content.stem,
        options,
        issuedAt: ctx.at,
      },
      judge: { order, correct: order.indexOf(content.correct), answered: null },
    };
  },

  judge(content, judge, intent): JudgeResult<ChoiceJudge> {
    // One answer resolves the round; a second one meets a round that moved on.
    if (judge.answered !== null) return { ok: false, error: "stale" };
    const option = intent.option;
    if (
      !Number.isInteger(option) ||
      option < 0 ||
      option >= judge.order.length
    ) {
      return { ok: false, error: "invalid_input" };
    }
    const correct = option === judge.correct;
    return {
      ok: true,
      judge: { ...judge, answered: option },
      verdict: {
        kind: "resolved",
        reveal: {
          family: "choice",
          correctIndex: judge.correct,
          chosenIndex: option,
          correct,
          points: correct ? 1 : 0,
          valueDisplay: displayValues(content, judge.order),
          explanation: content.explanation,
          learnMore: content.learnMore,
          crowd: null,
        },
        next: null,
      },
    };
  },
};
