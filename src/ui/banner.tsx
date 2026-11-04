/**
 * A banner under the top bar (DESIGN §6.10, PRD §3.15.2): the incident and
 * offline notices. Neutral (`sunken`, the info icon) for degraded and
 * offline, neutral with the clock for maintenance; `caution`, with its
 * edge and the alert icon, for an outage and unreachable. Degraded and
 * maintenance banners can be dismissed, which needs `onDismiss` (and so a
 * client component as the caller).
 *
 * A banner known at load renders in place; one that appears later passes
 * `overlay` and slides in over the page from under the header, so nothing
 * shifts (AC-INC-05). Put it inside the polite live region of INC-1's slot,
 * which exists before any banner does, so a late one is announced.
 */
import type { ReactNode } from "react";

import { cx } from "./cx";
import {
  AlertIcon,
  ClockIcon,
  CrossIcon,
  InfoIcon,
  OfflineIcon,
} from "./icons";

export type BannerTone = "neutral" | "caution";
export type BannerIcon = "info" | "alert" | "offline" | "clock";

const ICONS = {
  info: InfoIcon,
  alert: AlertIcon,
  offline: OfflineIcon,
  clock: ClockIcon,
} as const;

export interface BannerProps {
  tone?: BannerTone;
  /** By default the info icon for neutral and the alert icon for caution. */
  icon?: BannerIcon;
  /** A bold lead-in: "You're offline." */
  title?: ReactNode;
  /** The rest of the line: what works and what doesn't. */
  children?: ReactNode;
  /** One action after the text, such as a "Try again" text button. */
  action?: ReactNode;
  /** Shows a 44 px close button that calls this. */
  onDismiss?: () => void;
  /** The close button's name; needed with `onDismiss`. */
  dismissLabel?: string;
  /** A banner that arrives after load: overlays the page under the header. */
  overlay?: boolean;
  className?: string;
}

export function Banner({
  tone = "neutral",
  icon = tone === "caution" ? "alert" : "info",
  title,
  children,
  action,
  onDismiss,
  dismissLabel,
  overlay = false,
  className,
}: BannerProps) {
  const Icon = ICONS[icon];
  return (
    <div
      data-banner=""
      data-tone={tone}
      data-overlay={overlay ? "" : undefined}
      className={cx("kn-banner", className)}
    >
      <Icon size={20} />
      <p className="kn-banner-text">
        {title === undefined ? null : <strong>{title}</strong>}
        {title !== undefined && children !== undefined ? " " : null}
        {children}
      </p>
      {action}
      {onDismiss === undefined ? null : (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="kn-btn kn-btn-icon"
        >
          <CrossIcon size={20} />
        </button>
      )}
    </div>
  );
}
