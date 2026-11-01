"use client";

/**
 * The offer card's layout (DESIGN §6.10): a title, one line, one action in
 * the secondary style and "Not now" as a text link. Never primary-styled,
 * because "Done for today" is the stop screen's only primary button
 * (AC-DLY-14). Providers render their card through it.
 */
import { useId, type ReactNode } from "react";

import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

import { OFFERS_COPY } from "./copy";

export interface OfferCardLayoutProps {
  title: string;
  body: ReactNode;
  actionLabel: string;
  onAccept(): void;
  onDismiss(): void;
  /** A decorative tile before the title. */
  icon?: ReactNode;
}

export function OfferCard({
  title,
  body,
  actionLabel,
  onAccept,
  onDismiss,
  icon,
}: OfferCardLayoutProps) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} data-offer-card="">
      <div className="flex items-start gap-3">
        {icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="inline-grid size-10 shrink-0 place-items-center rounded-xl bg-muted"
          >
            {icon}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <div className="text-base">{body}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onAccept}>
          {actionLabel}
        </Button>
        <Button variant="text" onClick={onDismiss}>
          {OFFERS_COPY.notNow}
        </Button>
      </div>
    </Card>
  );
}
