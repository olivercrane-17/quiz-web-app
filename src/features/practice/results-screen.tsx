"use client";

/**
 * Practice results, /practice/results (DESIGN §12.11, PRD §3.3.1): the
 * score, every question as a compact row with its verdict, the answer and
 * an expandable explanation, and Play again with the same settings. A
 * results screen is a safe point for app updates (§10.7). There is no
 * challenge action: practice is never issued as a challenge (AC-PRA-11).
 *
 * It shows the run that just finished in this tab, or after a reload the
 * newest one in the history, with the questions' words from today's packs.
 * The score is the page's heading and takes focus when the results arrive,
 * since the Continue that brought the player here is gone. Play again
 * replaces this page, as the finish replaced the run, so one Back from any
 * results reaches Today. The best-moment line, Change category and Share
 * join it with PRA-2.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { loadPracticePool } from "@/content/loaders/practice";
import { track } from "@/features/analytics/track";
import { bootClient } from "@/features/identity";
import { useSafePoint } from "@/features/pwa/safe-point";
import { PlayFrame } from "@/features/shell";
import { getKv } from "@/platform/storage";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { cx } from "@/ui/cx";
import { CheckIcon, CrossIcon } from "@/ui/icons";
import { Loading, Skeleton, SkeletonText } from "@/ui/skeleton";

import type { PracticeCategoryLabels } from "./categories";
import { PRACTICE_CLIENT_COPY as COPY } from "./client-copy";
import { writePracticeIntent } from "./intent";
import { lastFinishedRunId } from "./model/last-run";
import { findHistoryEntry, type PracticeHistoryEntry } from "./model/storage";
import { resultRows, type ResultRow } from "./model/summary";
import { QuickPlayLink } from "./quick-play-link";

type Results =
  | { kind: "loading" }
  | { kind: "none" }
  | {
      kind: "ready";
      entry: PracticeHistoryEntry;
      rows: ResultRow[];
      loaded: boolean;
    };

/** The verdict, the question's number and, when known, the answer. */
function RowLine({ row }: { row: ResultRow }) {
  return (
    <>
      {/* Wraps between its words at 320 px and 200% text. */}
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 font-bold">
        {row.correct ? <CheckIcon size={16} /> : <CrossIcon size={16} />}
        <span>{COPY.results.question(row.number)}</span>
        <span aria-hidden="true">·</span>
        <span>{row.correct ? COPY.results.right : COPY.results.wrong}</span>
      </span>
      {row.answer === null ? null : (
        <>
          {" "}
          <span className="min-w-0 break-words">
            {COPY.results.answer(row.answer)}
          </span>
        </>
      )}
    </>
  );
}

const LINE =
  "flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 py-2 text-base";

/**
 * One compact row per question (DESIGN §12.11): the line above, which opens
 * to the question, the pick and the explanation, so ten rows leave Play
 * again within the second screen. The summary holds the row's whole line,
 * so every disclosure has a name of its own. `loaded`: the packs came back,
 * so a missing item really left its pack.
 */
function QuestionRow({ row, loaded }: { row: ResultRow; loaded: boolean }) {
  return (
    <li
      data-result-row={row.correct ? "right" : "wrong"}
      className="border-b border-foreground/15 last:border-b-0"
    >
      {row.item === null ? (
        <div className="flex flex-col pb-2">
          <p className={LINE}>
            <RowLine row={row} />
          </p>
          {loaded ? (
            <p className="text-base text-muted-foreground">
              {COPY.results.withdrawn}
            </p>
          ) : null}
        </div>
      ) : (
        <details className="group text-base">
          <summary
            className={cx(
              LINE,
              "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
            )}
          >
            <RowLine row={row} />{" "}
            <span className="ms-auto inline-flex items-center gap-1 font-semibold text-muted-foreground">
              {COPY.results.why}
              <span
                aria-hidden="true"
                className="inline-block group-open:rotate-180"
              >
                ▾
              </span>
            </span>
          </summary>
          <div className="flex flex-col gap-1 pb-3">
            <p className="font-semibold">{row.item.stem}</p>
            {row.chosen === null ? null : (
              <p className="text-muted-foreground">
                {COPY.results.yourAnswer(row.chosen)}
              </p>
            )}
            <p>{row.item.explanation}</p>
          </div>
        </details>
      )}
    </li>
  );
}

