/**
 * The test plugin (ARCHITECTURE §12.3, CORE-0a): a small, fully working
 * plugin per family with both halves, so the run machine can be tested
 * before PRA-1 and MYS-1 build the real ones. It follows the same shape of
 * rules as the real plugins (one answer resolves a choice round; a wrong
 * guess or Next clue moves a mystery on; one lock-in resolves an encore),
 * with trivial content. Tests and fixtures only; never registered in
 * PLUGINS.
 */
import type { ChoiceFormat } from "../../types/content.ts";
import { parseEntityId, type EntityId } from "../../types/ids.ts";
import type {
  OptionView,
  RoundFamily,
  RoundOpen,
  RoundReveal,
  RoundVerdict,
  ShareCell,
  WrongGuess,
} from "../../types/rounds.ts";
import { orderingPlugin } from "../ordering/index.ts";
import type {
  Announcement,
  AnyRoundPlugin,
  IntentCheck,
  JudgeContext,
  JudgeResult,
  PluginRegistry,
  RoundPlugin,
} from "../types.ts";

/** The key the echo judges read. Every field is optional with a default. */
export interface EchoContent {
  /** choice: the correct option; mystery: the correct clue-4 option. Default 0. */
  correct?: number;
  /** mystery: the answer id. */
  answer?: EntityId;
  /** encore: the answer value. Default 100. */
  value?: number;
  /** choice and mystery options. Default 4. */
  optionCount?: number;
}

export interface EchoClient {
  open: RoundOpen;
  reveal: RoundReveal | null;
  /** Mystery: ids already guessed, wrong ones included. */
  guessed: EntityId[];
}

export interface EchoJudge {
  index: number;
  clue: 1 | 2 | 3 | 4;
  wrongGuesses: WrongGuess[];
  /** Clue-4 options already picked wrongly. */
  disabled: number[];
}

const DEFAULT_ANSWER: EntityId = (() => {
  const id = parseEntityId("fx.x.country.echo");
  if (id === null) throw new Error("echo: bad default answer id");
  return id;
})();

const label = (index: number) => `Option ${index + 1}`;

function options(
  count: number,
  disabled: readonly number[] = [],
): OptionView[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    label: label(index),
    alreadyGuessed: disabled.includes(index),
  }));
}

function init(open: RoundOpen): EchoClient {
  return { open, reveal: null, guessed: [] };
}

function apply(client: EchoClient, verdict: RoundVerdict): EchoClient {
  return verdict.kind === "continue"
    ? { ...client, open: verdict.open }
    : { ...client, reveal: verdict.reveal };
}

const refuse = (
  error: "already_guessed" | "invalid_input" | "not_selectable",
): IntentCheck => ({
  ok: false,
  error,
});

function mysteryCells(solvedOn: 1 | 2 | 3 | 4 | null): ShareCell[] {
  if (solvedOn === null) return ["passed", "passed", "passed", "passed"];
  return [
    ...Array<ShareCell>(solvedOn - 1).fill("passed"),
    "solved",
    ...Array<ShareCell>(4 - solvedOn).fill("unused"),
  ];
}

export const echoChoicePlugin: RoundPlugin<
  "choice",
  EchoContent,
  EchoClient,
  Record<string, never>
