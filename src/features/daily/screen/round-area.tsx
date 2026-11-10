"use client";

/**
 * The Daily's round area (PRD §3.1.3, DESIGN §12.2): the round itself from
 * the round component registry (§4.9), so the Daily renders any composition
 * with no code change, and what only the screen can draw around it.
 *
 * - A mounted round component owns the round's whole visual life (§4.4.3):
 *   its kicker, title and category chip, the stake indicator, the reveal
 *   and Continue. The area draws a round label and chip only where no
 *   component is mounted: while Continue's begin_round is out (the next
 *   round's layout at once from its meta, over a skeleton clue card, with
 *   "Checking…" after 1.5 s: AC-DLY-38's layout half), on a withdrawn
 *   round's card (PRD §3.13.4), and on the card of a choice or Encore round
 *   that resolved before this page loaded. A Mystery that resolved before a
 *   reload shows its own reveal again, from the clue screen its reveal
 *   carries, misses included (DESIGN §12.2: a resume lands on the same
 *   screen; R1-22).
 * - Focus follows the run's focus commands to the element marked
 *   `data-focus-target` for that target, as MYS-1's rounds mark theirs; a
 *   mounted component focuses its own heading as it arrives, and a wrong
 *   guess leaves focus in the field, so the keyboard stays up (DESIGN §6.4).
 *   A reveal's heading takes focus without the browser's scroll, and its
 *   card then starts just below the sticky header, so the stamp and the
 *   round's kicker above the heading show too (R1-12).
 * - Below the round: a retry's notice in its own words (a lost request, or
 *   a rate limit, which reached us and used up nothing), the offline line
 *   where the round component doesn't draw one, "Checking…" for a slow
 *   finish, and Try again for a begin_round or finish that failed for good.
 * - The route's one `h1` (DESIGN §11, R1-34): a mounted round component
 *   draws its own, so the area adds the screen's only where none is.
 * - The round context carries the start's first-Daily flag, for the
 *   rounds' first-Daily hints (PRD §3.1.4, R1-04).
 */
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { categoryById } from "@/content/loaders/categories";
import {
  ROUND_FAMILY,
  type RoundFamily,
  type RoundIntent,
  type RoundMeta,
  type RoundOpen,
  type RoundOutcome,
  type RoundReveal,
} from "@/engine/types";
import { focusReveal, type PlaySettings } from "@/features/rounds";
import { ROUND_COMPONENTS } from "@/features/rounds/client";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { UI_COPY } from "@/ui/copy";
import { Loading, Skeleton } from "@/ui/skeleton";

import { DAILY_SCREEN_COPY } from "../client-copy";
import { PRACTICE_HREF } from "../links";
import type { DailyController, DailySnapshot } from "../model/controller";
import { answerTypeLine, continueLabel, roundLabel } from "../model/labels";
import { useRoundAnswerList } from "./answer-lists";

const COPY = DAILY_SCREEN_COPY;

/** Round components that draw the offline line under their own input (MYS-1). */
const DRAWS_OFFLINE: ReadonlySet<RoundFamily> = new Set(["mystery", "encore"]);
/** Round components with a withdrawn card of their own, for a void that lands mid-round (MYS-1). */
const DRAWS_WITHDRAWN: ReadonlySet<RoundFamily> = new Set([
  "mystery",
  "encore",
]);
/** The cards a reveal heading sits in: a round component's, or the area's own. */
const REVEAL_CARDS =
  "[data-reveal], [data-round-resolved], [data-round-withdrawn]";

type MysteryReveal = Extract<RoundReveal, { family: "mystery" }>;
type MysteryOpen = Extract<RoundOpen, { family: "mystery" }>;

function categoryOf(meta: RoundMeta): string | null {
  return ROUND_FAMILY[meta.type] === "encore" || meta.category === null
    ? null
    : (categoryById(meta.category)?.name ?? null);
}

