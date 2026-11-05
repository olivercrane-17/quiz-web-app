"use client";

/**
 * The Daily header's middle (PRD §3.1.3, DESIGN §6.6, §6.7, §10.5): the
 * round pills and the stopwatch, in one container that knows its width.
 *
 * DS-1's pills and stopwatch keep their size at 200% text (their type is
 * in px), so the thresholds are in px too, and the player's text size no
 * longer decides them; 200% text grows the header's other parts instead.
 *
 * - The pills ask for 127 px: four pills at their narrowest, 28 px each
 *   (which still holds "+3" and "M3"), with their 5 px gaps. Given more,
 *   they grow to 38 px (32 px under 360 px) and never wrap, so the row
 *   stays one line (R1-03).
 * - The stopwatch sits beside them while both fit, 320 px phones included,
 *   and drops under them at the right when they don't.
 * - Too narrow even for the pills alone (under 127 px): the pills give way
 *   to where the run stands in words, "Mystery 2 of 3" or "Encore". The
 *   words keep their natural width and wrap by word. They leave out the
 *   finished rounds' marks, so the sticky header stays short (D11).
 *
 * The pills' labelled list stays in the accessibility tree at every width,
 * only hidden from sight while the words show, so a screen reader always
 * hears every round's result ("Mystery 1, solved on clue 2, 3 points"); the
 * words are for the eye alone, so nothing is heard twice.
 */
import type { ReactNode } from "react";

import type { RunState } from "@/engine/run";
import { ProgressSegments } from "@/ui/progress-segments";

import { DAILY_SCREEN_COPY } from "../client-copy";
import {
  progressSegments,
  progressText,
  progressVariant,
} from "../model/labels";

export function HeaderStatus({
  run,
  stopwatch,
}: {
  run: RunState;
  /** The stopwatch, or null while it is hidden. */
  stopwatch: ReactNode;
}) {
  const variant = progressVariant(run);
  return (
    <div className="@container/status w-full" data-header-status="">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        {/* Their narrowest row is the basis, so the stopwatch stays beside
            them wherever both fit; then the row grows into the room left. */}
        <div className="sr-only min-w-0 flex-[1_1_127px] @min-[127px]/status:not-sr-only">
          <ProgressSegments
            label={DAILY_SCREEN_COPY.progress}
            segments={progressSegments(run)}
            variant={variant}
          />
        </div>
        <p
          data-progress-text=""
          aria-hidden="true"
          className="min-w-0 flex-auto text-sm font-semibold @min-[127px]/status:hidden"
        >
          {progressText(run)}
        </p>
        {stopwatch === null ? null : <div className="ml-auto">{stopwatch}</div>}
      </div>
    </div>
  );
}
