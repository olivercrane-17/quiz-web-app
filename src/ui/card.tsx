/**
 * Raised surfaces (DESIGN §4 elevation, §6.14).
 *
 * `Card` has three looks:
 * - `default`: e1, a hairline border with a 3 px ledge and a soft shadow;
 *   the Practice card, rows, offer cards.
 * - `sunken`: a well with no ledge; the offline Daily card, code wells.
 * - `ticket`: e2, the eft fill with its ledge, for a ticket-coloured block
 *   without the tear (the share card's stub, small landings).
 *
 * `Ticket` is the system object DESIGN builds the Daily, the challenge
 * landing and the host join panel from: an eft body, punched notches with
 * a dashed tear line, and a stub that holds the meta line and the button.
 * Inside either ticket look, focus rings take `focus-on-ticket`.
 *
 * Both render a plain element (a `section` when it holds a titled region),
 * so the caller decides the landmark and heading. The looks live in
 * `ui.css`, keyed by `data-tone`.
 */
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cx } from "./cx";

export type CardTone = "default" | "sunken" | "ticket";

type CardElement = "div" | "section" | "article" | "aside" | "li";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement;
  tone?: CardTone;
  /** 16 px of padding, 20 px from 640 px; false for edge-to-edge content. */
  padded?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

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
      className={cx("kn-card", padded && "kn-card-pad", className)}
      {...rest}
    >
      {children}
    </Element>
  );
}

export interface TicketProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children"
> {
  as?: CardElement;
  /** The top part: kicker, title, explainer, answer-type cards. */
  children: ReactNode;
  /** Below the tear: the meta line and the button. */
  stub?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export function Ticket({
  as = "section",
  children,
  stub,
  className,
  ref,
  ...rest
}: TicketProps) {
  const Element = as as "div";
  return (
    <Element
      ref={ref as Ref<HTMLDivElement>}
      data-ticket=""
      className={cx("kn-ticket", className)}
      {...rest}
    >
      <div className="kn-ticket-body">{children}</div>
      {stub === undefined ? null : <div className="kn-ticket-stub">{stub}</div>}
    </Element>
  );
}
