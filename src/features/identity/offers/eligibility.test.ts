/**
 * When the stop screen offers the claim link and the sync code (PRD §3.1.6
 * item 8, §3.10.2, §3.10.4, ARCHITECTURE §9.2), through the registry's
 * pickOffer so the priority holds too.
 */
import { describe, expect, it, vi } from "vitest";

import type { EpochMs } from "@/engine/types";
import type { DetectedContext } from "@/platform/browser-context";
import {
  OFFER_PROVIDERS,
  pickOffer,
  type OfferContext,
  type OfferRecord,
} from "@/features/offers";

import { BROWSER, WHATSAPP, offerContext } from "../__fixtures__/device";
import {
  CLAIM_MAX_SHOWINGS,
  CLAIM_REOFFER_AFTER_MS,
  SYNC_REOFFER_SPACING_MS,
  claimOfferEligible,
  syncOfferEligible,
  syncTriggerFor,
} from "./eligibility";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 11, 1, 9) as EpochMs;

function record(overrides: Partial<OfferRecord> = {}): OfferRecord {
  return {
    shownCount: 1,
    lastShownAt: (NOW - 30 * 24 * HOUR) as EpochMs,
    dismissCount: 0,
    lastDismissedAt: null,
    acceptedAt: null,
    ...overrides,
  };
}

/** The finish whose stop screen this is: the `ordinal`th finished Daily. */
function finish(
  ordinal: number,
  overrides: Partial<OfferContext> = {},
): OfferContext {
  return offerContext({ earlierFinishes: ordinal - 1, now: NOW, ...overrides });
}

const PRIVATE_BROWSER: DetectedContext = { ...BROWSER, privateWindow: true };

describe("the sync offer's triggers (§9.2)", () => {
  it("AC-SYN-05 in a system browser the first offer appears on the third finished Daily, not before", () => {
    expect(pickOffer(finish(1))).toBeNull();
    expect(pickOffer(finish(2))).toBeNull();
    expect(pickOffer(finish(3))?.id).toBe("sync");
    expect(syncTriggerFor(finish(3))).toBe("third_daily");
    // Shown once, it doesn't come back on the fourth, dismissed or not.
    expect(
      pickOffer(finish(4, { history: { sync: record() } }))?.id,
    ).toBeUndefined();
    expect(
      syncOfferEligible(
        finish(3, { history: { sync: record({ dismissCount: 1 }) } }),
      ),
    ).toBe(false);
  });

  it("AC-SYN-05 inside WhatsApp the claim card is the offer after the first finish, and the sync code rides inside it", () => {
    const ctx = finish(1, { browser: WHATSAPP });
    expect(pickOffer(ctx)?.id).toBe("claim");
    // The code has no card of its own there: it sits below the claim.
    expect(syncOfferEligible(ctx)).toBe(false);
    expect(syncTriggerFor(ctx)).toBeNull();
    // Nor at the third finish in the app: in_app_first was its trigger.
    expect(
      syncOfferEligible(
        finish(3, { browser: WHATSAPP, history: { claim: record() } }),
      ),
    ).toBe(false);
  });

  it("offers it on the first finish in a detectable private window", () => {
    const ctx = finish(1, { browser: PRIVATE_BROWSER });
    expect(syncTriggerFor(ctx)).toBe("private_first");
    expect(pickOffer(ctx)?.id).toBe("sync");
    // An undecided private-window check changes nothing.
    const undecided: DetectedContext = { ...BROWSER, privateWindow: null };
    expect(pickOffer(finish(1, { browser: undecided }))).toBeNull();
    // The private offer was the first offer: the third doesn't repeat it.
    expect(
      syncOfferEligible(
        finish(3, { browser: PRIVATE_BROWSER, history: { sync: record() } }),
      ),
    ).toBe(false);
  });

  it("offers it again on the 10th finished Daily if the player never saved a code", () => {
    expect(syncTriggerFor(finish(10))).toBe("tenth_daily");
    expect(syncOfferEligible(finish(10, { history: { sync: record() } }))).toBe(
      true,
    );
    // Never shown before (another offer took the third's place): still offered.
    expect(syncOfferEligible(finish(10))).toBe(true);
    // In an in-app browser too, once the claim isn't due.
    expect(
      pickOffer(
        finish(10, {
          browser: WHATSAPP,
          history: {
            claim: record({ lastShownAt: (NOW - HOUR) as EpochMs }),
            sync: record(),
          },
        }),
      )?.id,
    ).toBe("sync");
    expect(syncOfferEligible(finish(9))).toBe(false);
    expect(syncOfferEligible(finish(11))).toBe(false);
  });

  it("never offers it again once a code was saved", () => {
    const saved = record({ acceptedAt: (NOW - HOUR) as EpochMs });
    expect(syncOfferEligible(finish(3, { history: { sync: saved } }))).toBe(
      false,
    );
    expect(syncOfferEligible(finish(10, { history: { sync: saved } }))).toBe(
      false,
    );
  });

  it("doesn't repeat the 10th-Daily offer on a second look at the same stop screen", () => {
    const justShown = record({
      shownCount: 2,
      lastShownAt: (NOW - HOUR) as EpochMs,
    });
    expect(
      syncOfferEligible(finish(10, { history: { sync: justShown } })),
    ).toBe(false);
    const shownOnceRecently = record({
      shownCount: 1,
      lastShownAt: (NOW - SYNC_REOFFER_SPACING_MS + 1) as EpochMs,
    });
    expect(
      syncOfferEligible(finish(10, { history: { sync: shownOnceRecently } })),
    ).toBe(false);
  });
});