export function PracticeResultsScreen({
  categories,
}: {
  categories: PracticeCategoryLabels;
}) {
  useSafePoint();
  const router = useRouter();
  const [results, setResults] = useState<Results>({ kind: "loading" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ready = results.kind === "ready";

  useEffect(() => {
    let live = true;
    void (async () => {
      await bootClient();
      if (!live) return;
      const entry = findHistoryEntry(getKv(), lastFinishedRunId());
      if (entry === null) {
        setResults({ kind: "none" });
        return;
      }
      const pool = await loadPracticePool(entry.request.category);
      if (!live) return;
      setResults({
        kind: "ready",
        entry,
        rows: resultRows(entry, pool.ok ? pool.value : []),
        loaded: pool.ok,
      });
      track("results_view", { mode: "practice" });
    })();
    return () => {
      live = false;
    };
  }, []);

  // Focus would otherwise fall to the page: it goes to the score, the
  // screen's heading (DESIGN §11).
  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [ready]);

  let body;
  if (results.kind === "loading") {
    body = (
      <Loading label={COPY.results.loading} className="flex flex-col gap-4">
        <span className="flex flex-col gap-4">
          <Skeleton width="30%" height="48px" />
          <SkeletonText lines={4} />
        </span>
      </Loading>
    );
  } else if (results.kind === "none") {
    body = (
      <div className="flex flex-col items-start gap-4 py-6">
        <h1 className="text-2xl font-bold">{COPY.results.none.title}</h1>
        <p className="text-base">{COPY.results.none.body}</p>
        <QuickPlayLink className={buttonClasses({ variant: "primary" })}>
          {COPY.quickPlay}
        </QuickPlayLink>
      </div>
    );
  } else {
    const { entry, rows, loaded } = results;
    const request = entry.request;
    const category =
      request.category === "mixed"
        ? COPY.mixed
        : (categories[request.category]?.name ?? COPY.mixed);
    body = (
      <>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-muted-foreground">
            {COPY.practice} · {category}
          </p>
          {/* Heard as "Practice done. 7 out of 10.", seen as the score. */}
          <h1
            ref={headingRef}
            tabIndex={-1}
            data-practice-score=""
            className="flex flex-wrap items-baseline gap-x-2 font-bold tabular-nums outline-none"
          >
            <span className="sr-only">{COPY.results.done} </span>
            <span className="text-6xl leading-none">{entry.score}</span>{" "}
            <span className="text-xl">
              {COPY.results.outOf(entry.maxPoints)}
            </span>
            <span className="sr-only">.</span>
          </h1>
        </div>
        <section aria-labelledby="practice-results-questions">
          <h2 id="practice-results-questions" className="text-lg font-bold">
            {COPY.results.questions}
          </h2>
          {loaded ? null : (
            <p className="text-base text-muted-foreground">
              {COPY.results.failed}
            </p>
          )}
          <ol role="list">
            {rows.map((row) => (
              <QuestionRow key={row.number} row={row} loaded={loaded} />
            ))}
          </ol>
        </section>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="primary"
            onClick={() => {
              writePracticeIntent({
                v: 1,
                mode: request.mode,
                category: request.category,
                difficulty: request.difficulty,
                ...(request.repeats ? { repeats: true } : {}),
              });
              // Replaced, as the finish replaced the run with these results,
              // so one Back from the next results still reaches Today.
              router.replace("/practice/run");
            }}
          >
            {COPY.results.playAgain}
          </Button>
        </div>
      </>
    );
  }

  return (
    <PlayFrame header={{ leave: { href: "/", label: COPY.results.close } }}>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-4">
        {body}
      </div>
    </PlayFrame>
  );
}
