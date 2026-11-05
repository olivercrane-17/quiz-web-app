/**
 * The mystery plugin: the clue ladder (ARCHITECTURE §4.4.1, PRD §4.1).
 *
 * One answer from a closed list, four clues hardest first, three
 * distractors. On clues 1 to 3 the player guesses an entity from the list or
 * takes Next clue; from clue `optionsFromClue` (4 by default, PRD Q3) four
 * options replace typing. A solve on clue k scores `5 - k`; a wrong pick on
 * clue 4 misses with 0.
 *
 * **Client half (no key).** The state is rebuilt from the `RoundOpen` alone,
 * because a reload resumes a sealed round from the server's snapshot: the
 * clue, the clues so far, the wrong guesses (whose ids the check refuses
 * again, so an alias of an earlier guess is `already_guessed`) and the
 * options with their `alreadyGuessed` flags.
 *
 * **Judge half (holds the key).** `guess`: an id that is not an active entry
 * of the list is `invalid_entity` and a repeat is `already_guessed`, and
 * neither consumes anything; the answer or an accepted id resolves with
 * `5 - k`; any other id issues clue `k + 1`. `next_clue` issues clue
 * `k + 1`. `pick` judges an option: right resolves with `5 - k`, wrong
 * before clue 4 issues the next clue with that option disabled, wrong on
 * clue 4 misses. A typed guess of a distractor also comes back disabled
 * once the options show. Share cells don't change with picks: a wrong pick
 * is a passed square, like a wrong guess (§4.4.1).
 *
 * The judge state (`MysteryJudge`) is plain JSON, so the mock server can
 * store it, and `clue` is the step a round action must name (§7.2: a
 * mismatch is `stale`). `mysteryVerdictOf` rebuilds the response for a
 * replayed idempotency key from the current state (§8.8), and
 * `mysteryOpenOf` the open a resume snapshot carries. The reveal carries
 * the round's misses (its wrong typed guesses and the picked option's
 * label), so a reveal a reload brings back reads as the live one (R1-22).
 *
 * Mystery judging needs the round's answer list (`JudgeContext.entities`):
 * without it every guess is `invalid_entity`, and the options can't be
 * labelled. Plugins leave `verdict.next` and crowd stats null; the sealed
 * layer fills them in. A voided round never reaches open or judge (§8.8),
 * but a void that lands mid-round answers the next action with a withdrawn
 * reveal, which the client half applies like any resolution.
 */
import type { CategoryId, MysteryContent } from "../../types/content.ts";
import type { EntityId, EpochMs } from "../../types/ids.ts";
import type {
  OptionView,
  RoundMeta,
  RoundOpen,
  RoundOutcome,
  RoundReveal,
  RoundVerdict,
  WrongGuess,
} from "../../types/rounds.ts";
import {
  MYSTERY_MAX_POINTS,
  mysteryCells,
  mysteryPoints,
  nextClueNumber,
  type ClueNumber,
} from "../../scoring/mystery.ts";
import type {
  Announcement,
  EntityLookup,
  IntentCheck,
  JudgeContext,
  JudgeResult,
  RoundPlugin,
} from "../types.ts";
import {
  OPTION_COUNT,
  optionEntity,
  optionLabels,
  optionOrder,
} from "./options.ts";

export type MysteryOpen = Extract<RoundOpen, { family: "mystery" }>;
export type MysteryReveal = Extract<RoundReveal, { family: "mystery" }>;
export type WithdrawnReveal = Extract<RoundReveal, { family: "withdrawn" }>;

export interface MysteryClient {
  open: MysteryOpen;
  /** Every entity guessed by typing so far; the check refuses them again. */
  guessed: EntityId[];
  /** Set once the round resolves: the reveal, or the withdrawal of a void that landed mid-round. */
  reveal: MysteryReveal | WithdrawnReveal | null;
}