describe("the claim offer (PRD §3.10.4)", () => {
  it("AC-IAB-03 after the first in-app finish, the claim card is the offer shown", () => {
    for (const app of ["whatsapp", "instagram", "tiktok", "other"] as const) {
      const ctx = finish(1, { browser: { ...WHATSAPP, app } });
      expect(pickOffer(ctx)?.id, app).toBe("claim");
    }
    // Only inside an in-app browser.
    expect(claimOfferEligible(finish(1))).toBe(false);
    expect(
      claimOfferEligible(
        finish(1, { browser: { ...BROWSER, context: "installed" } }),
      ),
    ).toBe(false);
  });

  it("is offered at the first in-app finish whatever came before in another browser", () => {
    expect(claimOfferEligible(finish(5, { browser: WHATSAPP }))).toBe(true);
  });

  it("ends once taken, and comes back a week later at most three times in all", () => {
    const taken = record({ acceptedAt: (NOW - HOUR) as EpochMs });
    expect(
      claimOfferEligible(
        finish(2, { browser: WHATSAPP, history: { claim: taken } }),
      ),
    ).toBe(false);
    const lastWeek = record({
      lastShownAt: (NOW - CLAIM_REOFFER_AFTER_MS) as EpochMs,
    });
    expect(
      claimOfferEligible(
        finish(2, { browser: WHATSAPP, history: { claim: lastWeek } }),
      ),
    ).toBe(true);
    const yesterday = record({ lastShownAt: (NOW - 24 * HOUR) as EpochMs });
    expect(
      claimOfferEligible(
        finish(2, { browser: WHATSAPP, history: { claim: yesterday } }),
      ),
    ).toBe(false);
    const spent = record({ shownCount: CLAIM_MAX_SHOWINGS });
    expect(
      claimOfferEligible(
        finish(2, { browser: WHATSAPP, history: { claim: spent } }),
      ),
    ).toBe(false);
  });

  it("gives way to the repair card, which comes first", () => {
    const repair = OFFER_PROVIDERS.find((provider) => provider.id === "repair");
    if (repair === undefined) throw new Error("no repair provider");
    vi.spyOn(repair, "isEligible").mockReturnValue(true);
    expect(pickOffer(finish(1, { browser: WHATSAPP }))?.id).toBe("repair");
  });
});
