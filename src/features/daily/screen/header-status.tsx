"use client";

/**
 * The Daily header's middle (PRD §3.1.3, DESIGN §6.6, §6.7, §10.5): the
 * round pills and the stopwatch, in one container that knows its width in
 * `rem`, so it follows the player's text size as well as the screen.
 *
 * - Wide enough: the pills, then the stopwatch with its icon.
 * - Narrower (from 360 px down, RITE round 1 R1-03): the stopwatch drops its
 *   icon, then its place beside the pills, and sits under them at the
 *   right, so the pills keep their own row (320 px with ordinary text).
 * - Too narrow even for that (large text on a phone): the pills give way to
 *   where the run stands in words, "Mystery 2 of 3" or "Encore". The words
 *   keep their natural width, so at 200% text they wrap by word and the
 *   stopwatch drops under them, rather than being squeezed letter by
 *   letter. Nothing ever scrolls sideways. They leave out the finished
 *   rounds' marks, which took the sticky header to four lines, a third of
 *   a 360 by 640 screen, from Mystery 3 on; the header stays under 160 px
 *   there.
 *
 * The pills' labelled list stays in the accessibility tree at every width,
 * only hidden from sight while the words show, so a screen reader always
 * hears every round's result ("Mystery 1, solved on clue 2, 3 points"); the
 * words are for the eye alone, so nothing is heard twice.
 *
 * The thresholds were measured against the greybox header: four 38 px pills
 * need 10.75rem on a row of their own, 14.5rem beside the stopwatch, and
 * 16rem with its icon. DS-1's restyled pills and bar bring their own. Two
 * FIX-DS follow-ups meet here: at 200% text from 768 px the pills show,
 * and their `text-sm` marks outgrow the 30 px pill (set the mark in px, or
 * let the pill grow; DESIGN §10.5); and on a phone at 200% text Leave and
 * More (`size-11`) grow to 88 px each, leaving this slot 80 to 150 px.
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
        <div className="sr-only min-w-0 flex-auto @min-[10.75rem]/status:not-sr-only">
          <ProgressSegments
            label={DAILY_SCREEN_COPY.progress}
            segments={progressSegments(run)}
            variant={variant}
            // With a small default font the pills can reach their row's
            // end: they wrap there rather than run under More. The bar's
            // segments shrink instead.
            className={variant === "pills" ? "flex-wrap gap-y-1.5" : undefined}
          />
        </div>
        <p
          data-progress-text=""
          aria-hidden="true"
          className="min-w-0 flex-auto text-sm font-semibold @min-[10.75rem]/status:hidden"
        >
          {progressText(run)}
        </p>
        {stopwatch === null ? null : <div className="ml-auto">{stopwatch}</div>}
      </div>
    </div>
  );
}
