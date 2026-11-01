/**
 * The Daily controller's dependencies in the browser: the backend after the
 * client boot, the real plugins, the system clock, timers, the live
 * regions, analytics, and the start context the server records for cohorts
 * (§7.3). Client code only; the controller itself stays framework-free.
 */
import { getBackend } from "@/backend";
import { loadAnswerList } from "@/content/loaders/answer-lists";
import { PLUGINS } from "@/engine/rounds";
import {
  parseIdempotencyKey,
  parseTimeZone,
  type IdempotencyKey,
  type TimeZone,
} from "@/engine/types";
import { track } from "@/features/analytics/track";
import { bootClient } from "@/features/identity";
import { systemClock } from "@/platform/clock";
import { uuidV4 } from "@/platform/identity/local";
import { announce } from "@/ui/announce";

import type { DailyControllerDeps, StartContext } from "./controller";
import { scoreBand } from "./labels";

/** Reported with every start until PLT-1 reads the build's commit as the app version. */
export const APP_VERSION = "greybox";

/** The device's IANA zone (PRD §4.4.1); the server falls back for an unknown one. */
export function deviceZone(): TimeZone {
  try {
    const zone = parseTimeZone(
      new Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    if (zone !== null) return zone;
  } catch {
    // Fall through to UTC.
  }
  return parseTimeZone("UTC") as TimeZone;
}

/**
 * What the start tells the server about the browser. IDN-2's in-app
 * detection (`src/platform/browser-context.ts`) fills in the context and
 * app; until then only an installed app is told apart.
 */
export function startContext(): StartContext {
  let installed = false;
  try {
    installed = window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    // No matchMedia: an ordinary browser.
  }
  return {
    tz: deviceZone(),
    browser: {
      context: installed ? "installed" : "unknown",
      app: "none",
      platform: "other",
    },
    appVersion: APP_VERSION,
  };
}

function newKey(): IdempotencyKey {
  const key = parseIdempotencyKey(uuidV4());
  if (key === null) throw new Error("could not make an idempotency key");
  return key;
}

export function browserDeps(): DailyControllerDeps {
  return {
    async backend() {
      await bootClient();
      return getBackend();
    },
    plugins: PLUGINS,
    clock: systemClock,
    schedule(callback, ms) {
      const timer = setTimeout(callback, ms);
      return () => {
        clearTimeout(timer);
      };
    },
    random: () => Math.random(),
    newKey,
    announce,
    startContext,
    onFinished(summary, composition) {
      track("run_complete", {
        mode: "daily",
        score_band: scoreBand(summary.points),
        composition,
      });
    },
    onAttempt(snapshot) {
      // The client preloads the answer lists the Daily needs while clue 1
      // shows (PRD §3.1.3), so suggestions are ready at the first keystroke.
      // The Wave 1 merge warms MYS-1's handle store itself instead, with
      // `preloadAnswerLists(types)` (see screen/answer-lists.ts).
      const types = new Set(
        snapshot.rounds.flatMap((meta) =>
          meta.answerType === null ? [] : [meta.answerType],
        ),
      );
      for (const type of types) void loadAnswerList(type);
    },
  };
}
