"use client";

/**
 * The stop screen, greybox (PRD §3.1.6, DESIGN §12.4): the score card with
 * the rows exactly as the share renders them, the plain share text, the
 * rounds, and "Done for today" with the countdown to the next Daily. DLY-3
 * builds the rest in its order (best moment, percentile, Groups, the
 * histogram, review your misses, the offer card).
 *
 * The island reads the Daily number from the URL inside <Suspense> (§10.2
 * rule 2) and loads after the client boot; the data refetches on every
 * visit.
 */
import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { getBackend } from "@/backend";
import { shareRowLines, shareRows, encoreToken } from "@/engine/share/text";
import { formatLongDate } from "@/engine/time";
import {
  parseDailyNumber,
  type DailyResults,
  type EpochMs,
  type ResolvedRound,
} from "@/engine/types";
import { track } from "@/features/analytics/track";
import { ChallengeButton } from "@/features/challenges/challenge-button";
import { bootClient } from "@/features/identity";
import { useSafePoint } from "@/features/pwa/safe-point";
import { ShareButton } from "@/features/share/share-button";
import { PlayFrame } from "@/features/shell";
import { StreakLine } from "@/features/streaks/stop-screen-line";
import { getSiteUrl } from "@/lib/env";
import { getServerClock } from "@/platform/server-clock";
import { getSettingsStore } from "@/platform/settings/store";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";
import { Loading, Skeleton, SkeletonText } from "@/ui/skeleton";

import { STOP_SCREEN_COPY } from "../client-copy";
import { DEFAULT_GLYPHS, HIGH_CONTRAST_GLYPHS } from "../glyphs";
import { deviceZone } from "../model/browser";
import {
  CHOICE_ROW_LABEL,
  categoryShortName,
  dailySharePayload,
} from "../share";
import { waitWords } from "../words";
import { loadResults, type ResultsState } from "./results-loader";

const COPY = STOP_SCREEN_COPY;

export function StopScreenSkeleton() {
  return (
    <Loading label={COPY.loading}>
      <div className="flex flex-col gap-4">
        <Skeleton width="8rem" />
        <Skeleton shape="block" />
        <SkeletonText lines={4} />
      </div>
    </Loading>
  );
}

function everyHalfMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, 30_000);
  return () => {
    clearInterval(timer);
  };
}

/** Whole minutes until `at` on the server-corrected clock (PRD §3.1.6 item 9). */
function minutesUntil(at: EpochMs): number {
  return Math.max(0, Math.floor((at - getServerClock().now()) / 60_000));
}

function NextDaily({ at }: { at: EpochMs }) {
  const minutes = useSyncExternalStore(
    everyHalfMinute,
    () => minutesUntil(at),
    () => null,
  );
  if (minutes === null) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {COPY.nextDaily(waitWords(minutes * 60_000))}
    </p>
  );
}

function formatValue(value: number, years: boolean): string {
  return years
    ? String(value)
    : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function RoundRow({ round }: { round: ResolvedRound }) {
  const { meta, outcome, reveal } = round;
  let title: string;
  let detail: string | null = null;
  let result: string;
  if (reveal.family === "withdrawn") {
    title =
      outcome.family === "mystery"
        ? COPY.mysteryRow(meta.ordinal, categoryShortName(outcome.category))
        : outcome.family === "encore"
          ? COPY.encoreRow
          : COPY.choiceRow(meta.ordinal);
    result = COPY.withdrawn(reveal.points);
  } else if (reveal.family === "mystery" && outcome.family === "mystery") {
    title = COPY.mysteryRow(meta.ordinal, categoryShortName(outcome.category));
    detail = COPY.answerWas(reveal.answer.display);
    result =
      reveal.solvedOn === null
        ? COPY.missed
        : COPY.solved(reveal.solvedOn, reveal.points);
  } else if (reveal.family === "encore") {
    const years = reveal.error.kind === "years";
    const unit = (value: number) =>
      `${formatValue(value, years)} ${reveal.unitShort}`.trim();
    title = COPY.encoreRow;
    detail = COPY.encoreLine(
      unit(reveal.guess),
      unit(reveal.answer),
      reveal.error.display,
    );
    result = reveal.band === null ? "" : COPY.bands[reveal.band];
  } else {
    title = COPY.choiceRow(meta.ordinal);
    result =
      outcome.family === "choice" && outcome.correct ? COPY.right : COPY.wrong;
  }
  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <p className="font-semibold">{title}</p>
      {detail === null ? null : <p className="text-base">{detail}</p>}
      {result === "" ? null : (
        <p className="text-sm text-muted-foreground">{result}</p>
      )}
    </li>
  );
}