export interface MysteryJudge {
  /** The round's index in its run, which every open carries. */
  index: number;
  /** The current clue, and the step a round action must name. */
  clue: ClueNumber;
  /** `order[i]` indexes `[answer, ...distractors]` for display index `i`. */
  order: number[];
  /** Wrong typed guesses, in order, each on the clue it was made on. */
  wrongGuesses: WrongGuess[];
  /** Display indexes picked wrongly before clue 4, disabled from then on. */
  wrongPicks: number[];
  /** When each clue was issued: `issuedAt[k - 1]` is clue k. */
  issuedAt: EpochMs[];
  /** Set once the round resolves. */
  result: {
    solvedOn: ClueNumber | null;
    pickedOption: number | null;
    at: EpochMs;
  } | null;
}

const refuse = (
  error: "already_guessed" | "invalid_input" | "not_selectable",
): IntentCheck => ({ ok: false, error });

function optionsShown(clue: ClueNumber, ctx: JudgeContext): boolean {
  return clue >= ctx.optionsFromClue;
}

/** Display indexes that come back `alreadyGuessed`: wrong picks, and typed guesses among the options. */
function disabledOptions(
  content: MysteryContent,
  judge: MysteryJudge,
): number[] {
  const typed = new Set(judge.wrongGuesses.map((g) => g.entityId));
  const disabled: number[] = [];
  for (let index = 0; index < OPTION_COUNT; index += 1) {
    const entity = optionEntity(content, judge.order, index);
    if (
      judge.wrongPicks.includes(index) ||
      (entity !== null && typed.has(entity))
    ) {
      disabled.push(index);
    }
  }
  return disabled;
}

function optionViews(
  content: MysteryContent,
  judge: MysteryJudge,
  ctx: JudgeContext,
): OptionView[] {
  const labels = optionLabels(content, judge.order, ctx.entities);
  const disabled = disabledOptions(content, judge);
  return labels.map((label, index) => ({
    index,
    label,
    alreadyGuessed: disabled.includes(index),
  }));
}

/** What the player sees on the judge's current clue; also the open a resume snapshot carries. */
export function mysteryOpenOf(
  content: MysteryContent,
  judge: MysteryJudge,
  ctx: JudgeContext,
): MysteryOpen {
  return {
    family: "mystery",
    index: judge.index,
    clue: judge.clue,
    clues: content.clues.slice(0, judge.clue),
    wrongGuesses: judge.wrongGuesses.map((g) => ({ ...g })),
    options: optionsShown(judge.clue, ctx)
      ? optionViews(content, judge, ctx)
      : null,
    issuedAt: judge.issuedAt[judge.clue - 1] ?? ctx.at,
  };
}

/** The label the player saw on a picked option, or null without a pick or the list. */
function pickedLabelOf(
  content: MysteryContent,
  judge: MysteryJudge,
  entities: EntityLookup | null,
): string | null {
  const picked = judge.result?.pickedOption ?? null;
  if (picked === null || entities === null) return null;
  return optionLabels(content, judge.order, entities)[picked] ?? null;
}

/**
 * The full reveal of a resolved judge state, with the round's misses: its
 * wrong typed guesses and the label of the option picked (R1-22), which a
 * reveal brought back after a reload needs and the player has already seen.
 */
export function mysteryRevealOf(
  content: MysteryContent,
  judge: MysteryJudge,
  ctx: Pick<JudgeContext, "entities">,
): MysteryReveal {
  const result = judge.result;
  const solvedOn = result?.solvedOn ?? null;
  return {
    family: "mystery",
    answer: {
      entityId: content.answer,
      display: ctx.entities?.get(content.answer)?.display ?? content.learnMore,
    },
    clues: [...content.clues],
    solvedOn,
    points: mysteryPoints(solvedOn),
    pickedOption: result?.pickedOption ?? null,
    wrongGuesses: judge.wrongGuesses.map((g) => ({ ...g })),
    pickedLabel: pickedLabelOf(content, judge, ctx.entities),
    explanation: content.explanation,
    learnMore: content.learnMore,
    sourceLabels: [...content.sourceLabels],
    crowd: null,
  };
}