> = {
  family: "choice",
  types: ["mc", "tf", "comparison"],
  maxPoints: () => 1,
  init: (open) => init(open),
  check(client, intent): IntentCheck {
    if (client.reveal !== null) return refuse("invalid_input");
    if (client.open.family !== "choice") return refuse("invalid_input");
    const exists = client.open.options.some((o) => o.index === intent.option);
    return exists ? { ok: true } : refuse("not_selectable");
  },
  apply: (client, verdict) => apply(client, verdict),
  outcome(client) {
    const reveal = client.reveal;
    if (reveal?.family !== "choice") return null;
    return {
      family: "choice",
      correct: reveal.correct,
      points: reveal.points,
      voided: false,
      answerMs: null,
      cells: [reveal.correct ? "correct" : "wrong"],
    };
  },
  announce(client, verdict): Announcement {
    if (verdict.kind === "resolved" && verdict.reveal.family === "choice") {
      const answer = label(verdict.reveal.correctIndex);
      return verdict.reveal.correct
        ? { kind: "correct", answer }
        : {
            kind: "wrong_choice",
            chosen: label(verdict.reveal.chosenIndex ?? 0),
            answer,
          };
    }
    return { kind: "correct", answer: client.open.family };
  },
  open(content, meta, ctx) {
    const format: ChoiceFormat =
      meta.type === "tf" || meta.type === "comparison" ? meta.type : "mc";
    return {
      open: {
        family: "choice",
        index: meta.index,
        format,
        stem: `Echo question ${meta.index + 1}`,
        options: options(content.optionCount ?? 4),
        issuedAt: ctx.at,
      },
      judge: {},
    };
  },
  judge(content, judge, intent): JudgeResult<Record<string, never>> {
    const count = content.optionCount ?? 4;
    if (intent.option < 0 || intent.option >= count) {
      return { ok: false, error: "invalid_input" };
    }
    const correctIndex = content.correct ?? 0;
    const correct = intent.option === correctIndex;
    return {
      ok: true,
      judge,
      verdict: {
        kind: "resolved",
        reveal: {
          family: "choice",
          correctIndex,
          chosenIndex: intent.option,
          correct,
          points: correct ? 1 : 0,
          valueDisplay: null,
          explanation: "Echo explanation.",
          learnMore: "Echo",
          crowd: null,
        },
        next: null,
      },
    };
  },
};

function mysteryOpen(
  judge: EchoJudge,
  ctx: JudgeContext,
  content: EchoContent,
): Extract<RoundOpen, { family: "mystery" }> {
  return {
    family: "mystery",
    index: judge.index,
    clue: judge.clue,
    clues: Array.from({ length: judge.clue }, (_, i) => `Echo clue ${i + 1}`),
    wrongGuesses: judge.wrongGuesses,
    options:
      judge.clue >= ctx.optionsFromClue
        ? options(content.optionCount ?? 4, judge.disabled)
        : null,
    issuedAt: ctx.at,
  };
}

function nextClue(clue: 1 | 2 | 3 | 4): 2 | 3 | 4 {
  return clue === 1 ? 2 : clue === 2 ? 3 : 4;
}

/** Guesses happen before the options, so never on clue 4. */
function guessClue(clue: 1 | 2 | 3 | 4): 1 | 2 | 3 {
  return clue === 4 ? 3 : clue;
}

function mysteryReveal(
  content: EchoContent,
  solvedOn: 1 | 2 | 3 | 4 | null,
  pickedOption: number | null,
  wrongGuesses: readonly WrongGuess[],
): RoundReveal {
  return {
    family: "mystery",
    answer: {
      entityId: content.answer ?? DEFAULT_ANSWER,
      display: "Echo answer",
    },
    clues: ["Echo clue 1", "Echo clue 2", "Echo clue 3", "Echo clue 4"],
    solvedOn,
    points: solvedOn === null ? 0 : 5 - solvedOn,
    pickedOption,
    // The round's misses, as the real plugin's reveal carries them (R1-22).
    wrongGuesses: wrongGuesses.map((g) => ({ ...g })),
    pickedLabel: pickedOption === null ? null : label(pickedOption),
    explanation: "Echo explanation.",
    learnMore: "Echo",
    sourceLabels: [],
    crowd: null,
  };
}

export const echoMysteryPlugin: RoundPlugin<
  "mystery",
  EchoContent,
  EchoClient,
  EchoJudge
