/**
 * The encore plugin: closest number (ARCHITECTURE §4.4.1, PRD §4.2).
 *
 * The round shows a question, its unit and the number's kind and decimals.
 * One `lock_in` with a parsed value resolves it with the error, the band
 * and the display string. It scores 0 points: the error is the first
 * tiebreaker.
 *
 * **Client half (no key).** The check refuses a value the rules of
 * `encore/value.ts` refuse (the field's parser keeps those from being sent
 * at all), and once the round has resolved.
 *
 * **Judge half (holds the key).** It re-checks the value as
 * `round_judge_encore` does (positive, decimals, at most 15 significant
 * digits, years 1 to 9999), then computes the error and band exactly
 * (`scoring/encore.ts`). A second lock-in is `stale`: the guess can't change
 * (PRD §4.2.1). The judge state keeps the guess, so `encoreVerdictOf` can
 * rebuild the response for a replayed idempotency key (§8.8).
 *
 * A void that lands mid-round answers with a withdrawn reveal, which the
 * client half applies like any resolution (§8.8).
 *
 * **Bands.** The open carries the Encore's effective bands (its own, else
 * the defaults), which aren't secret: the hints, the number line and its
 * text equivalent name them (AC-DLY-35). ARCHITECTURE §3.3's encore
 * `RoundOpen` has no field for them yet, so until the contract gains
 * `bands` the open is typed `EncoreOpenWithBands` here, and the client
 * reads them through `encoreBandsOf`, which falls back to the defaults for
 * an open from a backend that doesn't send them.
 */
import type { EncoreContent } from "../../types/content.ts";
import type { EpochMs } from "../../types/ids.ts";
import type {
  RoundOpen,
  RoundOutcome,
  RoundReveal,
  RoundVerdict,
} from "../../types/rounds.ts";
import { formatEncoreAmount } from "../../encore/format.ts";
import { checkEncoreValue } from "../../encore/value.ts";
import {
  bandsFor,
  judgeEncoreGuess,
  type EncoreBands,
} from "../../scoring/encore.ts";
import type {
  Announcement,
  IntentCheck,
  JudgeResult,
  RoundPlugin,
} from "../types.ts";

export type EncoreOpen = Extract<RoundOpen, { family: "encore" }>;
export type EncoreReveal = Extract<RoundReveal, { family: "encore" }>;
type WithdrawnReveal = Extract<RoundReveal, { family: "withdrawn" }>;

export interface EncoreClient {
  open: EncoreOpen;
  /** Set once the round resolves: the reveal, or the withdrawal of a void that landed mid-round. */
  reveal: EncoreReveal | WithdrawnReveal | null;
}

export interface EncoreJudge {
  /** The round's index in its run. */
  index: number;
  /** When the question was issued. */
  issuedAt: EpochMs;
  /** The locked-in guess, once there is one. */
  result: { guess: number; at: EpochMs } | null;
}

/** An open with the Encore's effective bands (pending `bands` in ARCHITECTURE §3.3). */
export type EncoreOpenWithBands = EncoreOpen & { bands: EncoreBands };

function isBands(value: unknown): value is EncoreBands {
  if (typeof value !== "object" || value === null) return false;
  const { bullseye, close } = value as Partial<EncoreBands>;
  return (
    typeof bullseye === "number" &&
    typeof close === "number" &&
    Number.isFinite(bullseye) &&
    Number.isFinite(close) &&
    bullseye >= 0 &&
    bullseye <= close
  );
}

/**
 * The bands an open Encore is judged by: the ones it carries, else the
 * defaults for its kind (an open from a backend that doesn't send them).
 */
export function encoreBandsOf(open: EncoreOpen): EncoreBands {
  const carried = (open as Partial<EncoreOpenWithBands>).bands;
  return isBands(carried) ? carried : bandsFor(open.valueKind, null);
}

