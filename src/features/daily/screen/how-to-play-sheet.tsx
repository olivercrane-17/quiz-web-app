"use client";

/**
 * How to play as a sheet over the Daily (PRD §3.1.3, AC-DLY-30): the five
 * parts in order, opened from the More menu. Closing it returns focus to
 * the clue the player was on, which the screen does, because the menu item
 * that opened it is gone by then.
 */
import { UI_COPY } from "@/ui/copy";
import { Sheet } from "@/ui/sheet";

import { HOW_TO_PLAY } from "../how-to-play";
import { HowToPlayText } from "../how-to-play-text";

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
    </Sheet>
  );
}
