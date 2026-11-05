"use client";

/**
 * The stop screen's sync offer (PRD §3.10.2, §3.10.5, DESIGN §6.10): "Keep
 * your streak safe" (or, in a private window, "Private window?") with the
 * line on what moves (AC-SYN-07), "Show my code" and "Not now". Show my
 * code opens the code in the card, asking the server for one if this
 * device has none.
 *
 * The card reports accepted when the player saves the code (Copy code or
 * I've saved it): the offer exists to get a code saved, and an offer
 * accepted that way never comes back (`syncOfferEligible`).
 */
import { useEffect, useId, useRef, useState } from "react";

import { track } from "@/features/analytics/track";
import type { OfferCardProps } from "@/features/offers";
import { OfferCard } from "@/features/offers/client";
import { Card } from "@/ui/card";

import { IDENTITY_CLIENT_COPY } from "../client-copy";
import { KeyIcon } from "../icons";
import { SyncCodePanel } from "../sync/sync-code-panel";
import { syncTriggerFor } from "./eligibility";

const COPY = IDENTITY_CLIENT_COPY;

export function SyncCard({ ctx, onAccept, onDismiss }: OfferCardProps) {
  // The card shows only when a trigger fired; `manual` covers a caller
  // that shows it anyway.
  const trigger = syncTriggerFor(ctx) ?? "manual";
  const words =
    trigger === "private_first" ? COPY.sync.privateOffer : COPY.sync.offer;
  const [open, setOpen] = useState(false);
  const saved = useRef(false);
  const titleId = useId();

  useEffect(() => {
    track("sync_code_offer", { trigger });
  }, [trigger]);

  if (!open) {
    return (
      <OfferCard
        title={words.title}
        body={
          <>
            <p>{words.body}</p>
            <p className="mt-1 text-body-sm text-ink-2">{COPY.whatMoves}</p>
          </>
        }
        actionLabel={COPY.sync.offer.action}
        icon={<KeyIcon />}
        onAccept={() => {
          setOpen(true);
        }}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <Card
      as="section"
      aria-labelledby={titleId}
      data-offer-card="sync"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-lg font-bold">
          {COPY.sync.title}
        </h2>
        <p className="text-body-sm text-ink-2">{COPY.whatMoves}</p>
      </div>
      <SyncCodePanel
        trigger={trigger}
        autoCreate
        onSaved={() => {
          if (saved.current) return;
          saved.current = true;
          onAccept();
        }}
      />
    </Card>
  );
}
