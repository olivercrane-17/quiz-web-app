/**
 * When the stop screen offers the claim link and the sync code (PRD
 * §3.1.6 item 8, §3.10.2, §3.10.4; ARCHITECTURE §9.2). Pure: everything
 * comes from the `OfferContext` the stop screen builds (DLY-3), whose
 * `history` holds each offer's shown, dismissed and accepted dates.
 *
 * **Claim** (in-app browsers only, before the sync offer):
 * - Offered after the first finish seen inside an in-app browser.
 * - Taking it ("Keep my streak") ends the offers: the player has seen the
 *   two taps, with the sync code below them as the fallback.
 * - Otherwise it comes back once a week has passed since it last showed,
 *   three times in all.
 *
 * **Sync code** (its stop-screen triggers; each offers once):
 * - The third finished Daily in a system browser (`third_daily`), or the
 *   first in a detectable private window (`private_first`), PRD §3.10.5.
 *   Never on a first finish in an ordinary browser (AC-SYN-05).
 * - Right after the first in-app finish it rides inside the claim card,
 *   below the claim (`in_app_first`), so it never needs a card of its own
 *   there.
 * - The 10th finished Daily (`tenth_daily`), if the player never saved a
 *   code: a second showing, at least 12 hours after any earlier one, so a
 *   second look at the same stop screen doesn't repeat it.
 * - "Saved" is the offer's accepted date: its card reports accepted when
 *   the player taps Copy code or I've saved it, and the stop screen folds
 *   in a code saved at `/me/sync` (`syncCodeSavedAt`).
 * - The first server-saved quiz (EDT-3) and the iOS install pitch (CAL-1)
 *   offer it in their own places, through `SyncCodePanel`.
 *
 * A finish's ordinal is `earlierFinishes + 1`: the player's finished
 * Dailies before this one, archive plays included.
 */
import type { EventProps } from "@/analytics/dictionary";
import type { BrowserContextInfo } from "@/backend";
import type { EpochMs } from "@/engine/types";
import type { OfferContext, OfferRecord } from "@/features/offers";

export type SyncTrigger = EventProps<"sync_code_offer">["trigger"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The claim comes back after this long since it last showed... */
export const CLAIM_REOFFER_AFTER_MS = 7 * DAY;
/** ...this many times in all. */
export const CLAIM_MAX_SHOWINGS = 3;
/** The 10th-Daily showing waits this long after an earlier one. */
export const SYNC_REOFFER_SPACING_MS = 12 * HOUR;

/** This finish's place among the player's finished Dailies, from 1. */
export function finishOrdinal(ctx: OfferContext): number {
  return ctx.summary.facts.earlierFinishes + 1;
}

/**
 * True when the stop screen's browser context says private window: it
 * passes `detectBrowserContext()`'s result, whose `privateWindow` rides
 * along beside the context, app and platform.
 */
export function isPrivateWindow(browser: BrowserContextInfo): boolean {
  return (
    (browser as BrowserContextInfo & { privateWindow?: unknown })
      .privateWindow === true
  );
}

function accepted(record: OfferRecord | undefined): boolean {
  return (record?.acceptedAt ?? null) !== null;
}

function shownSince(
  record: OfferRecord | undefined,
  now: EpochMs,
  spacingMs: number,
): boolean {
  const last = record?.lastShownAt ?? null;
  return last !== null && now - last < spacingMs;
}

/** The sync code's trigger for this finish, or null when none fires. */
export function syncTriggerFor(ctx: OfferContext): SyncTrigger | null {
  const ordinal = finishOrdinal(ctx);
  const inApp = ctx.browser.context === "in_app";
  if (!inApp && ordinal === 1 && isPrivateWindow(ctx.browser)) {
    return "private_first";
  }
  if (!inApp && ordinal === 3) return "third_daily";
  if (ordinal === 10) return "tenth_daily";
  return null;
}

/** The sync offer's rule (above). */
export function syncOfferEligible(ctx: OfferContext): boolean {
  const record = ctx.history.sync;
  if (accepted(record)) return false;
  const trigger = syncTriggerFor(ctx);
  if (trigger === null) return false;
  const shown = record?.shownCount ?? 0;
  if (trigger === "tenth_daily") {
    return shown < 2 && !shownSince(record, ctx.now, SYNC_REOFFER_SPACING_MS);
  }
  return shown === 0;
}

/** The claim offer's rule (above). */
export function claimOfferEligible(ctx: OfferContext): boolean {
  if (ctx.browser.context !== "in_app") return false;
  const record = ctx.history.claim;
  if (accepted(record)) return false;
  const shown = record?.shownCount ?? 0;
  if (shown === 0) return true;
  return (
    shown < CLAIM_MAX_SHOWINGS &&
    !shownSince(record, ctx.now, CLAIM_REOFFER_AFTER_MS)
  );
}
