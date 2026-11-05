"use client";

/**
 * The claim link in the system browser, `/claim/<token>` (PRD §3.10.4,
 * §5.14; DESIGN §12.27): a centred card, "Continue as Plucky Otter?",
 * "Streak 1 · Daily No. 42 done", the primary "Continue" and the text
 * button "This isn't me".
 *
 * - Continue mints a new secret here and redeems the claim, which adds it
 *   as a credential of the same player (the in-app copy keeps working);
 *   the browser stores the identity, posts the backup cookie and lands on
 *   Today: "You're all set. Your streak is safe in this browser."
 * - A browser with progress of its own confirms first (§9.2).
 * - A used, expired or unknown link says so, with "Enter a sync code".
 * - Opened in the browser that made it, it says the profile is already
 *   here and never redeems its own token (§9.5).
 *
 * The token comes from the address through `usePathParam` (§10.2 rule 8):
 * Next reuses this one shell for every token, so the flow is keyed by it.
 * Logs `claim_link_used` with how the link fared.
 */
import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore } from "react";

import { getBackend } from "@/backend";
import {
  parseClaimToken,
  type ClaimPreview,
  type ClaimToken,
} from "@/engine/types";
import { track } from "@/features/analytics/track";
import { usePathParam } from "@/features/shell/client";
import { detectBrowserContext } from "@/platform/browser-context";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";
import { Loading, SkeletonText } from "@/ui/skeleton";

import { bootClient } from "../boot";
import { IDENTITY_CLIENT_COPY } from "../client-copy";
import { ConfirmReplace, useDeviceStreak } from "../confirm-replace";
import { deviceHasProgress, readDeviceIdentity } from "../device";
import { screenError, type ScreenError } from "../errors";
import { CLAIM_PATTERN, RESTORE_HREF } from "../links";
import { mintSecret } from "../mint";
import { finishRestore } from "../restore-flow";
import { isOwnClaim } from "../sync-store";

const COPY = IDENTITY_CLIENT_COPY;

type ClaimView =
  | { phase: "loading" }
  /** Used, expired, unknown or malformed: the expired copy (PRD §3.10.4). */
  | { phase: "expired" }
  | { phase: "same_device" }
  | { phase: "preview"; preview: ClaimPreview; busy: boolean }
  | { phase: "error"; error: ScreenError; preview: ClaimPreview | null };

type LinkResult = "ok" | "expired" | "used";

async function logUse(result: LinkResult): Promise<void> {
  const { app } = await detectBrowserContext();
  track("claim_link_used", { app, result });
}

/** `expired` with `current: { used }` tells a used link from an old one. */
function linkResult(current: unknown): LinkResult {
  return (current as { used?: unknown } | null)?.used === true
    ? "used"
    : "expired";
}

function errorText(error: ScreenError): string {
  switch (error) {
    case "offline":
      return COPY.claimPage.offline;
    case "rate_limited":
      return COPY.claimPage.rateLimited;
    case "unavailable":
      return COPY.unavailable;
    default:
      return COPY.claimPage.generic;
  }
}

function displayName(preview: ClaimPreview): string {
  return preview.nickname ?? preview.friendlyName;
}

/**
 * The claim for one token, or the expired copy without one. `ClaimScreen`
 * keys it by the address's token; component tests render it directly.
 */
