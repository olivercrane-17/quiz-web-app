/**
 * The round plugin contract (ARCHITECTURE §4.4).
 *
 * A plugin has two halves. The client half holds what the player can see
 * and checks intents locally. The judge half holds the key and decides
 * verdicts. Practice uses both halves on the device. Sealed play uses only
 * the client half on the device; the judge half runs in the mock server, and
 * SQL holds the authoritative copy of the judge.
 *
 * Plugins leave `verdict.next` and crowd stats null; the sealed layer (the
 * mock server or SQL) fills them in, because only it knows the attempt's
 * composition and the crowd. A voided round never reaches a plugin's open
 * or judge: the sealed layer resolves it as withdrawn first (§8.8).
 */
import type { Rng } from "../rng.ts";
import type { EntityId, EpochMs } from "../types/ids.ts";
import type {
  EncoreBand,
  RoundFamily,
  RoundIntent,
  RoundMeta,
  RoundOpen,
  RoundOutcome,
  RoundType,
  RoundVerdict,
} from "../types/rounds.ts";

/** An active entry of the round's closed answer list, as the judge needs it. */
export interface EntityRecord {
  id: EntityId;
  /** What a wrong-guess chip shows (§5.5). */
  display: string;
  /** "Name (descriptor)" for person, TV series and music artist; else `display` (§5.5). */
  optionLabel: string;
}

/** Validates guesses against the closed list. */
export interface EntityLookup {
  /** The active entry with this id, or null: not on the list, or retired since. */
  get(id: EntityId): EntityRecord | null;
}

export interface JudgeContext {
  /** Server time of this decision. */
  at: EpochMs;
  /** Forked per attempt and round. */
  rng: Rng;
  /** Stored option order for the round (sealed); null: derive from rng. */
  shuffle: readonly number[] | null;
  /** PRD Q3, tunable, default 4. */
  optionsFromClue: 3 | 4;
  /** Validates guesses against the closed list. */
  entities: EntityLookup | null;
}

export type IntentError =
  "already_guessed" | "invalid_input" | "not_selectable";
export type IntentCheck = { ok: true } | { ok: false; error: IntentError };
export type JudgeError =
  "invalid_entity" | "already_guessed" | "invalid_input" | "stale";

export type JudgeResult<Judge> =
  | { ok: true; judge: Judge; verdict: RoundVerdict }
  | { ok: false; error: JudgeError };

export interface RoundPlugin<F extends RoundFamily, Content, Client, Judge> {
  readonly family: F;
  /** choice: ['mc', 'tf', 'comparison'] */
  readonly types: readonly RoundType[];
  /** choice 1, mystery 4, encore 0 */
  maxPoints(meta: RoundMeta): number;
  // Client half (no key)
  init(open: Extract<RoundOpen, { family: F }>): Client;
  check(
    client: Client,
    intent: Extract<RoundIntent, { family: F }>,
  ): IntentCheck;
  apply(client: Client, verdict: RoundVerdict): Client;
  /** null until resolved. */
  outcome(
    client: Client,
    meta: RoundMeta,
  ): Extract<RoundOutcome, { family: F }> | null;
  /** Data, not copy: the feature layer words it (§4.4). */
  announce(client: Client, verdict: RoundVerdict): Announcement;
  // Judge half (holds the key)
  open(
    content: Content,
    meta: RoundMeta,
    ctx: JudgeContext,
  ): { open: Extract<RoundOpen, { family: F }>; judge: Judge };
  judge(
    content: Content,
    judge: Judge,
    intent: Extract<RoundIntent, { family: F }>,
    ctx: JudgeContext,
  ): JudgeResult<Judge>;
}

export type Announcement =
  | { kind: "correct"; answer: string }
  | { kind: "wrong_choice"; chosen: string; answer: string }
  | { kind: "wrong_guess"; guess: string; clue: number; clueText: string }
  | { kind: "next_clue"; clue: number; clueText: string }
  | { kind: "mystery_solved"; answer: string; clue: number; points: number }
  | { kind: "mystery_missed"; answer: string }
  | {
      kind: "encore_result";
      guess: string;
      answer: string;
      error: string;
      band: EncoreBand;
    };

/**
 * A plugin of any family, as the registry and the run machine hold it: the
 * same methods with the family-specific types erased. It is a separate
 * interface (not RoundPlugin<RoundFamily, ...>) so assignability is checked
 * member by member, where method parameters are bivariant and every
 * concrete plugin fits.
 */
export interface AnyRoundPlugin {
  readonly family: RoundFamily;
  readonly types: readonly RoundType[];
  maxPoints(meta: RoundMeta): number;
  init(open: RoundOpen): unknown;
  check(client: unknown, intent: RoundIntent): IntentCheck;
  apply(client: unknown, verdict: RoundVerdict): unknown;
  outcome(client: unknown, meta: RoundMeta): RoundOutcome | null;
  announce(client: unknown, verdict: RoundVerdict): Announcement;
  open(
    content: unknown,
    meta: RoundMeta,
    ctx: JudgeContext,
  ): { open: RoundOpen; judge: unknown };
  judge(
    content: unknown,
    judge: unknown,
    intent: RoundIntent,
    ctx: JudgeContext,
  ): JudgeResult<unknown>;
}

/** Keyed by RoundType (§4.4). */
export type PluginRegistry = Readonly<Record<RoundType, AnyRoundPlugin>>;

/** Thrown by the Wave 0 stubs until their ticket fills the plugin. */
export class PluginNotBuiltError extends Error {
  readonly family: RoundFamily;
  constructor(family: RoundFamily, ticket: string) {
    super(`The ${family} round plugin is a stub until ${ticket} builds it.`);
    this.name = "PluginNotBuiltError";
    this.family = family;
  }
}

/** The ordering stub's error (§2.3): v1 has no ordering content. */
export class UnsupportedRoundTypeError extends Error {
  readonly code = "unsupported_round_type";
  readonly type: RoundType;
  constructor(type: RoundType) {
    super(`Round type ${type} is not supported in v1.`);
    this.name = "UnsupportedRoundTypeError";
    this.type = type;
  }
}
