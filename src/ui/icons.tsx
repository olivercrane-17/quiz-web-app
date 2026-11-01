/**
 * The few greybox glyphs the primitives need to show a state without colour
 * (DESIGN §5, §11). They are decorative: the words beside them carry the
 * meaning, so every icon is hidden from assistive technology. DS-1 swaps
 * them for the Lucide set.
 */
import type { ReactNode } from "react";

import { cx } from "./cx";

interface IconProps {
  className?: string;
  /** Pixels; 20 by default. */
  size?: number;
}

function Glyph({
  className,
  size = 20,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

/** Correct, solved. */
export function CheckIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 12.5 9.5 17 19 7.5" />
    </Glyph>
  );
}

/** Wrong, missed, close. */
export function CrossIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Glyph>
  );
}

/** A voided (withdrawn) round. */
export function DashIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6 12h12" />
    </Glyph>
  );
}

/** The busy state of a button (DESIGN §6.1): 16 px after the label. Still under reduced motion. */
export function Spinner({ className, size = 16 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      className={cx("shrink-0 motion-safe:animate-spin", className)}
    >
      <circle cx="12" cy="12" r="9" opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}
