"use client";

/**
 * `/daily` (PRD §3.1.3, DESIGN §12.2), greybox: the focus-mode header (Leave,
 * the round pills, the stopwatch) and the round area. On mount it starts or
 * resumes today's attempt (ARCHITECTURE §1.4 item 11), so Play, a deep link
 * and Back all behave the same; a finished attempt goes to its results.
 *
 * The prerendered HTML is the frame and a skeleton: the controller only
 * starts in an effect, after the client boot, so server and client render
 * the same first snapshot. A hidden route (kept in `<Activity>`) stops the
 * controller and picks up from the server when it shows again.
 */
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { PlaySettings } from "@/features/rounds";
import { playSettingsFrom } from "@/features/rounds";
import { PlayFrame } from "@/features/shell";
import { getSettingsStore } from "@/platform/settings/store";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";
import { UI_COPY } from "@/ui/copy";
import { ProgressSegments } from "@/ui/progress-segments";
import { Loading, Skeleton, SkeletonText } from "@/ui/skeleton";

import { DAILY_SCREEN_COPY } from "../client-copy";
import { browserDeps } from "../model/browser";
import {
  createDailyController,
  type DailyController,
  type DailySnapshot,
} from "../model/controller";
import { rememberFinished } from "../model/handoff";
import { progressSegments, progressVariant } from "../model/labels";
import { RoundArea } from "./round-area";
import { Stopwatch } from "./stopwatch";

const COPY = DAILY_SCREEN_COPY;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The stored settings a round reads, resolved once per visit (client only). */
function usePlaySettings(): { play: PlaySettings; stopwatchShown: boolean } {
  return useMemo(() => {
    const settings = getSettingsStore().get();
    return {
      play: playSettingsFrom(settings, prefersReducedMotion()),
      stopwatchShown: settings.stopwatch !== "hidden",
    };
  }, []);
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

/** Why the Daily hasn't opened, in words that say what still works (PRD §3.0.2). */
function StartProblemCard({
  snapshot,
  controller,
}: {
  snapshot: DailySnapshot;
  controller: DailyController;
}) {
  const problem = snapshot.problem;
  if (problem === null) return null;
  const words =
    problem.code === "offline"
      ? COPY.offline
      : problem.code === "unavailable" || problem.code === "feature_disabled"
        ? COPY.unavailable
        : problem.code === "no_daily"
          ? COPY.outage
          : problem.code === "unreachable" || problem.code === "timeout"
            ? COPY.unreachable
            : COPY.failed;
  const canRetry =
    problem.code !== "unavailable" && problem.code !== "feature_disabled";
  return (
    <Card
      as="section"
      tone="sunken"
      className="flex flex-col gap-3"
      data-daily-problem={problem.code}
    >
      <h2 className="text-lg font-semibold">{words.title}</h2>
      <p className="text-base">{words.body}</p>
      <div className="flex flex-wrap gap-3">
        {canRetry ? (
          <Button onClick={() => controller.retry()}>{COPY.tryAgain}</Button>
        ) : null}
        <Link
          href={"/practice" as Route}
          // Built by a later ticket: no prefetch, which would 404 until then.
          prefetch={false}
          className={buttonClasses({ variant: "text" })}
        >
          {COPY.practice}
        </Link>
      </div>
      {problem.refId === null ? null : (
        <p className="text-xs text-muted-foreground">
          {COPY.reference(problem.refId)}
        </p>
      )}
    </Card>
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

  const { status, daily, attemptId, movedOn } = snapshot;
  useEffect(() => {
    if (status !== "finished" || daily === null || attemptId === null) return;
    rememberFinished(daily.dailyNumber, attemptId);
    router.replace(`/daily/${daily.dailyNumber}/results` as Route);
  }, [router, status, daily, attemptId]);

  useEffect(() => {
    if (movedOn) announce(COPY.movedOn);
  }, [movedOn]);

  return (
    <PlayFrame
      header={{
        leave: { href: "/", label: COPY.leave },
        progress:
          snapshot.run === null ? undefined : (
            <ProgressSegments
              label={COPY.progress}
              segments={progressSegments(snapshot.run)}
              variant={progressVariant(snapshot.run)}
            />
          ),
        end:
          snapshot.run === null ? undefined : (
            <StopwatchSlot snapshot={snapshot} />
          ),
      }}
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4">
        <h1 className="sr-only">
          {daily === null
            ? COPY.title
            : `${COPY.title}, Daily #${daily.dailyNumber}`}
        </h1>
        {status === "playing" ? (
          <PlayingArea snapshot={snapshot} controller={controller} />
        ) : status === "failed" || snapshot.problem !== null ? (
          <StartProblemCard snapshot={snapshot} controller={controller} />
        ) : (
          <StartSkeleton slow={snapshot.slowStart} />
        )}
      </div>
    </PlayFrame>
  );
}

function StopwatchSlot({ snapshot }: { snapshot: DailySnapshot }) {
  const { stopwatchShown } = usePlaySettings();
  if (snapshot.run === null || !stopwatchShown) return null;
  return <Stopwatch run={snapshot.run} />;
}

function PlayingArea({
  snapshot,
  controller,
}: {
  snapshot: DailySnapshot;
  controller: DailyController;
}) {
  const { play } = usePlaySettings();
  return (
    <RoundArea snapshot={snapshot} controller={controller} settings={play} />
  );
}