/** A Wikipedia search, never a hand-typed article URL (PRD §3.0.3, §3.18.3). */
function learnMoreHref(topic: string): string {
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(topic)}`;
}

/**
 * The clue screen a Mystery's reveal closed, rebuilt from the reveal, which
 * carries all four clues and the round's misses (R1-22): what a round
 * resolved before this page loaded hands its component, so its reveal
 * stamps "Got there." after a wrong guess and says "You guessed ..." and
 * "You picked ..." as the live one did. The options themselves are gone;
 * the reveal names the one picked.
 */
function clueScreenOf(meta: RoundMeta, reveal: MysteryReveal): MysteryOpen {
  const clue = reveal.solvedOn ?? 4;
  return {
    family: "mystery",
    index: meta.index,
    clue,
    clues: reveal.clues.slice(0, clue),
    wrongGuesses: (reveal.wrongGuesses ?? []).map((g) => ({ ...g })),
    options: null,
    issuedAt: 0,
  };
}

/** The round label and chip, where no round component draws its own. */
function RoundHeader({ meta }: { meta: RoundMeta }) {
  const category = categoryOf(meta);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2
        tabIndex={-1}
        data-focus-target="round_heading"
        className="text-sm font-semibold text-muted-foreground outline-none"
      >
        {roundLabel(meta)}
      </h2>
      {category === null ? null : (
        // A flat label, never a pill that reads as a control (R1-27).
        <p className="flex">
          <Chip className="max-w-full whitespace-normal">{category}</Chip>
        </p>
      )}
    </div>
  );
}

function WithdrawnCard({
  reveal,
  label,
  onContinue,
}: {
  reveal: Extract<RoundReveal, { family: "withdrawn" }>;
  label: string;
  onContinue: () => void;
}) {
  return (
    <Card as="section" className="flex flex-col gap-4" data-round-withdrawn="">
      <h3
        data-focus-target="reveal_heading"
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        {COPY.withdrawn[reveal.round]}
      </h3>
      <Button variant="primary" block onClick={onContinue}>
        {label}
      </Button>
    </Card>
  );
}

function resolvedWords(outcome: RoundOutcome): string {
  const words = COPY.resumed;
  if (outcome.family === "mystery") {
    return outcome.solvedOn === null
      ? words.missed
      : words.solved(outcome.solvedOn, outcome.points);
  }
  if (outcome.family === "encore") {
    return words.lockedIn(outcome.error?.display ?? "");
  }
  return outcome.correct ? words.right : words.wrong;
}

function answerOf(reveal: RoundReveal): string | null {
  switch (reveal.family) {
    case "mystery":
      return reveal.answer.display;
    case "encore":
      return `${reveal.answer} ${reveal.unitShort}`.trim();
    default:
      return null;
  }
}

/**
 * A choice or Encore round that resolved before this page loaded: its
 * result, the explanation and Learn more, then Continue. Its component
 * can't redraw the reveal, which needs the question the snapshot doesn't
 * keep.
 */
function ResolvedCard({
  reveal,
  outcome,
  label,
  onContinue,
}: {
  reveal: Exclude<RoundReveal, { family: "withdrawn" }>;
  outcome: RoundOutcome;
  label: string;
  onContinue: () => void;
}) {
  const answer = answerOf(reveal);
  const words = COPY.resumed;
  return (
    <Card as="section" className="flex flex-col gap-3" data-round-resolved="">
      <h3
        data-focus-target="reveal_heading"
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        {resolvedWords(outcome)}
      </h3>
      {answer === null ? null : <p className="text-base">{answer}</p>}
      {reveal.explanation === "" ? null : (
        <p className="text-base">{reveal.explanation}</p>
      )}
      {reveal.learnMore === "" ? null : (
        <a
          href={learnMoreHref(reveal.learnMore)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={words.learnMoreLabel(reveal.learnMore)}
          className={buttonClasses({ variant: "ghost", className: "w-fit" })}
        >
          {words.learnMore}
        </a>
      )}
      <Button variant="primary" block onClick={onContinue}>
        {label}
      </Button>
    </Card>
  );
}

/** A begin_round or finish that failed for good: say so, and let the player try again. */
function FailedNotice({ controller }: { controller: DailyController }) {
  return (
    <div className="flex flex-col items-start gap-3" data-round-failed="">
      <p className="text-base">
        {COPY.failed.title} {COPY.failed.body}
      </p>
      <Button onClick={() => controller.retry()}>{COPY.tryAgain}</Button>
    </div>
  );
}

/** The next round's layout from its meta while begin_round is out (AC-DLY-38, PRD §3.1.4 Loading clue). */
function OpeningRound({
  meta,
  snapshot,
  controller,
}: {
  meta: RoundMeta;
  snapshot: DailySnapshot;
  controller: DailyController;
}) {
  const view = snapshot.view;
  const family = ROUND_FAMILY[meta.type];
  const typeLine = answerTypeLine(meta);
  // A stale begin_round resyncs by itself; anything else waits on Try again.
  const failed = view?.status === "error" && view.error?.code !== "stale";
  const checking = snapshot.slowOpen || view?.status === "checking";
  return (
    <div className="flex flex-col gap-3" data-round-opening="">
      <div className="flex items-start justify-between gap-3">
        <RoundHeader meta={meta} />
        {family === "mystery" ? (
          // Where the stake indicator sits once the round opens.
          <Skeleton width="8.5rem" height="2.75rem" className="shrink-0" />
        ) : null}
      </div>
      {typeLine === null ? null : <p className="text-base">{typeLine}</p>}
      {failed ? (
        <FailedNotice controller={controller} />
      ) : (
        <Loading
          label={
            family === "ordering" ? COPY.loading : COPY.loadingRound[family]
          }
          immediate
        >
          <Skeleton shape="block" />
        </Loading>
      )}
      {checking && !failed ? (
        <p className="text-sm text-muted-foreground">{UI_COPY.checking}</p>
      ) : null}
    </div>
  );
}

/** "Today's Daily, Daily #42": the route's heading when no round draws one. */
export function screenTitle(snapshot: DailySnapshot): string {
  return snapshot.daily === null
    ? COPY.title
    : `${COPY.title}, Daily #${snapshot.daily.dailyNumber}`;
}

