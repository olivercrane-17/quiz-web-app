"use client";

/**
 * The stop screen's claim card (PRD §3.10.4, DESIGN §6.10, §12.44): the
 * claim link for this app, then the sync code below it as the fallback
 * (`in_app_first`, AC-SYN-05), all in the one offer card the stop screen
 * shows, with the offer card's icon tile. "Keep my streak" is its one
 * secondary action, beside "Not now"; the sync code's "Show my code" and
 * "Copy code" are text buttons, so nothing competes.
 */
import { useEffect, useId } from "react";

import { track } from "@/features/analytics/track";
import type { OfferCardProps } from "@/features/offers";
import { Card } from "@/ui/card";

import { ClaimPanel } from "../claim/claim-panel";
import { IDENTITY_CLIENT_COPY } from "../client-copy";
import { ExternalLinkIcon } from "../icons";
import { SyncCodePanel } from "../sync/sync-code-panel";

const COPY = IDENTITY_CLIENT_COPY.sync.fallback;

export function ClaimCard({ ctx, onAccept, onDismiss }: OfferCardProps) {
  const fallbackId = useId();

  useEffect(() => {
    track("sync_code_offer", { trigger: "in_app_first" });
  }, []);

  return (
    <Card data-offer-card="claim" className="flex flex-col gap-4">
      <ClaimPanel
        browser={ctx.browser}
        onAccept={onAccept}
        onDismiss={onDismiss}
        titleClassName="text-lg font-bold"
        icon={<ExternalLinkIcon />}
      />
      <section
        aria-labelledby={fallbackId}
        data-sync-fallback=""
        className="flex flex-col gap-2 border-t border-rule pt-4"
      >
        <h3 id={fallbackId} className="text-label">
          {COPY.title}
        </h3>
        <p className="text-body-sm text-ink-2">{COPY.body}</p>
        <SyncCodePanel
          trigger="in_app_first"
          showVariant="text"
          copyVariant="text"
        />
      </section>
    </Card>
  );
}