/** What the player sees while the Encore is open. */
export function encoreOpenOf(
  content: EncoreContent,
  judge: EncoreJudge,
): EncoreOpenWithBands {
  const bands = bandsFor(content.valueKind, content.bands);
  return {
    family: "encore",
    index: judge.index,
    question: content.question,
    unit: content.unit,
    unitShort: content.unitShort,
    unitLabel: content.unitLabel,
    valueKind: content.valueKind,
    decimals: content.decimals,
    issuedAt: judge.issuedAt,
    bands: { bullseye: bands.bullseye, close: bands.close },
  };
}

/** The reveal for a locked-in guess. */
export function encoreRevealOf(
  content: EncoreContent,
  guess: number,
): EncoreReveal {
  const { error, band } = judgeEncoreGuess(content, guess);
  return {
    family: "encore",
    guess,
    answer: content.answer,
    unit: content.unit,
    unitShort: content.unitShort,
    error,
    band,
    explanation: content.explanation,
    learnMore: content.learnMore,
    sourceLabels: [...content.sourceLabels],
    crowd: null,
  };
}

/** The response to the judge's current state, for a replayed idempotency key (§8.8). */
export function encoreVerdictOf(
  content: EncoreContent,
  judge: EncoreJudge,
): RoundVerdict {
  return judge.result === null
    ? { kind: "continue", open: encoreOpenOf(content, judge) }
    : {
        kind: "resolved",
        reveal: encoreRevealOf(content, judge.result.guess),
        next: null,
      };
}

export const encorePlugin: RoundPlugin<
  "encore",
  EncoreContent,
  EncoreClient,
  EncoreJudge
> = {
  family: "encore",
  types: ["encore"],
  maxPoints: () => 0,

  init(open) {
    return { open, reveal: null };
  },

  check(client, intent): IntentCheck {
    if (client.reveal !== null) return { ok: false, error: "invalid_input" };
    const checked = checkEncoreValue(intent.value, client.open);
    return checked.ok ? { ok: true } : { ok: false, error: "invalid_input" };
  },

  apply(client, verdict) {
    if (verdict.kind !== "resolved") return client;
    const reveal = verdict.reveal;
    return reveal.family === "encore" || reveal.family === "withdrawn"
      ? { ...client, reveal }
      : client;
  },

  outcome(client): Extract<RoundOutcome, { family: "encore" }> | null {
    const reveal = client.reveal;
    if (reveal === null) return null;
    if (reveal.family === "withdrawn") {
      return { family: "encore", error: null, band: null, voided: true };
    }
    return {
      family: "encore",
      error: reveal.error,
      band: reveal.band,
      voided: false,
    };
  },

  announce(client, verdict): Announcement {
    if (verdict.kind === "resolved" && verdict.reveal.family === "encore") {
      const reveal = verdict.reveal;
      const kind = client.open.valueKind;
      return {
        kind: "encore_result",
        guess: formatEncoreAmount(reveal.guess, reveal.unitShort, kind),
        answer: formatEncoreAmount(reveal.answer, reveal.unitShort, kind),
        error: reveal.error.display,
        band: reveal.band,
      };
    }
    // A withdrawal has no announcement kind of its own: empty fields mark
    // it, and the round's copy words it as the withdrawal (PRD §3.13.4).
    return {
      kind: "encore_result",
      guess: "",
      answer: "",
      error: "",
      band: null,
    };
  },

  open(content, meta, ctx) {
    const judge: EncoreJudge = {
      index: meta.index,
      issuedAt: ctx.at,
      result: null,
    };
    return { open: encoreOpenOf(content, judge), judge };
  },

  judge(content, judge, intent, ctx): JudgeResult<EncoreJudge> {
    if (judge.result !== null) return { ok: false, error: "stale" };
    if (!checkEncoreValue(intent.value, content).ok) {
      return { ok: false, error: "invalid_input" };
    }
    return {
      ok: true,
      judge: { ...judge, result: { guess: intent.value, at: ctx.at } },
      verdict: {
        kind: "resolved",
        reveal: encoreRevealOf(content, intent.value),
        next: null,
      },
    };
  },
};