function PracticeLink() {
  return (
    <Link
      href={PRACTICE_HREF}
      // Rarely followed: no prefetch.
      prefetch={false}
      className={buttonClasses({ variant: "text" })}
    >
      {COPY.practice}
    </Link>
  );
}

/** What a wait or a failure says below the round. */
function WaitNotice({
  snapshot,
  controller,
  family,
  mounted,
}: {
  snapshot: DailySnapshot;
  controller: DailyController;
  family: RoundFamily;
  mounted: boolean;
}) {
  const view = snapshot.view;
  if (view === null) return null;
  if (
    view.phase === "finishing" &&
    view.status === "error" &&
    view.error?.code !== "stale"
  ) {
    return <FailedNotice controller={controller} />;
  }
  if (view.status === "offline") {
    // The alert itself was announced once, assertively (PRD §3.1.3).
    if (mounted && DRAWS_OFFLINE.has(family)) return null;
    return <p className="text-base font-semibold">{COPY.lostConnection}</p>;
  }
  const retry = view.retry;
  if (retry !== null && retry.notice !== "silent") {
    const text =
      retry.code !== "rate_limited"
        ? COPY.stillTrying
        : retry.notice === "action"
          ? COPY.busyLonger
          : COPY.busy;
    return (
      <div
        className="flex flex-col items-start gap-3"
        data-retry-notice={retry.notice}
      >
        <p className="text-base">{text}</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => controller.retry()}>{COPY.tryAgain}</Button>
          {retry.notice === "fallback" ? <PracticeLink /> : null}
        </div>
      </div>
    );
  }
  if (
    view.phase === "finishing" &&
    (snapshot.slowOpen || view.status === "checking")
  ) {
    return <p className="text-sm text-muted-foreground">{UI_COPY.checking}</p>;
  }
  return null;
}