> = {
  family: "mystery",
  types: ["mystery"],
  maxPoints: () => 4,
  init: (open) => init(open),
  check(client, intent): IntentCheck {
    const open = client.open;
    if (client.reveal !== null || open.family !== "mystery") {
      return refuse("invalid_input");
    }
    if (intent.kind === "guess") {
      if (open.options !== null) return refuse("not_selectable");
      const guessed =
        client.guessed.includes(intent.entityId) ||
        open.wrongGuesses.some((g) => g.entityId === intent.entityId);
      return guessed ? refuse("already_guessed") : { ok: true };
    }
    if (intent.kind === "next_clue") {
      return open.clue < 4 ? { ok: true } : refuse("not_selectable");
    }
    const option = open.options?.find((o) => o.index === intent.option);
    if (option === undefined) return refuse("not_selectable");
    return option.alreadyGuessed ? refuse("already_guessed") : { ok: true };
  },
  apply(client, verdict) {
    const next = apply(client, verdict);
    if (verdict.kind === "continue" && verdict.open.family === "mystery") {
      const ids = verdict.open.wrongGuesses.map((g) => g.entityId);
      return { ...next, guessed: [...new Set([...client.guessed, ...ids])] };
    }
    return next;
  },
  outcome(client, meta) {
    const reveal = client.reveal;
    if (reveal?.family !== "mystery") return null;
    return {
      family: "mystery",
      solvedOn: reveal.solvedOn,
      points: reveal.points,
      voided: false,
      category: meta.category ?? "geo",
      cells: mysteryCells(reveal.solvedOn),
    };
  },
  announce(client, verdict): Announcement {
    if (verdict.kind === "continue" && verdict.open.family === "mystery") {
      const clueText = verdict.open.clues.at(-1) ?? "";
      const last = verdict.open.wrongGuesses.at(-1);
      const before =
        client.open.family === "mystery" ? client.open.wrongGuesses.length : 0;
      return last !== undefined && verdict.open.wrongGuesses.length > before
        ? {
            kind: "wrong_guess",
            guess: last.display,
            clue: verdict.open.clue,
            clueText,
          }
        : { kind: "next_clue", clue: verdict.open.clue, clueText };
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
    return { kind: "mystery_missed", answer: "" };
  },
  open(content, meta, ctx) {
    const judge: EchoJudge = {
      index: meta.index,
      clue: 1,
      wrongGuesses: [],
      disabled: [],
    };
    return { open: mysteryOpen(judge, ctx, content), judge };
  },
  judge(content, judge, intent, ctx): JudgeResult<EchoJudge> {
    const continueWith = (after: EchoJudge): JudgeResult<EchoJudge> => ({
      ok: true,
      judge: after,
      verdict: { kind: "continue", open: mysteryOpen(after, ctx, content) },
    });
    const resolveWith = (
      solvedOn: 1 | 2 | 3 | 4 | null,
      picked: number | null,
    ): JudgeResult<EchoJudge> => ({
      ok: true,
      judge,
      verdict: {
        kind: "resolved",
        reveal: mysteryReveal(content, solvedOn, picked, judge.wrongGuesses),
        next: null,
      },
    });
    if (intent.kind === "guess") {
      if (judge.clue >= ctx.optionsFromClue) {
        return { ok: false, error: "invalid_input" };
      }
      const entity = ctx.entities?.get(intent.entityId) ?? null;
      if (ctx.entities !== null && entity === null) {
        return { ok: false, error: "invalid_entity" };
      }
      if (judge.wrongGuesses.some((g) => g.entityId === intent.entityId)) {
        return { ok: false, error: "already_guessed" };
      }
      if (intent.entityId === (content.answer ?? DEFAULT_ANSWER)) {
        return resolveWith(judge.clue, null);
      }
      return continueWith({
        ...judge,
        clue: nextClue(judge.clue),
        wrongGuesses: [
          ...judge.wrongGuesses,
          {
            clue: guessClue(judge.clue),
            entityId: intent.entityId,
            display:
              entity?.display ?? `Guess ${judge.wrongGuesses.length + 1}`,
          },
        ],
      });
    }
    if (intent.kind === "next_clue") {
      if (judge.clue === 4) return { ok: false, error: "invalid_input" };
      return continueWith({ ...judge, clue: nextClue(judge.clue) });
    }
    if (judge.clue < ctx.optionsFromClue) {
      return { ok: false, error: "invalid_input" };
    }
    if (judge.disabled.includes(intent.option)) {
      return { ok: false, error: "already_guessed" };
    }
    if (intent.option === (content.correct ?? 0)) {
      return resolveWith(judge.clue, intent.option);
    }
    if (judge.clue === 4) return resolveWith(null, intent.option);
    return continueWith({
      ...judge,
      clue: nextClue(judge.clue),
      disabled: [...judge.disabled, intent.option],
    });
  },
};

export const echoEncorePlugin: RoundPlugin<
  "encore",
  EchoContent,
  EchoClient,
  Record<string, never>
> = {
  family: "encore",
  types: ["encore"],
  maxPoints: () => 0,
  init: (open) => init(open),
  check(client, intent): IntentCheck {
    if (client.reveal !== null) return refuse("invalid_input");
    return Number.isFinite(intent.value) && intent.value > 0
      ? { ok: true }
      : refuse("invalid_input");
  },
  apply: (client, verdict) => apply(client, verdict),
  outcome(client) {
    const reveal = client.reveal;
    if (reveal?.family !== "encore") return null;
    return {
      family: "encore",
      error: reveal.error,
      band: reveal.band,
      voided: false,
    };
  },
  announce(_client, verdict): Announcement {
    if (verdict.kind === "resolved" && verdict.reveal.family === "encore") {
      const { guess, answer, error, band } = verdict.reveal;
      return {
        kind: "encore_result",
        guess: String(guess),
        answer: String(answer),
        error: error.display,
        band,
      };
    }
    return {
      kind: "encore_result",
      guess: "",
      answer: "",
      error: "",
      band: null,
    };
  },
  open(_content, meta, ctx) {
    return {
      open: {
        family: "encore",
        index: meta.index,
        question: "How many echoes?",
        unit: "echoes",
        unitShort: "echoes",
        unitLabel: "echoes",
        valueKind: "quantity",
        decimals: 0,
        issuedAt: ctx.at,
      },
      judge: {},
    };
  },
  judge(content, judge, intent): JudgeResult<Record<string, never>> {
    if (!(intent.value > 0)) return { ok: false, error: "invalid_input" };
    const answer = content.value ?? 100;
    const ratio =
      Math.max(intent.value, answer) / Math.min(intent.value, answer) - 1;
    return {
      ok: true,
      judge,
      verdict: {
        kind: "resolved",
        reveal: {
          family: "encore",
          guess: intent.value,
          answer,
          unit: "echoes",
          unitShort: "echoes",
          error: {
            kind: "relative",
            value: ratio,
            display:
              ratio === 0 ? "Spot on" : `${Math.round(ratio * 100)}% off`,
          },
          band: ratio <= 0.05 ? "bullseye" : ratio <= 0.15 ? "close" : null,
          explanation: "Echo explanation.",
          learnMore: "Echo",
          sourceLabels: [],
          crowd: null,
        },
        next: null,
      },
    };
  },
};

/** A registry where every v1 family is an echo plugin; ordering keeps its stub. */
export function createEchoRegistry(): PluginRegistry {
  return {
    mc: echoChoicePlugin,
    tf: echoChoicePlugin,
    comparison: echoChoicePlugin,
    mystery: echoMysteryPlugin,
    encore: echoEncorePlugin,
    ordering: orderingPlugin,
  } satisfies Record<string, AnyRoundPlugin>;
}

/** The echo plugin for a family, for tests that judge locally. */
export function echoPluginFor(family: RoundFamily): AnyRoundPlugin {
  switch (family) {
    case "choice":
      return echoChoicePlugin;
    case "mystery":
      return echoMysteryPlugin;
    case "encore":
      return echoEncorePlugin;
    case "ordering":
      return orderingPlugin;
  }
}
