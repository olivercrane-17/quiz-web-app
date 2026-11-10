"use client";

/**
 * `/daily` (PRD §3.1.3, DESIGN §12.2), greybox: the focus-mode header (Leave,
 * the round pills, the stopwatch, More) and the round area. On mount it
 * starts or resumes today's attempt (ARCHITECTURE §1.4 item 11), so Play, a
 * deep link and Back all behave the same; a finished attempt goes to its
 * results.
 *
 * The prerendered HTML is the frame and a skeleton: the controller only
 * starts in an effect, after the client boot, so server and client render
 * the same first snapshot. A hidden route (kept in `<Activity>`) stops the
 * controller and picks up from the server when it shows again; the More
 * menu and How to play close as it hides.
 *
 * What RITE round 1 added (FIX-DLY):
 * - The More menu with How to play (PRD §3.1.3's five parts, logging
 *   `how_to_play_open`) and Hide or Show stopwatch; the stopwatch itself
 *   opens it at Hide stopwatch (R1-04, R1-05). The choice persists in the
 *   settings store, everywhere.
 * - In the player's first Daily, "Take your time. Time only breaks ties."
 *   beside the stopwatch (R1-05), from the start's first-Daily flag, which
 *   the round context also carries to the rounds (R1-04). The hint is the
 *   stopwatch's accessible description too, so a screen reader hears it
 *   there.
 * - A header that fits 200% text on a phone (R1-03, `HeaderStatus`).
 * - "Saved" as a toast once Leave has taken the player to Today (R1-38).
 *
 * What RITE round 2 added (FIX2-DLY): Leave says whether the stopwatch keeps
 * running (D19, R2-01): with a clue or the Encore open, the X is named
 * "Leave the Daily. Your progress is saved, and the stopwatch keeps
 * running." and the toast says "Saved. The stopwatch keeps running.", while
 * a reveal keeps "Saved". From Lock in the stopwatch stops on the finish's
 * total, the stop screen's time (R2-08).
 * - One `h1` on the route: this screen's own only while no round component
 *   draws its heading (R1-34; `RoundArea` keeps the other half).
 *
 * A start that can't go through says why in words that say what still
 * works (PRD §3.0.2). A rate-limited one follows AC-IDN-04: the skeleton
 * and "Checking…" while it retries silently for 5 s, then the network's
 * copy with Try again, and Practice only once 30 s of refusals have passed.
 */
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { track } from "@/features/analytics/track";
import type { PlaySettings } from "@/features/rounds";
import { playSettingsFrom } from "@/features/rounds";
import { PlayFrame } from "@/features/shell";
import { getSettingsStore } from "@/platform/settings/store";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";
import { UI_COPY } from "@/ui/copy";
import { focusWithRing } from "@/ui/focus-ring";
import { Loading, Skeleton, SkeletonText } from "@/ui/skeleton";
import { showToast } from "@/ui/toast";

import { DAILY_SCREEN_COPY } from "../client-copy";
import { PRACTICE_HREF } from "../links";
import { browserDeps } from "../model/browser";
import {
  createDailyController,
  type DailyController,
  type DailySnapshot,
  type StartProblem,
} from "../model/controller";
import { rememberFinished } from "../model/handoff";
import { openRoundNumber } from "../model/labels";
import { HeaderStatus } from "./header-status";
import type { HowToPlaySheet } from "./how-to-play-sheet";
import { leaveWords, showToastAfterLeaving } from "./leave-toast";
import { loadHowToPlaySheet } from "./load-how-to-play";
import { MoreMenu, type MoreMenuItem } from "./more-menu";
import { RoundArea, screenTitle } from "./round-area";
import { Stopwatch } from "./stopwatch";

const COPY = DAILY_SCREEN_COPY;
/** How long after the Daily mounts How to play's chunk is fetched, clear of the start's own requests. */
export const HOW_TO_PLAY_WARM_MS = 1_500;

/** Where the Daily lives: Leave's toast waits until the address leaves it. */
const DAILY_PATH = "/daily";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The stored settings a round reads, resolved once per visit (client only). */
function usePlaySettings(): PlaySettings {
  return useMemo(
    () => playSettingsFrom(getSettingsStore().get(), prefersReducedMotion()),
    [],
  );
}

