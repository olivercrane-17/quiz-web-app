"use client";

/**
 * Practice results, /practice/results (DESIGN §12.11, PRD §3.3.1): the
 * score, every question with its verdict, the answer and an expandable
 * explanation, and Play again with the same settings. A results screen is
 * a safe point for app updates (§10.7). There is no challenge action:
 * practice is never issued as a challenge (AC-PRA-11).
 *
 * It shows the run that just finished in this tab, or after a reload the
 * newest one in the history, with the questions' words from today's packs.
 * The best-moment line, Change category and Share join it with PRA-2.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { loadPracticePool } from "@/content/loaders/practice";
import { track } from "@/features/analytics/track";
import { bootClient } from "@/features/identity";
import { useSafePoint } from "@/features/pwa/safe-point";
import { PlayFrame } from "@/features/shell";
import { getKv } from "@/platform/storage";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
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

/** `loaded`: the packs came back, so a missing item really left its pack. */
function QuestionRow({ row, loaded }: { row: ResultRow; loaded: boolean }) {
  return (
    <li
      data-result-row={row.correct ? "right" : "wrong"}
      className="flex flex-col gap-1 border-b border-foreground/15 py-3 last:border-b-0"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        {row.correct ? <CheckIcon size={16} /> : <CrossIcon size={16} />}
        <span>{COPY.results.question(row.number)}</span>
        <span aria-hidden="true">·</span>
        <span>{row.correct ? COPY.results.right : COPY.results.wrong}</span>
      </p>
      {row.item === null ? (
        loaded ? (
          <p className="text-base text-muted-foreground">
            {COPY.results.withdrawn}
          </p>
        ) : null
      ) : (
        <>
          <p className="text-base font-semibold">{row.item.stem}</p>
          {row.answer === null ? null : (
            <p className="text-base">{COPY.results.answer(row.answer)}</p>
          )}
          {row.chosen === null ? null : (
            <p className="text-base text-muted-foreground">
              {COPY.results.yourAnswer(row.chosen)}
            </p>
          )}
          <details className="text-base">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">
              {COPY.results.why}
            </summary>
            <p>{row.item.explanation}</p>
          </details>
        </>
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
          <h1 className="sr-only">
            {COPY.results.heading(entry.score, entry.maxPoints)}
          </h1>
          <p
            aria-hidden="true"
            data-practice-score=""
            className="flex items-baseline gap-2 font-bold tabular-nums"
          >
            <span className="text-6xl leading-none">{entry.score}</span>
            <span className="text-xl">
              {COPY.results.outOf(entry.maxPoints)}
            </span>
          </p>
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
              router.push("/practice/run");
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
