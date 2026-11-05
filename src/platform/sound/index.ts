/**
 * Extension point (ARCHITECTURE §2.3): sound effects, the writing desk of
 * DESIGN §8. Every cue is synthesised in Web Audio on demand; nothing
 * carries meaning by sound alone, and effects are off by default on phones
 * (on for the host screen).
 *
 * A stub until SND-1: `playEffect` does nothing. SND-1 fills it (one
 * AudioContext created on the first tap with sound on, the master chain,
 * the setting and the host default) and keeps the signature, so callers
 * can wire their cues now.
 */

/** Phone cues (DESIGN §8). */
export type PhoneEffect =
  | "tap"
  | "suggestion_picked"
  | "clue_reveal"
  | "wrong"
  | "correct"
  | "mystery_solved"
  | "encore_close"
  | "encore_bullseye"
  | "streak_stroke"
  | "daily_complete";

/** Host-screen cues (DESIGN §8). */
export type HostEffect =
  | "player_joins"
  | "answer_locked"
  | "countdown_tick"
  | "times_up"
  | "reveal"
  | "podium";

export type EffectId = PhoneEffect | HostEffect;

export interface EffectOptions {
  /** clue_reveal: the clue now showing; the wood block steps down as points drain. */
  clue?: 2 | 3 | 4;
  /** mystery_solved: points earned, one note each; 4 adds the clue-1 ting. */
  points?: 1 | 2 | 3 | 4;
  /** countdown_tick: the final second, which sounds lower. */
  last?: boolean;
}

export function playEffect(_id: EffectId, _options?: EffectOptions): void {
  // No sound until SND-1.
}
