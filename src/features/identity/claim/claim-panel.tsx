"use client";

/**
 * The claim link inside an in-app browser (PRD §3.10.4, DESIGN §12.44):
 * "Playing inside WhatsApp? Open Knewt in your browser to keep your
 * streak." with the line on what moves (AC-SYN-07) and "Keep my streak".
 * Once the link is live: the two taps for that app, "Open in Chrome" on
 * Android (an `intent://` link), and how long the link lasts. Never an
 * install, push or calendar pitch (AC-IAB-05).
 *
 * The stop screen's claim card and `/me/sync` (in an in-app browser) both
 * render it. Logs `claim_link_offer` once it shows.
 *
 * - The offer counts as taken (`onAccept`) once a link is live, not on the
 *   tap: a tap that couldn't make one (offline, a limit) leaves the offer
 *   free to come back on a later finish.
 * - What went wrong, and that the link ran out, go to the status region
 *   and stay there through the address change the expiry makes; when the
 *   steps give way to Keep my streak, it takes the focus they held.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";

import type { BrowserContextInfo } from "@/backend";
import { track } from "@/features/analytics/track";
import { announce, withdrawAnnouncement } from "@/ui/announce";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { cx } from "@/ui/cx";

import { APP_NAMES, IDENTITY_CLIENT_COPY } from "../client-copy";
import type { ScreenError } from "../errors";
import { ExternalLinkIcon } from "../icons";
import { chromeIntentUrl, claimSteps } from "./steps";
import { useClaimLink } from "./use-claim-link";

const COPY = IDENTITY_CLIENT_COPY.claim;

export interface ClaimPanelProps {
  browser: BrowserContextInfo;
  /** A link went live: the offer was taken (`offer_action` accept on the stop screen). */
  onAccept?: () => void;
  /** Shows "Not now" (the stop screen's card). */
  onDismiss?: () => void;
  /** The title's look: an offer card's, or a section heading on its page. */
  titleClassName?: string;
  /** A decorative tile before the title, as an offer card has (DESIGN §6.10). */
  icon?: ReactNode;
  /** Leaves out the line on what moves, for a page that already says it (`/me/sync`). */
  hideWhatMoves?: boolean;
  className?: string;
}

function errorText(error: ScreenError): string {
  switch (error) {
    case "offline":
      return COPY.errors.offline;
    case "rate_limited":
      return COPY.errors.rateLimited;
    case "unavailable":
      return IDENTITY_CLIENT_COPY.unavailable;
    default:
      return COPY.errors.generic;
  }
}

/** True when focus sits on nothing in particular: the page, its `<main>`, or what just left. */
function focusDropped(within: HTMLElement | null): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    active.tagName === "MAIN" ||
    (within?.contains(active) ?? false)
  );
}

export function ClaimPanel({
  browser,
  onAccept,
  onDismiss,
  titleClassName = "font-display text-display-6",
  icon,
  hideWhatMoves = false,
  className,
}: ClaimPanelProps) {
  const { state, start } = useClaimLink();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLHeadingElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const accepted = useRef(false);
  const appName = APP_NAMES[browser.app];
  const { phase } = state;

  useEffect(() => {
    track("claim_link_offer", { app: browser.app });
  }, [browser.app]);

  useEffect(() => {
    if (phase !== "live" || accepted.current) return;
    accepted.current = true;
    onAccept?.();
  }, [phase, onAccept]);

  useEffect(() => {
    if (phase === "live") {
      // The button the player pressed is gone: the steps take focus.
      stepsRef.current?.focus();
    } else if (phase === "expired" && focusDropped(panelRef.current)) {
      // The steps went with the focus they held: Keep my streak takes it.
      actionRef.current?.focus();
    }
  }, [phase]);

  // What went wrong, or that the link ran out, goes to the status region.
  // The expiry puts the address back, and the shell clears what a page
  // said when its address changes, so the line is kept until it no longer
  // applies.
  const message =
    state.phase === "error"
      ? errorText(state.error)
      : state.phase === "expired"
        ? COPY.expired
        : null;
  useEffect(() => {
    if (message === null) return;
    const node = announce(message, "polite", { keepOnRouteChange: true });
    return () => {
      withdrawAnnouncement(node);
    };
  }, [message]);

  return (
    <section
      ref={panelRef}
      aria-labelledby={titleId}
      data-claim-panel={state.phase}
      className={cx("flex flex-col gap-3", className)}
    >
      <div className="flex items-start gap-3">
        {icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="inline-grid size-10 shrink-0 place-items-center rounded-xl bg-muted"
            data-claim-icon=""
          >
            {icon}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className={titleClassName}>
            {COPY.title(appName)}
          </h2>
          <p className="text-body">{COPY.body}</p>
          {hideWhatMoves ? null : (
            <p className="text-body-sm text-ink-2">
              {IDENTITY_CLIENT_COPY.whatMoves}
            </p>
          )}
        </div>
      </div>

      {state.phase === "live" ? (
        <div className="flex flex-col gap-3" data-claim-steps="">
          <h3 ref={stepsRef} tabIndex={-1} className="text-label outline-none">
            {COPY.stepsTitle}
          </h3>
          <ol className="flex list-decimal flex-col gap-1 ps-6 text-body">
            {claimSteps(browser.app, browser.platform).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {browser.platform === "android" ? (
            <a
              href={chromeIntentUrl(window.location, state.path)}
              className={buttonClasses({
                variant: "secondary",
                className: "self-start",
              })}
            >
              <ExternalLinkIcon size={18} />
              {COPY.openInChrome}
            </a>
          ) : null}
          <p className="text-meta text-ink-2">{COPY.lasts}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {message === null ? null : (
            <p
              className={
                state.phase === "error"
                  ? "text-body-sm text-incorrect-text"
                  : "text-body-sm text-ink-2"
              }
              data-claim-message=""
            >
              {message}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              ref={actionRef}
              variant="secondary"
              busy={state.phase === "creating"}
              onClick={() => {
                void start();
              }}
            >
              {COPY.action}
            </Button>
            {onDismiss === undefined ? null : (
              <Button variant="text" onClick={onDismiss}>
                {COPY.notNow}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
