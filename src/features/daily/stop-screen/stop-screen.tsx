"use client";

/**
 * The stop screen, greybox (PRD §3.1.6, DESIGN §12.4): the score card with
 * the rows exactly as the share renders them, the legend and the total
 * time, the share text with Share, the rounds, and "Done for today" with
 * the countdown to the next Daily. DLY-3 builds the rest in its order
 * (best moment, percentile, Groups, the histogram, review your misses, the
 * offer card).
 *
 * What RITE round 1 added (FIX-DLY): Share itself (R1-01), in a share box
 * a keyboard can select on its own (a read-only text box, so Ctrl+A takes
 * the share and never the answers around it); the one-line legend under
 * the grid (D3, R1-16), which screen readers hear as well and which
 * describes the share box; the total time, which only breaks ties (D7); the
 * Encore row's "Breaks ties. Scores no points." (D2, R1-07); focus on the
 * results heading once they load (R1-34); no Past 7 days link until the
 * archive has a route (R1-02); and nothing that scrolls sideways at 200%
 * text or with text spacing (AC-A11Y-04).
 *
 * The island reads the Daily number from the URL inside <Suspense> (§10.2
 * rule 2) and loads after the client boot; the data refetches on every
 * visit.
 */
import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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
import { revealWholeBox, ShareButton } from "@/features/share/share-button";
import { PlayFrame } from "@/features/shell";
import { ScrollInset } from "@/features/shell/client";
import { StreakLine } from "@/features/streaks/stop-screen-line";
import { getServerClock } from "@/platform/server-clock";
import { getSettingsStore } from "@/platform/settings/store";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";
import { Loading, Skeleton, SkeletonText } from "@/ui/skeleton";

import { STOP_SCREEN_COPY } from "../client-copy";
import { glyphsFor } from "../glyphs";
import { ARCHIVE_HREF, PRACTICE_HREF } from "../links";
import { deviceZone } from "../model/browser";
import { formatStopwatch } from "../model/labels";
import {
  SHARE_LABELS,
  categoryShortName,
  dailyLegend,
  dailySharePayload,
} from "../share";
import { waitWords } from "../words";
import { loadResults, type ResultsState } from "./results-loader";

const COPY = STOP_SCREEN_COPY;
/** "No answers inside.", which describes the share box. */
const NOTE_ID = "qz-share-note";
/** The grid's legend (D3), which describes the share box too. */
const LEGEND_ID = "qz-share-legend";

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

