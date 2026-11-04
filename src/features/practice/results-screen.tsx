"use client";

/**
 * Practice results, /practice/results (DESIGN §12.11, PRD §3.3.1): the
 * score, Play again with the same settings and Share (PRD §3.5.4's text,
 * through the share feature's button), then every question as a compact
 * row with a short stem, its verdict, the answer and, on a miss, what the
 * player chose, opening to the explanation (decision D13, R1-17). A
 * results screen is a safe point for app updates (§10.7). There is no
 * challenge action: practice is never issued as a challenge (AC-PRA-11).
 *
 * It shows the run that just finished in this tab, or after a reload the
 * newest one in the history, with the questions' words from today's packs.
 * The score is the page's heading and takes focus when the results arrive,
 * since the Continue that brought the player here is gone. Play again
 * replaces this page, as the finish replaced the run, so one Back from any
 * results reaches Today. The best-moment line and Change category join it
 * with PRA-2.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { loadPracticePool } from "@/content/loaders/practice";
import { track } from "@/features/analytics/track";
import { bootClient } from "@/features/identity";
import { useSafePoint } from "@/features/pwa/safe-point";
import { ShareButton } from "@/features/share/share-button";
import { PlayFrame } from "@/features/shell";
import { getSiteUrl } from "@/lib/env";
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
import { practiceSharePayload } from "./share";

type Results =
  | { kind: "loading" }
  | { kind: "none" }
  | {
      kind: "ready";
      entry: PracticeHistoryEntry;
      rows: ResultRow[];
      loaded: boolean;
    };

/**
 * The score's closing period, which screen readers read and the eye doesn't
 * see. It stays an inline box: a hidden box taken out of the flow
 * (`sr-only`) is a block to the accessible-name computation, which pads it
 * with spaces ("7 out of 10 .", R1-34).
 */
const HIDDEN_PERIOD = "[clip-path:inset(50%)]";

/**
 * The row's lines (D13): the verdict's icon, then the question's number
 * and a short stem (two lines at most until the row opens), over the
 * verdict, the answer and, on a miss, what the player chose, with `hint`
 * last. Only the icon sits beside the text, so at 200% text the lines keep
 * the row's width instead of reading a word a line.
 */
function RowLines({
  row,
  loaded,
  hint = null,
}: {
  row: ResultRow;
  loaded: boolean;
  hint?: ReactNode;
}) {
  const first =
    row.item !== null
      ? COPY.results.numbered(row.number, row.item.stem)
      : loaded
        ? COPY.results.numbered(row.number, COPY.results.withdrawn)
        : COPY.results.question(row.number);
  const parts = [
    row.correct ? COPY.results.right : COPY.results.wrong,
    ...(row.answer === null ? [] : [COPY.results.answer(row.answer)]),
    ...(row.chosen === null ? [] : [COPY.results.yourAnswer(row.chosen)]),
  ];
  return (
    <>
      <span className="mt-1 shrink-0">
        {row.correct ? <CheckIcon size={16} /> : <CrossIcon size={16} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          data-result-stem=""
          className="line-clamp-2 font-semibold break-words group-open:line-clamp-none"
        >
          {first}
        </span>
        <span className="break-words text-muted-foreground">
          {COPY.results.line(parts)}
        </span>
        {hint}
      </span>
    </>
  );
}

const ROW = "flex min-h-11 items-start gap-3 py-3 text-base";

/**
 * One compact row per question (DESIGN §12.11, D13): the lines above,
 * which open to the whole stem and the explanation. The summary holds the
 * row's whole text, so every disclosure has a name of its own. `loaded`:
 * the packs came back, so a missing item really left its pack.
 */
function QuestionRow({ row, loaded }: { row: ResultRow; loaded: boolean }) {
  return (
    <li
      data-result-row={row.correct ? "right" : "wrong"}
      className="border-b border-foreground/15 last:border-b-0"
    >
      {row.item === null ? (
        <p className={ROW}>
          <RowLines row={row} loaded={loaded} />
        </p>
      ) : (
        <details className="group text-base">
          <summary
            className={cx(
              ROW,
              "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
            )}
          >
            <RowLines
              row={row}
              loaded={loaded}
              hint={
                // Under the lines, so the summary still reads "… You chose
                // Sorrel. Why".
                <span
                  data-result-why=""
                  className="inline-flex items-center gap-1 self-start font-semibold text-muted-foreground"
                >
                  {COPY.results.why}
                  <span
                    aria-hidden="true"
                    className="inline-block group-open:rotate-180"
                  >
                    ▾
                  </span>
                </span>
              }
            />
          </summary>
          {/* Under the text, past the icon's column. */}
          <p className="ps-7 pb-3">{row.item.explanation}</p>
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
              <span className={HIDDEN_PERIOD}>.</span>
            </span>
          </h1>
        </div>
        {/* Above the list, so they are on the first screen (D13): Play
            again, then Share, secondary (DESIGN §12.11). */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
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
          <ShareButton
            surface="practice"
            payload={practiceSharePayload(entry, {
              category,
              siteUrl: getSiteUrl(),
            })}
          />
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
