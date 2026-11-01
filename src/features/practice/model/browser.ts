/**
 * The tab's practice controller, wired to the browser: the system clock,
 * the shared kv, the practice loader, UUIDs from crypto.getRandomValues, the
 * device's local date, the tunable bands, the 400 ms suspense beat on
 * setTimeout, this tab's run in session storage, analytics
 * (`practice_start`, `run_complete`, PRD §7.2) and the run the results
 * screen should show. One per tab, created on first use; islands call it
 * from effects and handlers only, after `bootClient()`.
 *
 * Seen-tracking and the pulled-item denylist arrive with PRA-2, which
 * replaces the two empty sources below.
 */
import { TUNABLES } from "@/config/tunables";
import { loadPracticePool } from "@/content/loaders/practice";
import type { SeenIndex } from "@/engine/practice";
import { localDateOf, utcDateOf } from "@/engine/time";
import {
  parseTimeZone,
  type CategoryId,
  type ItemId,
  type TimeZone,
} from "@/engine/types";
import { track } from "@/features/analytics/track";
import { systemClock } from "@/platform/clock";
import { getKv } from "@/platform/storage";

import {
  createPracticeController,
  type PracticeController,
} from "./controller";
import { uuidV4 } from "./ids";
import { rememberFinishedRun } from "./last-run";
import { practiceScoreBand } from "./summary";
import { sessionTabRun } from "./tab-run";

const EMPTY_SEEN: SeenIndex = new Map();
const EMPTY_DENYLIST: ReadonlySet<ItemId> = new Set();

/** Category slugs for analytics, handed over by the route that renders the run. */
let categorySlugs: Readonly<Partial<Record<CategoryId, string>>> = {};

export function setPracticeCategorySlugs(
  slugs: Readonly<Partial<Record<CategoryId, string>>>,
): void {
  categorySlugs = slugs;
}

function deviceZone(): TimeZone | null {
  try {
    return parseTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

/** The device's local date; the UTC date when the zone can't be read. */
function today() {
  const now = systemClock.now();
  const zone = deviceZone();
  return zone === null ? utcDateOf(now) : localDateOf(now, zone);
}

let shared: PracticeController | null = null;

export function getPracticeController(): PracticeController {
  shared ??= createPracticeController({
    clock: systemClock,
    kv: getKv(),
    loadPool: loadPracticePool,
    newId: () => uuidV4(),
    today,
    seen: () => EMPTY_SEEN,
    denylist: () => EMPTY_DENYLIST,
    plan: { bands: TUNABLES.practice },
    beat: {
      ms: TUNABLES.answers.revealMs,
      schedule(run, ms) {
        const timer = setTimeout(run, ms);
        return () => clearTimeout(timer);
      },
    },
    tab: sessionTabRun,
    events: {
      started(request) {
        track("practice_start", {
          mode: "practice",
          category:
            request.category === "mixed"
              ? "mixed"
              : (categorySlugs[request.category] ?? request.category),
          difficulty: request.difficulty,
        });
      },
      finished(entry, composition) {
        rememberFinishedRun(entry.runId);
        track("run_complete", {
          mode: "practice",
          score_band: practiceScoreBand(entry.score),
          composition,
        });
      },
    },
  });
  return shared;
}