/** One row of "Your rounds": what it was, the answer, and how it went. */
export function RoundRow({ round }: { round: ResolvedRound }) {
  const { meta, outcome, reveal } = round;
  let title: string;
  let detail: string | null = null;
  /** The Encore's purpose for a solo player (D2, R1-07). */
  let note: string | null = null;
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
    note = COPY.encoreNote;
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
    <li
      className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0"
      data-round-row={outcome.family}
    >
      <p className="font-semibold">{title}</p>
      {note === null ? null : (
        <p className="text-sm text-muted-foreground">{note}</p>
      )}
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
  const glyphs = glyphsFor(highContrast);
  const rounds = [...attempt.resolved].sort(
    (a, b) => a.meta.index - b.meta.index,
  );
  const outcomes = rounds.map((round) => round.outcome);
  const payload = useMemo(
    () => dailySharePayload(attempt, { highContrast }),
    [attempt, highContrast],
  );
  const lines = shareRowLines(shareRows(outcomes), glyphs, SHARE_LABELS);
  const legend = dailyLegend(attempt, highContrast);
  const token = encoreToken(outcomes, glyphs);
  const dailyNumber = attempt.daily?.dailyNumber ?? 0;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Arriving from "See your results", the button that had focus is gone:
  // focus lands on the heading, not on <body> (R1-34), nor on the <main>
  // the shell caught the dropped focus with (R1-09). A player who has
  // already moved focus somewhere keeps it there.
  useLayoutEffect(() => {
    const heading = headingRef.current;
    const active = document.activeElement;
    if (
      heading !== null &&
      (active === null ||
        active === document.body ||
        (active !== heading && active.contains(heading)))
    ) {
      heading.focus();
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1
          ref={headingRef}
          tabIndex={-1}
          data-results-heading=""
          className="text-2xl font-bold outline-none"
        >
          {COPY.heading(dailyNumber)}
        </h1>
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
        <p className="mt-1 text-sm font-semibold tabular-nums" data-time="">
          {COPY.time(formatStopwatch(summary.totalMs))}
        </p>
        <div
          aria-hidden="true"
          className="mt-3 flex flex-col gap-1 text-base"
          data-score-rows=""
        >
          {lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {token === null ? null : (
            // The token's no-break spaces keep it whole in a chat bubble;
            // on this card, at 200% text, it may wrap between its words.
            <p>{token.replaceAll("\u00a0", " ")}</p>
          )}
        </div>
        {/*
         * Outside the rows that only repeat the share text: a screen reader
         * hears the share box read its glyphs by name, and this says what
         * they mean (D3). The share box names it as a description too.
         */}
        {legend === null ? null : (
          // The ticket's own ink, as the time and the rows take it: a
          // muted grey on the eft fill fails AA contrast in both themes.
          <p id={LEGEND_ID} className="mt-2 text-sm" data-legend="">
            {legend}
          </p>
        )}
      </Card>

      <section
        aria-labelledby="qz-share-heading"
        className="flex flex-col gap-2"
      >
        <h2 id="qz-share-heading" className="text-lg font-semibold">
          {COPY.shareHeading}
        </h2>
        <p id={NOTE_ID} className="text-sm text-muted-foreground">
          {COPY.shareNote}
        </p>
        {/*
         * Read-only text, so it takes focus and Ctrl+A selects the share
         * alone, never the answers elsewhere on the page (R1-01).
         */}
        <textarea
          readOnly
          data-share-text=""
          aria-labelledby="qz-share-heading"
          aria-describedby={
            legend === null ? NOTE_ID : `${NOTE_ID} ${LEGEND_ID}`
          }
          value={payload.text}
          rows={payload.text.split("\n").length + 1}
          // A browser brings a text box's caret into view on focus, not
          // the box: the whole box comes clear of the dock (R1-12).
          onFocus={(event) => {
            revealWholeBox(event.currentTarget);
          }}
          className="field-sizing-content w-full resize-none rounded-xl bg-muted p-3 font-sans text-base outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-foreground"
        />
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

      {/*
       * The dock (DESIGN §12.4): "Done for today", the screen's one
       * primary, held at the bottom of the screen while the results scroll
       * under it. Its height is the page's bottom scroll inset, so keyboard
       * focus never lands under it (R1-12, WCAG 2.4.11), and toasts rise
       * above it (DESIGN §6.9). The next Daily and practice follow it in
       * the page, so at 200% text the dock stays one button tall.
       */}
      <div
        data-results-dock=""
        data-toast-anchor=""
        className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <ScrollInset edge="bottom" />
        <Link
          href="/"
          className={buttonClasses({ variant: "primary", block: true })}
        >
          {COPY.done}
        </Link>
      </div>
      <div className="flex flex-col items-start gap-2">
        {nextUnlockAt === null ? null : <NextDaily at={nextUnlockAt} />}
        <Link
          href={PRACTICE_HREF}
          // Rarely followed: no prefetch.
          prefetch={false}
          // The one long link here: it wraps at 200% text or with text
          // spacing instead of pushing the page sideways (AC-A11Y-04).
          className={buttonClasses({
            variant: "text",
            className: "text-left whitespace-normal!",
          })}
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
        // No Daily number in the address at all: nothing moved anywhere.
        if (live) setState({ kind: "not_found" });
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
          action={
            ARCHIVE_HREF === null
              ? { label: COPY.goToday, href: "/" }
              : { label: COPY.pastWeek, href: ARCHIVE_HREF }
          }
        />
      );
      break;
    case "not_found":
      body = (
        <Message
          text={COPY.notFound}
          action={{ label: COPY.goToday, href: "/" }}
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
