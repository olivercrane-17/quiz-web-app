"use client";

/**
 * The claim link inside an in-app browser (PRD §3.10.4, DESIGN §12.44):
 * "Playing inside WhatsApp? Open Knewt in your browser to keep your
 * streak." with the line on what moves (AC-SYN-07) and "Keep my streak".
 * Once the link is live: the two taps for the platform, "Open in Chrome"
 * on Android (an `intent://` link), and how long the link lasts. Never an
 * install, push or calendar pitch (AC-IAB-05).
 *
 * The stop screen's claim card and `/me/sync` (in an in-app browser) both
 * render it. Logs `claim_link_offer` once it shows.
 */
import { useEffect, useId, useRef } from "react";

import type { BrowserContextInfo } from "@/backend";
import { track } from "@/features/analytics/track";
import { announce } from "@/ui/announce";
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
  /** "Keep my streak" was first tapped (`offer_action` accept on the stop screen). */
  onAccept?: () => void;
  /** Shows "Not now" (the stop screen's card). */
  onDismiss?: () => void;
  /** The title's look: an offer card's, or a section heading on its page. */
  titleClassName?: string;
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

export function ClaimPanel({
  browser,
  onAccept,
  onDismiss,
  titleClassName = "font-display text-display-6",
  className,
}: ClaimPanelProps) {
  const { state, start } = useClaimLink();
  const titleId = useId();
  const stepsRef = useRef<HTMLHeadingElement>(null);
  const accepted = useRef(false);
  const appName = APP_NAMES[browser.app];

  useEffect(() => {
    track("claim_link_offer", { app: browser.app });
  }, [browser.app]);

  const live = state.phase === "live";
  useEffect(() => {
    // The button the player pressed is gone: the steps take focus.
    if (live) stepsRef.current?.focus();
  }, [live]);

  // What went wrong, or that the link ran out, goes to the status region.
  const message =
    state.phase === "error"
      ? errorText(state.error)
      : state.phase === "expired"
        ? COPY.expired
        : null;
  useEffect(() => {
    if (message !== null) announce(message);
  }, [message]);

  return (
    <section
      aria-labelledby={titleId}
      data-claim-panel={state.phase}
      className={cx("flex flex-col gap-3", className)}
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className={titleClassName}>
          {COPY.title(appName)}
        </h2>
        <p className="text-body">{COPY.body}</p>
        <p className="text-body-sm text-ink-2">
          {IDENTITY_CLIENT_COPY.whatMoves}
        </p>
      </div>

      {state.phase === "live" ? (
        <div className="flex flex-col gap-3" data-claim-steps="">
          <h3 ref={stepsRef} tabIndex={-1} className="text-label outline-none">
            {COPY.stepsTitle}
          </h3>
          <ol className="flex list-decimal flex-col gap-1 ps-6 text-body">
            {claimSteps(browser.platform).map((step) => (
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
              variant="secondary"
              busy={state.phase === "creating"}
              onClick={() => {
                if (!accepted.current) {
                  accepted.current = true;
                  onAccept?.();
                }
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
