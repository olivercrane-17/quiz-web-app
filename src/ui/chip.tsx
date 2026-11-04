/**
 * A chip (DESIGN §6.14 and the prototype): a small pill with a word, and an
 * icon when it helps.
 *
 * - `default`: outlined on surface; the category chip beside "A person".
 * - `sunken`: a well; hint chips ("Within 5% is a bullseye").
 * - `correct`: the band chip ("Bullseye"), always beside its word.
 * - `accent`: a count badge ("2 challenges waiting").
 * - `beta`: the "Beta" label, outlined in ink-2 and never orange.
 *
 * A chip that is a link or a button keeps a 44 px hit area through
 * `chipClasses({ interactive: true })`.
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
