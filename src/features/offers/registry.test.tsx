import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AttemptId } from "@/engine/types";
import { renderWithUser } from "@/test/render";

import { OfferCard } from "./offer-card";
import { OFFER_PROVIDERS, pickOffer } from "./registry";
import { OFFER_IDS, type OfferContext, type OfferProvider } from "./types";

const ctx: OfferContext = {
  summary: {
    attemptId: "a1" as AttemptId,
    points: 9,
    maxPoints: 12,
    encore: null,
    totalMs: 180_000,
    ranked: true,
    streak: null,
    facts: {
      perfect: false,
      newBestScore: false,
      firstFinish: false,
      milestone: null,
      freezeEarned: false,
      hardestSolvedOnClue1: false,
      bullseye: false,
      earlierFinishes: 3,
    },
  },
  streak: null,
  ageBand: null,
  browser: { context: "browser", app: "none", platform: "desktop" },
  groupCount: null,
  history: {},
  now: 0,
};

describe("offer registry", () => {
  it("lists one provider per offer, in PRD priority", () => {
    expect(OFFER_PROVIDERS.map((provider) => provider.id)).toEqual(OFFER_IDS);
    expect(OFFER_IDS).toEqual([
      "repair",
      "claim",
      "sync",
      "install",
      "calendar",
      "group",
    ]);
  });

  it("shows nothing while every provider is a stub", () => {
    expect(pickOffer(ctx)).toBeNull();
  });

  it("would pick the first eligible provider", () => {
    const eligible = (id: OfferProvider["id"]) =>
      OFFER_PROVIDERS.find((provider) => provider.id === id);
    const sync = eligible("sync");
    const group = eligible("group");
    if (sync === undefined || group === undefined) throw new Error("missing");
    vi.spyOn(sync, "isEligible").mockReturnValue(true);
    vi.spyOn(group, "isEligible").mockReturnValue(true);
    expect(pickOffer(ctx)?.id).toBe("sync");
  });
});

describe("OfferCard", () => {
  it("is a titled region with a secondary action and Not now", async () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    const { user } = renderWithUser(
      <OfferCard
        title="Start a Group for your chat"
        body="Compare Daily scores with friends."
        actionLabel="Start a Group"
        onAccept={onAccept}
        onDismiss={onDismiss}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Start a Group for your chat" }),
    ).toBeInTheDocument();
    const action = screen.getByRole("button", { name: "Start a Group" });
    // Never primary: "Done for today" is the stop screen's only primary (AC-DLY-14).
    expect(action).toHaveAttribute("data-variant", "secondary");
    await user.click(action);
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
