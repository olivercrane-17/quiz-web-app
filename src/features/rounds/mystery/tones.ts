/**
 * Colour, type and motion hooks for the Mystery and Encore rounds (DESIGN
 * §2.2, §3.2, §7.2).
 *
 * Each colour class reads DS-1's `--kn-*` token and falls back to the
 * greybox theme, so the rounds take the real palette, dark mode and the
 * high-contrast feedback set (which swaps the correct and incorrect tokens)
 * the day DS-1 lands, with no edit here. No state rests on colour alone:
 * every tone sits beside an icon and a word, and the greybox fallbacks also
 * differ in shape (solid against dashed, filled against outlined).
 *
 * Motion uses CSS transitions with `@starting-style` (Tailwind's `starting:`
 * variant), the first bundle's motion budget (PRD §8.1). Every entrance has
 * a reduced form: a 140 ms fade with no movement (DESIGN §7.1).
 */

export const TONE = {
  ink: "text-[color:var(--kn-ink,var(--foreground))]",
  ink2: "text-[color:var(--kn-ink-2,var(--muted-foreground))]",
  ink3: "text-[color:var(--kn-ink-3,var(--muted-foreground))]",
  surface: "bg-[color:var(--kn-surface,var(--background))]",
  sunken: "bg-[color:var(--kn-sunken,var(--muted))]",
  ruleBorder: "border-[color:var(--kn-rule,var(--border))]",
  strongBorder:
    "border-[color:var(--kn-rule-strong,color-mix(in_oklab,var(--foreground)_45%,transparent))]",
  inkBorder: "border-[color:var(--kn-ink,var(--foreground))]",
  inkFill:
    "bg-[color:var(--kn-ink,var(--foreground))] text-[color:var(--kn-surface,var(--background))]",
  ledge:
    "shadow-[0_3px_0_0_var(--kn-ledge,color-mix(in_oklab,var(--foreground)_18%,transparent))]",
  ledgeTall:
    "shadow-[0_4px_0_0_var(--kn-ledge,color-mix(in_oklab,var(--foreground)_18%,transparent))]",
  accentFill:
    "bg-[color:var(--kn-play-accent,var(--foreground))] text-[color:var(--kn-on-play-accent,var(--background))]",
  accentTint: "bg-[color:var(--kn-accent-tint,var(--muted))]",
  accentBar: "bg-[color:var(--kn-play-accent,var(--foreground))]",
  correctFill:
    "bg-[color:var(--kn-correct,var(--foreground))] text-[color:var(--kn-on-correct,var(--background))]",
  correctTint: "bg-[color:var(--kn-correct-tint,var(--muted))]",
  correctBorder: "border-[color:var(--kn-correct-line,var(--foreground))]",
  correctText: "text-[color:var(--kn-correct-text,var(--foreground))]",
  incorrectBorder: "border-[color:var(--kn-incorrect-line,var(--foreground))]",
  incorrectText: "text-[color:var(--kn-incorrect-text,var(--foreground))]",
  chartBar:
    "bg-[color:var(--kn-chart-bar,color-mix(in_oklab,var(--foreground)_45%,transparent))]",
  chartYou:
    "bg-[color:var(--kn-chart-you,var(--foreground))] bg-[repeating-linear-gradient(-45deg,transparent_0_3px,color-mix(in_oklab,var(--background)_45%,transparent)_3px_5px)]",
} as const;

/** Fraunces for data numerals, the answer and the stamps (DESIGN §3.3); a serif until DS-1 loads it. */
export const DISPLAY_FONT =
  "font-[family-name:var(--kn-font-display,ui-serif,Georgia,serif)]";

/** DESIGN §7.2 easings. */
const SPRING = "ease-[cubic-bezier(0.34,1.56,0.64,1)]";
const OUT = "ease-[cubic-bezier(0.22,1,0.36,1)]";

/**
 * Entrance classes, by moment. `reduced` is the reduced-motion form: the
 * same element fades in place over 140 ms.
 */
export const ENTER = {
  /** A wrong guess is stamped onto its clue: from 1.4 times and +12 degrees (220 ms, spring). */
  stamp: `transition-[scale,rotate,opacity] duration-[220ms] ${SPRING} starting:scale-[1.4] starting:rotate-12 starting:opacity-0`,
  /** The new clue unfolds in its slot: fades in, drops 10 px, scaleY 0.9 to 1 (320 ms at 260 ms). */
  clue: `origin-top transition-[opacity,translate,scale] duration-[320ms] delay-[260ms] ${OUT} starting:-translate-y-2.5 starting:scale-y-90 starting:opacity-0`,
  /** The "New" tag rises in at 560 ms. */
  tag: `transition-[opacity,translate] duration-200 delay-[560ms] ${OUT} starting:translate-y-1 starting:opacity-0`,
  /** "Knew it." stamps in at 440 ms from 1.4 times and 10 degrees (240 ms, spring). */
  verdict: `transition-[scale,rotate,opacity] duration-[240ms] delay-[440ms] ${SPRING} starting:scale-[1.4] starting:rotate-[10deg] starting:opacity-0`,
  /** The reveal replaces the clue screen with a 200 ms cross-fade. */
  card: "transition-opacity duration-200 starting:opacity-0",
  /** A tag or line that follows the verdict (600 ms). */
  late: `transition-[opacity,translate] duration-[240ms] delay-[600ms] ${OUT} starting:translate-y-1 starting:opacity-0`,
  /** Every reduced-motion substitute. */
  reduced: "transition-opacity duration-[140ms] starting:opacity-0",
} as const;

/** The marker on the worth scale slides one step (320 ms, spring). */
export const SLIDE = `transition-[translate] duration-[320ms] ${SPRING}`;

/** The moment's entrance, or its reduced form. */
export function enter(moment: keyof typeof ENTER, reducedMotion: boolean) {
  return reducedMotion ? ENTER.reduced : ENTER[moment];
}
