"use client";

/**
 * The Daily's round area (PRD §3.1.3, DESIGN §12.2): the round label and
 * category chip, then the round itself from the round component registry
 * (§4.9), so the Daily renders any composition with no code change.
 *
 * - While Continue's `begin_round` is out, the next round's layout shows at
 *   once from its meta (label, chip, answer type) over a skeleton clue card,
 *   with "Checking…" after 1.5 s (AC-DLY-38's layout half).
 * - A withdrawn round never opened, so the screen draws its card (PRD
 *   §3.13.4); so too a round already resolved when the page reloaded.
 * - Focus: the round heading takes focus as a round opens; a round
 *   component marks its clue and reveal headings `data-qz-focus` to have
 *   the screen move focus there, except that a wrong guess leaves focus in
 *   the field, so the keyboard stays up (DESIGN §6.4).
 */
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { categoryById } from "@/content/loaders/categories";
import {
  ROUND_FAMILY,
  type RoundOutcome,
  type RoundReveal,
} from "@/engine/types";
import type { PlaySettings } from "@/features/rounds";
import { ROUND_COMPONENTS } from "@/features/rounds/client";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";
import { UI_COPY } from "@/ui/copy";
import { Loading, Skeleton } from "@/ui/skeleton";

import { DAILY_SCREEN_COPY } from "../client-copy";
import type { DailyController, DailySnapshot } from "../model/controller";
import { answerTypeLine, continueLabel, roundLabel } from "../model/labels";
import { answerListFor } from "./answer-lists";

const COPY = DAILY_SCREEN_COPY;

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
        data-qz-focus="reveal_heading"
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

/** A round that resolved before the page loaded: its result, then Continue. */
function ResolvedCard({
  reveal,
  outcome,
  label,
  onContinue,
}: {
  reveal: RoundReveal;
  outcome: RoundOutcome;
  label: string;
  onContinue: () => void;
}) {
  const answer = answerOf(reveal);
  return (
    <Card as="section" className="flex flex-col gap-3" data-round-resolved="">
      <h3
        data-qz-focus="reveal_heading"
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        {resolvedWords(outcome)}
      </h3>
      {answer === null ? null : <p className="text-base">{answer}</p>}
      <Button variant="primary" block onClick={onContinue}>
        {label}
      </Button>
    </Card>
  );
}

function RetryNotice({
  snapshot,
  controller,
}: {
  snapshot: DailySnapshot;
  controller: DailyController;
}) {
  const view = snapshot.view;
  const retry = view?.retry ?? null;
  if (view?.status === "offline") {
    // The alert itself was announced once, assertively (PRD §3.1.3).
    return <p className="text-base font-semibold">{COPY.lostConnection}</p>;
  }
  if (retry === null || retry.notice === "silent") return null;
  return (
    <div
      className="flex flex-col items-start gap-3"
      data-retry-notice={retry.notice}
    >
      <p className="text-base">{COPY.stillTrying}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => controller.retry()}>{COPY.tryAgain}</Button>
        {retry.notice === "fallback" ? (
          <Link
            href={"/practice" as Route}
            // Built by a later ticket: no prefetch, which would 404 until then.
            prefetch={false}
            className={buttonClasses({ variant: "text" })}
          >
            {COPY.practice}
          </Link>
        ) : null}
      </div>
    </div>
  );
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const focus = snapshot.focus;

  useEffect(() => {
    if (focus === null) return;
    if (focus.target === "round_heading") {
      headingRef.current?.focus();
      return;
    }
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
    area
      .querySelector<HTMLElement>(`[data-qz-focus="${focus.target}"]`)
      ?.focus();
  }, [focus]);

  const run = snapshot.run;
  const view = snapshot.view;
  const round = view?.round ?? null;
  const meta = round?.meta ?? null;
  const context = useMemo(
    () =>
      meta === null
        ? null
        : {
            mode: view?.mode ?? "daily",
            sealed: true,
            list: answerListFor(meta),
            itemRef: `daily:${snapshot.daily?.dailyNumber ?? 0}:${meta.index}`,
            settings,
          },
    [meta, view?.mode, snapshot.daily?.dailyNumber, settings],
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
  const category =
    family === "encore" || meta.category === null
      ? null
      : (categoryById(meta.category)?.name ?? null);
  const label = continueLabel(run);
  const onContinue = () => controller.continue();
  // The registry for mixed runs (§2.3); ordering has no v1 component.
  const Round = family === "ordering" ? null : ROUND_COMPONENTS[family];

  let body;
  if (round.open !== null && Round !== null) {
    body = (
      <Round
        meta={meta}
        open={round.open}
        client={round.client}
        status={view.status}
        reveal={round.reveal}
        error={view.error}
        onIntent={(intent) => controller.intent(intent)}
        onContinue={onContinue}
        continueLabel={label}
        context={context}
      />
    );
  } else if (round.reveal?.family === "withdrawn") {
    body = (
      <WithdrawnCard
        reveal={round.reveal}
        label={label}
        onContinue={onContinue}
      />
    );
  } else if (round.reveal !== null && round.outcome !== null) {
    body = (
      <ResolvedCard
        reveal={round.reveal}
        outcome={round.outcome}
        label={label}
        onContinue={onContinue}
      />
    );
  } else {
    const typeLine = answerTypeLine(meta);
    body = (
      <div className="flex flex-col gap-3" data-round-opening="">
        {typeLine === null ? null : <p className="text-base">{typeLine}</p>}
        <Loading label={COPY.loading} immediate>
          <Skeleton shape="block" />
        </Loading>
        {view.status === "checking" ? (
          <p className="text-sm text-muted-foreground">{UI_COPY.checking}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={areaRef}
      data-round-area=""
      data-round-index={meta.index}
      className="flex flex-col gap-4"
    >
      {snapshot.movedOn ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">{COPY.movedOn}</p>
      ) : null}
      <div className="flex flex-col gap-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground outline-none"
        >
          {roundLabel(meta)}
        </h2>
        {category === null ? null : (
          <p className="w-fit rounded-full border border-border px-3 py-1 text-sm font-semibold">
            {category}
          </p>
        )}
      </div>
      {body}
      <RetryNotice snapshot={snapshot} controller={controller} />
    </div>
  );
}