export function RoundArea({
  snapshot,
  controller,
  settings,
}: {
  snapshot: DailySnapshot;
  controller: DailyController;
  settings: PlaySettings;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const focus = snapshot.focus;
  const run = snapshot.run;
  const view = snapshot.view;
  const round = view?.round ?? null;
  const meta = round?.meta ?? null;
  const list = useRoundAnswerList(meta);

  useEffect(() => {
    if (focus === null) return;
    const area = areaRef.current;
    if (area === null) return;
    const active = document.activeElement;
    if (
      focus.target === "clue_heading" &&
      active instanceof HTMLInputElement &&
      area.contains(active)
    ) {
      return;
    }
    const target = area.querySelector<HTMLElement>(
      // A list of words: one element can answer two commands (the
      // Mystery's options group, R4-11).
      `[data-focus-target~="${focus.target}"]`,
    );
    if (focus.target === "reveal_heading") {
      // Without the browser's scroll, which would leave the reveal's stamp
      // and kicker under the sticky header: its card starts below it (R1-12).
      focusReveal(target, target?.closest<HTMLElement>(REVEAL_CARDS) ?? null);
      return;
    }
    target?.focus();
  }, [focus]);

  const context = useMemo(
    () =>
      meta === null
        ? null
        : {
            mode: view?.mode ?? "daily",
            sealed: true,
            list,
            itemRef: `daily:${snapshot.daily?.dailyNumber ?? 0}:${meta.index}`,
            settings,
            // The start's first-Daily flag: the rounds' first-Daily hints
            // (PRD §3.1.4, §3.1.5; R1-04).
            firstDaily: snapshot.firstDaily,
          },
    [
      meta,
      view?.mode,
      list,
      snapshot.daily?.dailyNumber,
      settings,
      snapshot.firstDaily,
    ],
  );
  if (
    run === null ||
    view === null ||
    round === null ||
    meta === null ||
    context === null
  ) {
    return null;
  }

  const family = ROUND_FAMILY[meta.type];
  const label = continueLabel(run);
  const onContinue = () => controller.continue();
  const onIntent = (intent: RoundIntent) => controller.intent(intent);
  // The registry for mixed runs (§2.3); ordering has no v1 component.
  const Round = family === "ordering" ? null : ROUND_COMPONENTS[family];
  const reveal = round.reveal;
  const roundProps = (open: RoundOpen) => ({
    meta,
    open,
    client: round.client,
    status: view.status,
    reveal,
    error: view.error,
    onIntent,
    onContinue,
    continueLabel: label,
    context,
  });

  let body;
  let mounted = false;
  if (
    Round !== null &&
    round.open !== null &&
    (reveal?.family !== "withdrawn" || DRAWS_WITHDRAWN.has(family))
  ) {
    mounted = true;
    body = <Round {...roundProps(round.open)} />;
  } else if (reveal?.family === "withdrawn") {
    body = (
      <>
        <RoundHeader meta={meta} />
        <WithdrawnCard reveal={reveal} label={label} onContinue={onContinue} />
      </>
    );
  } else if (Round !== null && reveal?.family === "mystery") {
    mounted = true;
    body = <Round {...roundProps(clueScreenOf(meta, reveal))} />;
  } else if (reveal !== null && round.outcome !== null) {
    body = (
      <>
        <RoundHeader meta={meta} />
        <ResolvedCard
          reveal={reveal}
          outcome={round.outcome}
          label={label}
          onContinue={onContinue}
        />
      </>
    );
  } else {
    body = (
      <OpeningRound meta={meta} snapshot={snapshot} controller={controller} />
    );
  }

  return (
    <div
      ref={areaRef}
      data-round-area=""
      data-round-index={meta.index}
      className="flex flex-col gap-4"
    >
      {mounted ? null : (
        // One h1 per route (DESIGN §11, R1-34): a mounted round draws its
        // own, so the screen names itself only where none is drawn.
        <h1 className="sr-only">{screenTitle(snapshot)}</h1>
      )}
      {snapshot.movedOn ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">{COPY.movedOn}</p>
      ) : null}
      {body}
      <WaitNotice
        snapshot={snapshot}
        controller={controller}
        family={family}
        mounted={mounted}
      />
    </div>
  );
}