/**
 * The response to the judge's current state: the reveal once resolved,
 * else the current clue. A replayed idempotency key gets this, rebuilt from
 * the post-action state (§8.8).
 */
export function mysteryVerdictOf(
  content: MysteryContent,
  judge: MysteryJudge,
  ctx: JudgeContext,
): RoundVerdict {
  return judge.result === null
    ? { kind: "continue", open: mysteryOpenOf(content, judge, ctx) }
    : {
        kind: "resolved",
        reveal: mysteryRevealOf(content, judge, ctx),
        next: null,
      };
}

function isCorrect(content: MysteryContent, id: EntityId): boolean {
  return id === content.answer || content.accepted.includes(id);
}

function categoryOf(meta: RoundMeta): CategoryId {
  if (meta.category === null) {
    throw new RangeError(`mystery round ${meta.index} has no category`);
  }
  return meta.category;
}

/** The option a wrong pick just disabled, comparing the options before and after. */
function newlyDisabled(
  before: readonly OptionView[] | null,
  after: readonly OptionView[] | null,
): OptionView | null {
  if (before === null || after === null) return null;
  return (
    after.find(
      (option) =>
        option.alreadyGuessed &&
        before.some((o) => o.index === option.index && !o.alreadyGuessed),
    ) ?? null
  );
}

export const mysteryPlugin: RoundPlugin<
  "mystery",
  MysteryContent,
  MysteryClient,
  MysteryJudge
