"use client";

/**
 * The Daily header's middle (PRD §3.1.3, DESIGN §6.6, §6.7, §10.5): the
 * round pills and the stopwatch, in one container that knows its width in
 * `rem`, so it follows the player's text size as well as the screen.
 *
 * - Wide enough: the pills, then the stopwatch with its icon.
 * - Narrower (from 360 px down, or large text on a phone, RITE round 1
 *   R1-03): the stopwatch drops its icon, then the pills give way to the
 *   same facts in words ("Mystery 1 of 3"). The words keep their natural
 *   width, so at 200% text they wrap by word on a line of their own and the
 *   stopwatch drops under them, rather than being squeezed letter by
 *   letter. Nothing ever scrolls sideways.
 *
 * The thresholds were measured against the greybox header: four 38 px
 * pills need 14.5rem beside the stopwatch, and 16rem with its icon. DS-1's
 * restyled pills and bar bring their own (a FIX-DS follow-up).
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
  return (
    <div className="@container/status w-full" data-header-status="">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="hidden min-w-0 flex-auto @min-[14.5rem]/status:block">
          <ProgressSegments
            label={DAILY_SCREEN_COPY.progress}
            segments={progressSegments(run)}
            variant={progressVariant(run)}
          />
        </div>
        <p
          data-progress-text=""
          className="min-w-0 flex-auto text-sm font-semibold @min-[14.5rem]/status:hidden"
        >
          {progressText(run)}
        </p>
        {stopwatch}
      </div>
    </div>
  );
}
