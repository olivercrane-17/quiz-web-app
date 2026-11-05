"use client";

/**
 * The stop screen's sync offer (PRD §3.10.2, §3.10.5, DESIGN §6.10): "Keep
 * your streak safe" (or, in a private window, "Private window?") with the
 * line on what moves (AC-SYN-07), "Show my code" and "Not now". Show my
 * code opens the code in the card, asking the server for one if this
 * device has none and can't have one elsewhere; a restored profile, which
 * may have a code written down, sees Show my code again beside the line
 * saying an old code stops working, so ending it takes a second tap.
 *
 * Opening the card replaces the button the player pressed, so its title
 * takes focus, until a code the panel asked for arrives and takes it.
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitle = useRef(false);

  useEffect(() => {
    track("sync_code_offer", { trigger });
  }, [trigger]);

  useEffect(() => {
    if (!open || !focusTitle.current) return;
    focusTitle.current = false;
    titleRef.current?.focus();
  }, [open]);

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
          focusTitle.current = true;
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
        <h2
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="text-lg font-bold outline-none"
        >
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
