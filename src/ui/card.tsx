/**
 * A raised surface (DESIGN §4 elevation, §6.14). One component for the
 * three looks the screens use:
 *
 * - `default`: e1, a hairline border with a ledge; the Practice card, rows,
 *   offer cards.
 * - `sunken`: no ledge; the offline Daily card, code wells.
 * - `ticket`: e2; the Daily ticket, the share card, the join ticket.
 *
 * It renders a plain element (a `section` when it holds a titled region),
 * so the caller decides the landmark and heading. `data-tone` is the hook
 * for DS-1's styles. Greybox values.
 */
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cx } from "./cx";

export type CardTone = "default" | "sunken" | "ticket";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "aside" | "li";
  tone?: CardTone;
  /** 12 to 20 px of padding by default; false for edge-to-edge content. */
  padded?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

const TONES: Record<CardTone, string> = {
  default:
    "border border-foreground/25 bg-background shadow-[0_3px_0_0] shadow-foreground/15",
  sunken: "border border-foreground/15 bg-muted",
  ticket:
    "border-2 border-foreground bg-background shadow-[0_4px_0_0] shadow-foreground/40",
};

export function Card({
  as = "div",
  tone = "default",
  padded = true,
  className,
  children,
  ref,
  ...rest
}: CardProps) {
  // Every allowed tag takes the same attributes; typing it as one keeps JSX simple.
  const Element = as as "div";
  return (
    <Element
      ref={ref as Ref<HTMLDivElement>}
      data-tone={tone}
      className={cx(
        "rounded-3xl text-foreground",
        TONES[tone],
        padded && "p-4 sm:p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </Element>
  );
}