function subscribeSettings(onChange: () => void): () => void {
  return getSettingsStore().subscribe(() => {
    onChange();
  });
}

/** "Hide stopwatch", live: the More menu changes it, and it persists (AC-DLY-12). */
function useStopwatchShown(): boolean {
  return useSyncExternalStore(
    subscribeSettings,
    () => getSettingsStore().get().stopwatch !== "hidden",
    () => true,
  );
}

function StartSkeleton({ slow }: { slow: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Loading label={COPY.loading}>
        <div className="flex flex-col gap-3">
          <Skeleton width="10rem" />
          <Skeleton shape="block" />
          <SkeletonText lines={2} />
        </div>
      </Loading>
      {slow ? (
        <p className="text-sm text-muted-foreground">{UI_COPY.checking}</p>
      ) : null}
    </div>
  );
}

/** A rate-limited start still inside its 5 s of silent retries (PRD §3.0.2). */
function retryingSilently(problem: StartProblem | null): boolean {
  return problem !== null && problem.retrying && problem.notice === "silent";
}

/** The device's own word on its connection: false only when it knows it has none. */
function deviceOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function onConnectionChange(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** The words for a start problem, and whether Practice is offered yet. */
function problemWords(
  problem: StartProblem,
  online: boolean,
): {
  title: string;
  body: string | null;
  practice: boolean;
} {
  // A device without a connection hears that first, whatever the backend
  // could answer (PRD §3.1.7, decisions memo §2): no other words would be
  // true, and Practice is what still works.
  if (!online) return { ...COPY.offline, practice: true };
  if (problem.code === "rate_limited" && problem.retrying) {
    // AC-IDN-04: the network's copy first, Practice only from 30 s.
    if (problem.notice === "plain") {
      return {
        title:
          problem.scope === "ip" ? COPY.startBusy.ip : COPY.startBusy.other,
        body: null,
        practice: false,
      };
    }
    return { ...COPY.startBusyFallback, practice: true };
  }
  const words =
    problem.code === "offline"
      ? COPY.offline
      : problem.code === "unavailable" || problem.code === "feature_disabled"
        ? COPY.notReady
        : problem.code === "no_daily"
          ? COPY.outage
          : problem.code === "unreachable" || problem.code === "timeout"
            ? COPY.unreachable
            : COPY.failed;
  return { ...words, practice: true };
}

/** Why the Daily hasn't opened, in words that say what still works (PRD §3.0.2). */
export function StartProblemCard({
  snapshot,
  controller,
}: {
  snapshot: DailySnapshot;
  controller: DailyController;
}) {
  const problem = snapshot.problem;
  // The words follow the device's connection as it drops and comes back.
  const online = useSyncExternalStore(
    onConnectionChange,
    deviceOnline,
    () => true,
  );
  if (problem === null) return null;
  const words = problemWords(problem, online);
  const canRetry =
    !online ||
    (problem.code !== "unavailable" && problem.code !== "feature_disabled");
  return (
    <Card
      as="section"
      tone="sunken"
      className="flex flex-col gap-3"
      data-daily-problem={online ? problem.code : "offline"}
    >
      <h2 className="text-lg font-semibold">{words.title}</h2>
      {words.body === null ? null : <p className="text-base">{words.body}</p>}
      <div className="flex flex-wrap gap-3">
        {canRetry ? (
          <Button onClick={() => controller.retry()}>{COPY.tryAgain}</Button>
        ) : null}
        {words.practice ? (
          <Link
            href={PRACTICE_HREF}
            // Rarely followed: no prefetch.
            prefetch={false}
            className={buttonClasses({ variant: "text" })}
          >
            {COPY.practice}
          </Link>
        ) : null}
      </div>
      {problem.refId === null ? null : (
        <p className="text-xs text-muted-foreground">
          {COPY.reference(problem.refId)}
        </p>
      )}
    </Card>
  );
}

/** The More menu, opened from the More button or the stopwatch. */
interface MenuState {
  at: MoreMenuItem;
  from: "button" | "stopwatch";
}

/** The element that held the player's place: the clue, else the round's heading. */
function placeInRound(): HTMLElement | null {
  for (const target of ["clue_heading", "round_heading", "reveal_heading"]) {
    const element = document.querySelector<HTMLElement>(
      `[data-round-area] [data-focus-target~="${target}"]`,
    );
    if (element !== null) return element;
  }
  return null;
}

/**
 * "Take your time. Time only breaks ties.", beside the stopwatch in the
 * player's first Daily (PRD §3.1.3, R1-05): right under it, first in
 * `<main>`, so it also comes straight after the header in reading order.
 * It stays out of the sticky header, which it would grow by a line on a
 * phone and, at 200% text, from 177 px to 385 px on 390 by 844 (465 px of
 * 568 on a 320 px phone). The stopwatch names it as its description
 * (`aria-describedby`), so a screen reader hears it on the stopwatch.
 */
function StopwatchHint({ id }: { id: string }) {
  return (
    <p
      id={id}
      data-stopwatch-hint=""
      className="self-end text-right text-sm font-semibold text-muted-foreground"
    >
      {COPY.stopwatchHint}
    </p>
  );
}

export function DailyScreen() {
  const [controller] = useState(() => createDailyController(browserDeps()));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const router = useRouter();
  const stopwatchShown = useStopwatchShown();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [howToPlay, setHowToPlay] = useState(false);
  /**
   * How to play's sheet, from a chunk of its own: the Daily's first paint
   * needs neither its words nor the modal sheet's code (§10.9, R4's bundle
   * work). It loads once the Daily has settled, well before the More menu
   * can ask for it, and again on asking if that load failed. It resolves
   * to whether the sheet is there to open.
   */
  const [HowTo, setHowTo] = useState<typeof HowToPlaySheet | null>(null);
  const loadHowTo = useCallback(
    () =>
      loadHowToPlaySheet().then(
        (sheet) => {
          setHowTo(() => sheet);
          return true;
        },
        // Asked for again when How to play is pressed.
        () => false,
      ),
    [],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadHowTo();
    }, HOW_TO_PLAY_WARM_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [loadHowTo]);
  /** How to play was pressed and its sheet is still loading: a second press asks for nothing more. */
  const askingHowTo = useRef(false);
  /** False while the route is hidden or gone: a load that lands then opens nothing. */
  const onScreen = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const backToRound = useRef(false);
  const menuId = useId();
  const hintId = useId();

  useEffect(() => {
    controller.start();
    return () => {
      controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    const onChange = () => {
      controller.visibility(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [controller]);

  // A hidden route keeps its state (<Activity>): a menu or sheet left open
  // must not greet the player when they come back.
  useLayoutEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
      setMenu(null);
      setHowToPlay(false);
    };
  }, []);

  const { status, daily, attemptId, movedOn, run } = snapshot;
  // The stop screen, prefetched while the Daily plays, arrives with its
  // title, so the route announcer reads it rather than the hidden Encore's
  // heading (R1-09).
  const dailyNumber = daily?.dailyNumber ?? null;
  useEffect(() => {
    if (dailyNumber !== null) {
      router.prefetch(`/daily/${dailyNumber}/results` as Route);
    }
  }, [router, dailyNumber]);

  useEffect(() => {
    if (status !== "finished" || daily === null || attemptId === null) return;
    rememberFinished(daily.dailyNumber, attemptId);
    router.replace(`/daily/${daily.dailyNumber}/results` as Route);
  }, [router, status, daily, attemptId]);

  useEffect(() => {
    if (movedOn) announce(COPY.movedOn);
  }, [movedOn]);

  // Closing How to play goes back to the clue the player was on (AC-DLY-30):
  // after the sheet's own cleanup, since the menu item that opened it is gone.
  useEffect(() => {
    if (howToPlay || !backToRound.current) return;
    backToRound.current = false;
    focusWithRing(placeInRound() ?? moreRef.current);
  }, [howToPlay]);

  const openMenu = useCallback(
    (at: MoreMenuItem, from: MenuState["from"], element: HTMLElement) => {
      opener.current = element;
      setMenu({ at, from });
    },
    [],
  );

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) opener.current?.focus();
  }, []);

  const showHowToPlay = () => {
    setMenu(null);
    // Counted once the sheet is there to open, never for a press that
    // opened nothing.
    const open = () => {
      backToRound.current = true;
      setHowToPlay(true);
      track("how_to_play_open", {
        round: openRoundNumber(run),
        first_daily: snapshot.firstDaily,
      });
    };
    if (HowTo !== null) {
      open();
      return;
    }
    // Pressed before the sheet's chunk landed, or after its load failed
    // (offline in the Daily's first moments, a chunk error). The menu item
    // is gone, so the More button holds focus while it loads.
    moreRef.current?.focus();
    if (askingHowTo.current) return;
    askingHowTo.current = true;
    void loadHowTo().then((loaded) => {
      askingHowTo.current = false;
      if (!onScreen.current) return;
      if (loaded) {
        open();
        return;
      }
      // Nothing opened: back to the clue, as closing the sheet goes
      // (AC-DLY-30), and say why. The next press asks again.
      focusWithRing(placeInRound() ?? moreRef.current);
      showToast(COPY.more.howToPlayFailed, { icon: "offline" });
    });
  };

  const toggleStopwatch = () => {
    const next = stopwatchShown ? "hidden" : "shown";
    getSettingsStore().update({ stopwatch: next });
    track("settings_change", { setting: "stopwatch", value: next });
    setMenu(null);
    // The stopwatch may be gone: the More button keeps the player's place.
    moreRef.current?.focus();
  };

  const playing = status === "playing" && run !== null;
  /** The first-Daily hint shows, and describes the stopwatch (R1-05). */
  const hinted = playing && snapshot.firstDaily && stopwatchShown;
  /** Whether leaving now leaves the stopwatch running (D19, R2-01). */
  const leave = leaveWords(run, playing);

  return (
    <PlayFrame
      header={{
        leave: {
          href: "/",
          label: leave.label,
          onLeave: () => {
            if (leave.toast !== null) {
              showToastAfterLeaving(leave.toast, DAILY_PATH);
            }
          },
        },
        progress:
          run === null ? undefined : (
            <HeaderStatus
              run={run}
              stopwatch={
                stopwatchShown ? (
                  <Stopwatch
                    run={run}
                    offset={snapshot.timeOffset}
                    total={snapshot.totalMs}
                    expanded={menu?.from === "stopwatch"}
                    menuId={menuId}
                    describedBy={hinted ? hintId : undefined}
                    onOpenMenu={(element) => {
                      if (menu !== null) closeMenu(false);
                      else openMenu("stopwatch", "stopwatch", element);
                    }}
                  />
                ) : null
              }
            />
          ),
        end: (
          <MoreMenu
            openAt={menu?.at ?? null}
            fromButton={menu?.from === "button"}
            onOpen={(at, element) => {
              openMenu(at, "button", element);
            }}
            onClose={closeMenu}
            stopwatchShown={stopwatchShown}
            onHowToPlay={showHowToPlay}
            onToggleStopwatch={toggleStopwatch}
            menuId={menuId}
            buttonRef={moreRef}
          />
        ),
      }}
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4">
        {playing ? (
          <>
            {hinted ? <StopwatchHint id={hintId} /> : null}
            <PlayingArea snapshot={snapshot} controller={controller} />
          </>
        ) : (
          <>
            <h1 className="sr-only">{screenTitle(snapshot)}</h1>
            {retryingSilently(snapshot.problem) ? (
              <StartSkeleton slow />
            ) : status === "failed" || snapshot.problem !== null ? (
              <StartProblemCard snapshot={snapshot} controller={controller} />
            ) : (
              <StartSkeleton slow={snapshot.slowStart} />
            )}
          </>
        )}
      </div>
      {HowTo === null ? null : (
        <HowTo
          open={howToPlay}
          onClose={() => {
            setHowToPlay(false);
          }}
        />
      )}
    </PlayFrame>
  );
}

function PlayingArea({
  snapshot,
  controller,
}: {
  snapshot: DailySnapshot;
  controller: DailyController;
}) {
  const play = usePlaySettings();
  return (
    <RoundArea snapshot={snapshot} controller={controller} settings={play} />
  );
}
