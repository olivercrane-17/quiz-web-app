"use client";

/**
 * How to play as a sheet over the Daily (PRD §3.1.3, AC-DLY-30): the five
 * parts in order, opened from the More menu, then a link to
 * `/how-scoring-works`, which carries the same text with the rest of the
 * rules. Closing it returns focus to the clue the player was on, which the
 * screen does, because the menu item that opened it is gone by then.
 */
import Link from "next/link";

import { buttonClasses } from "@/ui/button-classes";
import { UI_COPY } from "@/ui/copy";
import { Sheet } from "@/ui/sheet";

import { DAILY_SCREEN_COPY } from "../client-copy";
import { HOW_TO_PLAY } from "../how-to-play";
import { HowToPlayText } from "../how-to-play-text";

/** The trust page that carries How to play too (PRD §3.1.3, §3.14). */
export const HOW_SCORING_WORKS_HREF = "/how-scoring-works";

export function HowToPlaySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  return (
    <Sheet
      open={open}
      title={HOW_TO_PLAY.title}
      onClose={onClose}
      closeLabel={UI_COPY.close}
      id="qz-how-to-play"
    >
      <HowToPlayText headingLevel={3} />
      <p className="mt-4">
        <Link
          href={HOW_SCORING_WORKS_HREF}
          className={buttonClasses({ variant: "text" })}
        >
          {DAILY_SCREEN_COPY.howScoringWorks}
        </Link>
      </p>
    </Sheet>
  );
}
