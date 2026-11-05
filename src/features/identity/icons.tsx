/**
 * The identity screens' icons (DESIGN §5): Lucide shapes the design
 * system doesn't carry yet, drawn on its rules (24 px grid, round caps and
 * joins, the stroke `iconStroke` gives each size). Lucide is ISC licensed;
 * its notice is src/ui/LICENSE-lucide.txt. Decorative: the words beside an
 * icon carry its meaning.
 */
import type { ReactNode } from "react";

import { cx } from "@/ui/cx";
import { iconStroke, type IconProps } from "@/ui/icons";

function Icon({
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
      strokeWidth={iconStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

/** Keep it private (`lock`). */
export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Icon>
  );
}

/** The sync code (`key-round`). */
export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </Icon>
  );
}

/** Open in your browser (`external-link`). */
export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icon>
  );
}

/** Back (`arrow-left`). */
export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </Icon>
  );
}
