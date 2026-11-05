/**
 * The round UI contract (ARCHITECTURE §4.4.3). Every round component takes
 * these props, whatever the mode: the Daily, archive, challenges, packs,
 * shared quizzes, practice, Blitz, Survival, review and solo play.
 *
 * Round components own the round's whole visual life: the question, the
 * input, pressed and locked states, the reveal, and Continue placed where
 * the answers were. Shared pieces (answer buttons, the explanation sheet,
 * announcements) come from `src/ui`. They render data from the run machine
 * and send intents back; they never call the backend.
 */
import type { ComponentType } from "react";

import type { IntentError } from "@/engine/rounds";
import type { RoundStatus } from "@/engine/run";
import type {
  BackendErrorCode,
  EntityId,
  RoundIntent,
  RoundMeta,
  RoundOpen,
  RoundReveal,
  RunMode,
} from "@/engine/types";
import type { Settings } from "@/platform/settings/store";

/**
 * The settings a round reads while it plays (PRD §3.12.1), resolved:
 * `reducedMotion` already folds the setting and `prefers-reduced-motion`.
 */
export interface PlaySettings {
  /** Keys 1 to 4 pick options while focus is in the question. */
  shortcuts: boolean;
  reducedMotion: boolean;
  sound: boolean;
  haptics: boolean;
  /** Questions are read aloud; Blitz pauses its clock while speaking. */
  readAloud: boolean;
  /** Continue by itself after the reveal (2 s plus 0.25 s per word). */
  autoAdvance: boolean;
  /** The high-contrast feedback set (blue and orange). */
  highContrast: boolean;
  /** Spoken timer warnings in rooms and Blitz. */
  timerAnnouncements: boolean;
}

/** Resolves the stored settings for a round; `prefersReducedMotion` comes from the media query. */
export function playSettingsFrom(
  settings: Readonly<Settings>,
  prefersReducedMotion: boolean,
): PlaySettings {
  return {
    shortcuts: settings.shortcuts,
    reducedMotion:
      settings.motion === "on" ||
      (settings.motion === "system" && prefersReducedMotion),
    sound: settings.sound,
    haptics: settings.haptics,
    readAloud: settings.readAloud,
    autoAdvance: settings.autoAdvance,
    highContrast: settings.highContrast,
    timerAnnouncements: settings.timerAnnouncements,
  };
}

/** One suggestion row of the guess combobox (PRD §4.1.3, DESIGN §6.4). */
export interface Suggestion {
  entityId: EntityId;
  /** What the row shows: "Paris, France". */
  display: string;
  /** Still listed, disabled, with "Already guessed". */
  alreadyGuessed: boolean;
  /**
   * The part of `display` the query matched, for the `<mark>` highlight
   * (UTF-16 offsets, end exclusive); null when an alias or a typo matched.
   */
  match: { start: number; end: number } | null;
}

/** A Mystery's closed answer list, as the round uses it (MYS-1 builds it). */
export interface AnswerListHandle {
  status: "loading" | "ready" | "failed";
  /** At most SUGGESTION_COUNT rows, ranked; nothing is sent per keystroke. */
  suggest(query: string, alreadyGuessed: ReadonlySet<EntityId>): Suggestion[];
}

export interface RoundComponentProps {
  meta: RoundMeta;
  open: RoundOpen;
  /** The plugin's client state, narrowed inside the component. */
  client: unknown;
  /** checking: judging past 1.5 s. */
  status: RoundStatus;
  reveal: RoundReveal | null;
  error: { code: BackendErrorCode | IntentError; retryable: boolean } | null;
  onIntent(intent: RoundIntent): void;
  onContinue(): void;
  /** "Next mystery", "On to the Encore", "See your results". */
  continueLabel: string;
  context: {
    mode: RunMode;
    sealed: boolean;
    /** Mysteries only. */
    list: AnswerListHandle | null;
    /** For RevealActions (hearts, reports): 'p.geo.0142', 'daily:42:2'. */
    itemRef: string;
    settings: PlaySettings;
    /** The player has never finished a Daily (PRD 3.1.4 first-Daily hints). */
    firstDaily?: boolean;
  };
}

export type RoundComponent = ComponentType<RoundComponentProps>;