export function ClaimFlow({ token }: { token: ClaimToken | null }) {
  const [view, setView] = useState<ClaimView>(
    token === null ? { phase: "expired" } : { phase: "loading" },
  );
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const streak = useDeviceStreak(hasProgress);
  const titleId = useId();

  useEffect(() => {
    if (token === null) return;
    let live = true;
    void (async () => {
      await bootClient();
      if (!live) return;
      const device = readDeviceIdentity();
      if (device !== null && isOwnClaim(device.playerId, token)) {
        setView({ phase: "same_device" });
        return;
      }
      setHasProgress(deviceHasProgress());
      const backend = await getBackend();
      const result = await backend.identity.peekClaim(token);
      if (!live) return;
      if (result.ok) {
        setView({ phase: "preview", preview: result.value, busy: false });
        return;
      }
      const { code, current } = result.error;
      if (code === "expired" || code === "not_found") {
        setView({ phase: "expired" });
        void logUse(code === "expired" ? linkResult(current) : "expired");
        return;
      }
      setView({
        phase: "error",
        error: screenError(result.error),
        preview: null,
      });
    })();
    return () => {
      live = false;
    };
  }, [token, attempt]);

  const redeem = async (preview: ClaimPreview) => {
    if (token === null) return;
    setView({ phase: "preview", preview, busy: true });
    const secret = mintSecret();
    const backend = await getBackend();
    const result = await backend.identity.redeemClaim(token, secret);
    if (result.ok) {
      // Logged before Today loads, which ends this page.
      await logUse("ok");
      const done = await finishRestore({
        restored: result.value,
        secret,
        source: "claim",
      });
      if (!done) setView({ phase: "error", error: "generic", preview });
      return;
    }
    const { code, current } = result.error;
    if (code === "expired" || code === "not_found") {
      setView({ phase: "expired" });
      announce(COPY.claimPage.expired);
      void logUse(code === "expired" ? linkResult(current) : "expired");
      return;
    }
    const error = screenError(result.error);
    setView({ phase: "error", error, preview });
    announce(errorText(error));
  };

  if (view.phase === "loading") {
    return (
      <Loading label={COPY.claimPage.loading}>
        <SkeletonText lines={3} />
      </Loading>
    );
  }

  if (view.phase === "expired") {
    return (
      <Card data-claim-state="expired" className="flex flex-col gap-4">
        <p className="text-body">{COPY.claimPage.expired}</p>
        <Link
          href={RESTORE_HREF}
          className={buttonClasses({
            variant: "secondary",
            className: "self-start",
          })}
        >
          {COPY.claimPage.enterCode}
        </Link>
      </Card>
    );
  }

  if (view.phase === "same_device") {
    return (
      <Card data-claim-state="same-device" className="flex flex-col gap-4">
        <p className="text-body">{COPY.claimPage.sameDevice}</p>
        <Link
          href="/"
          className={buttonClasses({
            variant: "secondary",
            className: "self-start",
          })}
        >
          {COPY.goToToday}
        </Link>
      </Card>
    );
  }

  const preview = view.preview;
  if (preview === null) {
    return (
      <Card data-claim-state="error" className="flex flex-col gap-4">
        <p className="text-body">
          {errorText(view.phase === "error" ? view.error : "generic")}
        </p>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setView({ phase: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          {COPY.tryAgain}
        </Button>
      </Card>
    );
  }

  const detail = COPY.claimPage.detail(
    preview.streak,
    preview.lastDaily?.dailyNumber ?? null,
  );
  const busy = view.phase === "preview" && view.busy;
  return (
    <Card
      as="section"
      aria-labelledby={titleId}
      data-claim-state={view.phase}
      className="flex flex-col gap-4 text-center"
    >
      <h2 id={titleId} className="font-display text-display-4">
        {COPY.claimPage.confirmTitle(displayName(preview))}
      </h2>
      {detail === "" ? null : (
        <p className="text-lead" data-claim-detail="">
          {detail}
        </p>
      )}
      <p className="text-body-sm text-ink-2">{COPY.whatMoves}</p>
      {view.phase === "error" ? (
        <p className="text-body-sm text-incorrect-text">
          {errorText(view.error)}
        </p>
      ) : null}
      <div className="flex flex-col items-center gap-2">
        <Button
          variant="primary"
          block
          busy={busy}
          onClick={() => {
            if (hasProgress) {
              setConfirming(true);
            } else {
              void redeem(preview);
            }
          }}
        >
          {COPY.claimPage.continue}
        </Button>
        <Link href="/" className={buttonClasses({ variant: "text" })}>
          {COPY.claimPage.notMe}
        </Link>
      </div>
      <ConfirmReplace
        open={confirming}
        streak={streak}
        via="link"
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setConfirming(false);
          void redeem(preview);
        }}
      />
    </Card>
  );
}

const noSubscription = () => () => {};

export function ClaimScreen() {
  const param = usePathParam(CLAIM_PATTERN);
  // The param is null while the page hydrates; afterwards null means no token.
  const onClient = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!onClient) {
    return (
      <Loading label={COPY.claimPage.loading}>
        <SkeletonText lines={3} />
      </Loading>
    );
  }
  const token = param === null ? null : parseClaimToken(param);
  return <ClaimFlow key={param ?? ""} token={token} />;
}
