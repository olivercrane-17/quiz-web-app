/**
 * A chip (DESIGN §6.14 and the prototype): a small label with a word, and
 * an icon when it helps. A label, not a control, so it is drawn as a flat
 * printed tag with a 6 px corner (RITE round 1, R1-27): nothing about it
 * invites a tap.
 *
 * - `default`: a hairline tag; the category chip beside "A person".
 * - `sunken`: a wash; hint chips ("Within 5% is a bullseye").
 * - `correct`: the band chip ("Bullseye"), always beside its word.
 * - `accent`: a round count badge ("2 challenges waiting").
 * - `beta`: the "Beta" label, outlined in ink-2 and never orange.
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