function Results({
  results,
  nextUnlockAt,
}: {
  results: DailyResults;
  nextUnlockAt: EpochMs | null;
}) {
  const { attempt, summary } = results;
  const highContrast = useMemo(() => getSettingsStore().get().highContrast, []);
  const glyphs = highContrast ? HIGH_CONTRAST_GLYPHS : DEFAULT_GLYPHS;
  const rounds = [...attempt.resolved].sort(
    (a, b) => a.meta.index - b.meta.index,
  );
  const outcomes = rounds.map((round) => round.outcome);
  const payload = useMemo(
    () => dailySharePayload(attempt, { siteUrl: getSiteUrl(), highContrast }),
    [attempt, highContrast],
  );
  const lines = shareRowLines(shareRows(outcomes), glyphs, {
    category: categoryShortName,
    choiceRow: CHOICE_ROW_LABEL,
    voided: "voided",
  });
  const token = encoreToken(outcomes, glyphs);
  const dailyNumber = attempt.daily?.dailyNumber ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{COPY.heading(dailyNumber)}</h1>
        {attempt.daily === null ? null : (
          <p className="text-sm text-muted-foreground">
            {formatLongDate(attempt.daily.date)}
          </p>
        )}
        {attempt.kind === "archive" ? (
          <p className="w-fit rounded-full bg-muted px-3 py-1 text-sm">
            {COPY.archive}
          </p>
        ) : null}
      </header>

      <Card
        as="section"
        tone="ticket"
        aria-label={COPY.scoreLabel(summary.points, summary.maxPoints)}
      >
        <p className="text-4xl font-bold tabular-nums" data-score="">
          {COPY.score(summary.points, summary.maxPoints)}
        </p>
        <StreakLine summary={summary} />
        <div
          aria-hidden="true"
          className="mt-3 flex flex-col gap-1 text-base"
          data-score-rows=""
        >
          {lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {token === null ? null : <p>{token}</p>}
        </div>
      </Card>

      <section
        aria-labelledby="qz-share-heading"
        className="flex flex-col gap-2"
      >
        <h2 id="qz-share-heading" className="text-lg font-semibold">
          {COPY.shareHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{COPY.shareNote}</p>
        <pre
          data-share-text=""
          className="overflow-x-auto rounded-xl bg-muted p-3 font-sans text-base whitespace-pre-wrap"
        >
          {payload.text}
        </pre>
        <div className="flex flex-wrap gap-3">
          <ShareButton payload={payload} surface="stop" />
          <ChallengeButton attemptId={attempt.attemptId} />
        </div>
      </section>

      <section
        aria-labelledby="qz-rounds-heading"
        className="flex flex-col gap-1"
      >
        <h2 id="qz-rounds-heading" className="text-lg font-semibold">
          {COPY.roundsHeading}
        </h2>
        <ol className="flex flex-col">
          {rounds.map((round) => (
            <RoundRow key={round.meta.index} round={round} />
          ))}
        </ol>
      </section>

      <div className="flex flex-col items-start gap-2">
        <Link
          href="/"
          className={buttonClasses({ variant: "primary", block: true })}
        >
          {COPY.done}
        </Link>
        {nextUnlockAt === null ? null : <NextDaily at={nextUnlockAt} />}
        <Link
          href={"/practice" as Route}
          // Built by a later ticket: no prefetch, which would 404 until then.
          prefetch={false}
          className={buttonClasses({ variant: "text" })}
        >
          {COPY.practice}
        </Link>
      </div>
    </div>
  );
}

function Message({
  text,
  action,
}: {
  text: string;
  action: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <Card
      as="section"
      tone="sunken"
      className="flex flex-col items-start gap-3"
    >
      <p className="text-base">{text}</p>
      {action.href === undefined ? (
        <Button onClick={action.onClick}>{action.label}</Button>
      ) : (
        <Link
          href={action.href as Route}
          prefetch={false}
          className={buttonClasses({ variant: "secondary" })}
        >
          {action.label}
        </Link>
      )}
    </Card>
  );
}

export function StopScreen() {
  useSafePoint();
  const params = useParams<{ number: string }>();
  const dailyNumber = parseDailyNumber(Number(params.number));
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ResultsState>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
      if (dailyNumber === null) {
        if (live) setState({ kind: "elsewhere" });
        return;
      }
      try {
        await bootClient();
        const next = await loadResults(
          await getBackend(),
          dailyNumber,
          deviceZone(),
        );
        if (live) setState(next);
      } catch {
        if (live) setState({ kind: "error", code: "unreachable", refId: null });
      }
    })();
    return () => {
      live = false;
    };
  }, [dailyNumber, attempt]);

  const ready = state.kind === "ready" ? state.results : null;
  useEffect(() => {
    if (ready === null) return;
    track("results_view", {
      mode: ready.attempt.kind === "archive" ? "archive" : "daily",
    });
  }, [ready]);

  let body;
  switch (state.kind) {
    case "loading":
      body = <StopScreenSkeleton />;
      break;
    case "ready":
      body = (
        <Results results={state.results} nextUnlockAt={state.nextUnlockAt} />
      );
      break;
    case "not_finished":
      body = (
        <Message
          text={COPY.notFinished}
          action={{ label: COPY.playToday, href: "/daily" }}
        />
      );
      break;
    case "elsewhere":
      body = (
        <Message
          text={COPY.elsewhere}
          action={{ label: COPY.pastWeek, href: "/archive" }}
        />
      );
      break;
    case "error":
      body = (
        <Message
          text={state.code === "offline" ? COPY.offline : COPY.error}
          action={{
            label: COPY.tryAgain,
            onClick: () => {
              setState({ kind: "loading" });
              setAttempt((n) => n + 1);
            },
          }}
        />
      );
      break;
  }

  return (
    <PlayFrame header={{ leave: { href: "/", label: COPY.close } }}>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-6">
        {state.kind === "ready" ? null : (
          <h1 className="sr-only">{COPY.title}</h1>
        )}
        {body}
      </div>
    </PlayFrame>
  );
}