> = {
  family: "mystery",
  types: ["mystery"],
  maxPoints: () => MYSTERY_MAX_POINTS,

  init(open) {
    return {
      open,
      guessed: [...new Set(open.wrongGuesses.map((g) => g.entityId))],
      reveal: null,
    };
  },

  check(client, intent): IntentCheck {
    if (client.reveal !== null) return refuse("invalid_input");
    const open = client.open;
    switch (intent.kind) {
      case "guess":
        if (open.options !== null) return refuse("not_selectable");
        return client.guessed.includes(intent.entityId)
          ? refuse("already_guessed")
          : { ok: true };
      case "next_clue":
        return open.clue < 4 ? { ok: true } : refuse("not_selectable");
      case "pick": {
        const option = open.options?.find((o) => o.index === intent.option);
        if (option === undefined) return refuse("not_selectable");
        return option.alreadyGuessed ? refuse("already_guessed") : { ok: true };
      }
    }
  },

  apply(client, verdict) {
    if (verdict.kind === "continue") {
      if (verdict.open.family !== "mystery") return client;
      const guessed = new Set(client.guessed);
      for (const g of verdict.open.wrongGuesses) guessed.add(g.entityId);
      return { ...client, open: verdict.open, guessed: [...guessed] };
    }
    const reveal = verdict.reveal;
    return reveal.family === "mystery" || reveal.family === "withdrawn"
      ? { ...client, reveal }
      : client;
  },

  outcome(client, meta): Extract<RoundOutcome, { family: "mystery" }> | null {
    const reveal = client.reveal;
    if (reveal === null) return null;
    if (reveal.family === "withdrawn") {
      return {
        family: "mystery",
        solvedOn: null,
        points: reveal.points,
        voided: true,
        category: categoryOf(meta),
        cells: ["voided", "voided", "voided", "voided"],
      };
    }
    return {
      family: "mystery",
      solvedOn: reveal.solvedOn,
      points: reveal.points,
      voided: false,
      category: categoryOf(meta),
      cells: mysteryCells(reveal.solvedOn),
    };
  },

  announce(client, verdict): Announcement {
    if (verdict.kind === "continue" && verdict.open.family === "mystery") {
      const next = verdict.open;
      const clueText = next.clues.at(-1) ?? "";
      const guess = next.wrongGuesses.at(-1);
      if (
        guess !== undefined &&
        next.wrongGuesses.length > client.open.wrongGuesses.length
      ) {
        return {
          kind: "wrong_guess",
          guess: guess.display,
          clue: next.clue,
          clueText,
        };
      }
      const picked = newlyDisabled(client.open.options, next.options);
      if (picked !== null) {
        return {
          kind: "wrong_guess",
          guess: picked.label,
          clue: next.clue,
          clueText,
        };
      }
      return { kind: "next_clue", clue: next.clue, clueText };
    }
    if (verdict.kind === "resolved" && verdict.reveal.family === "mystery") {
      const { answer, solvedOn, points } = verdict.reveal;
      return solvedOn === null
        ? { kind: "mystery_missed", answer: answer.display }
        : {
            kind: "mystery_solved",
            answer: answer.display,
            clue: solvedOn,
            points,
          };
    }
    // A withdrawal has no announcement kind of its own: an empty answer
    // marks it, and the round's copy words it as the withdrawal (PRD §3.13.4).
    return { kind: "mystery_missed", answer: "" };
  },

  open(content, meta, ctx) {
    const judge: MysteryJudge = {
      index: meta.index,
      clue: 1,
      order: optionOrder(ctx),
      wrongGuesses: [],
      wrongPicks: [],
      issuedAt: [ctx.at],
      result: null,
    };
    return { open: mysteryOpenOf(content, judge, ctx), judge };
  },

  judge(content, judge, intent, ctx): JudgeResult<MysteryJudge> {
    if (judge.result !== null) return { ok: false, error: "stale" };

    const resolve = (
      solvedOn: ClueNumber | null,
      pickedOption: number | null,
    ): JudgeResult<MysteryJudge> => {
      const after: MysteryJudge = {
        ...judge,
        result: { solvedOn, pickedOption, at: ctx.at },
      };
      return {
        ok: true,
        judge: after,
        verdict: {
          kind: "resolved",
          reveal: mysteryRevealOf(content, after, ctx),
          next: null,
        },
      };
    };

    const advance = (
      change: Partial<Pick<MysteryJudge, "wrongGuesses" | "wrongPicks">>,
    ): JudgeResult<MysteryJudge> => {
      if (judge.clue === 4) return { ok: false, error: "invalid_input" };
      const after: MysteryJudge = {
        ...judge,
        ...change,
        clue: nextClueNumber(judge.clue),
        issuedAt: [...judge.issuedAt, ctx.at],
      };
      return {
        ok: true,
        judge: after,
        verdict: { kind: "continue", open: mysteryOpenOf(content, after, ctx) },
      };
    };

    switch (intent.kind) {
      case "guess": {
        // Typing is replaced by the options from clue optionsFromClue on.
        if (optionsShown(judge.clue, ctx) || judge.clue === 4) {
          return { ok: false, error: "invalid_input" };
        }
        const entity = ctx.entities?.get(intent.entityId) ?? null;
        if (entity === null) return { ok: false, error: "invalid_entity" };
        if (judge.wrongGuesses.some((g) => g.entityId === intent.entityId)) {
          return { ok: false, error: "already_guessed" };
        }
        if (isCorrect(content, intent.entityId)) {
          return resolve(judge.clue, null);
        }
        return advance({
          wrongGuesses: [
            ...judge.wrongGuesses,
            {
              clue: judge.clue,
              entityId: intent.entityId,
              display: entity.display,
            },
          ],
        });
      }
      case "next_clue":
        return advance({});
      case "pick": {
        const option = intent.option;
        if (
          !optionsShown(judge.clue, ctx) ||
          !Number.isInteger(option) ||
          option < 0 ||
          option >= OPTION_COUNT
        ) {
          return { ok: false, error: "invalid_input" };
        }
        if (disabledOptions(content, judge).includes(option)) {
          return { ok: false, error: "already_guessed" };
        }
        if (judge.order[option] === 0) return resolve(judge.clue, option);
        if (judge.clue === 4) return resolve(null, option);
        return advance({ wrongPicks: [...judge.wrongPicks, option] });
      }
    }
  },
};

export {
  OPTION_COUNT,
  isOptionOrder,
  optionLabels,
  optionOrder,
  showsBracket,
} from "./options.ts";
