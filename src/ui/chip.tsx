/**
 * A chip (DESIGN §6.14 and the prototype): a small label with a word, and
 * an icon when it helps. A label, not a control, so it is a flat mark: a
 * wash with a 6 px corner, and no border, no ledge and no pointer (D11;
 * RITE round 1 R1-27, and round 2 R2-06, where round 1's hairline tags
 * still read as buttons). Nothing about it invites a tap.
 *
 * - `default`: the category chip under "A person", and Today's round chips.
 * - `sunken`: the same wash, for hint chips ("Within 5% is a bullseye").
 * - `correct`: the band chip ("Bullseye") on the correct tint, always
 *   beside its word.
 * - `accent`: a round count badge ("2 challenges waiting").
 * - `beta`: the "Beta" label, outlined in ink-2, never orange (DESIGN §6.14).
 *
 * A chip that is a link or a button (`<Link className={chipClasses({
 * interactive: true })}>`) gets the outlined pill of a control instead,
 * hover included, with a 44 px hit area.
 */
import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

export type ChipTone = "default" | "sunken" | "correct" | "accent" | "beta";

export function chipClasses({
  interactive = false,
  className,
}: { interactive?: boolean; className?: string } = {}): string {
  return cx("kn-chip", interactive && "kn-hit", className);
}

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  /** A decorative icon before the word, such as `<TargetIcon size={16} />`. */
  icon?: ReactNode;
  children: ReactNode;
}

export function Chip({
  tone = "default",
  icon,
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span data-tone={tone} className={chipClasses({ className })} {...rest}>
      {icon}
      {children}
    </span>
  );
}
