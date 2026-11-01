"use client";

/**
 * A practice round, /practice/run (DESIGN §12.7, PRD §3.3.1): the focus-mode
 * header (Leave, "Practice" over the category, ten segments), then the
 * question from ChoiceRound, its reveal and Continue. Untimed: no clock
 * anywhere (AC-PRA-12). The last Continue reads "See your results" and the
 * run's results replace this page in the history, so Back goes to Today.
 *
 * On mount, after `bootClient()`, the controller begins: a request left by
 * Quick play or Play again starts a new run, and with none the unfinished
 * run carries on, so a reload lands on the same question (invariant 8).
 * The server render is the loading state, so hydration never differs.
 */
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { CategoryId, DifficultyChoice } from "@/engine/types";
import { bootClient } from "@/features/identity";
import { playSettingsFrom, type PlaySettings } from "@/features/rounds";
import { ChoiceRound } from "@/features/rounds/client";
import { PlayFrame } from "@/features/shell";
import { DEFAULT_SETTINGS, getSettingsStore } from "@/platform/settings/store";
import { Button } from "@/ui/button";
import { ProgressSegments, type ProgressSegment } from "@/ui/progress-segments";
import { Loading, Skeleton, SkeletonText } from "@/ui/skeleton";

import { categorySlugs, type PracticeCategoryLabels } from "./categories";
import { PRACTICE_CLIENT_COPY as COPY } from "./client-copy";
import { takePracticeIntent } from "./intent-read";
import {
  getPracticeController,
  setPracticeCategorySlugs,
} from "./model/browser";
import {
  IDLE_PRACTICE_STATE,
  type PracticeMark,
  type PracticeState,
} from "./model/controller";
import type { PracticeRunRequest } from "./model/storage";

const DEFAULT_PLAY_SETTINGS: PlaySettings = playSettingsFrom(
  DEFAULT_SETTINGS,
  false,
);

const subscribe = (listener: () => void) =>
  getPracticeController().subscribe(listener);
const getSnapshot = () => getPracticeController().getState();
const getServerSnapshot = () => IDLE_PRACTICE_STATE;

/** The run's settings, live: shortcuts, motion, sound, haptics, auto-advance. */
function usePlaySettings(): PlaySettings {
  const [settings, setSettings] = useState(DEFAULT_PLAY_SETTINGS);
  useEffect(() => {
    let live = true;
    const cleanups: (() => void)[] = [];
    void bootClient().then(() => {
      if (!live) return;
      const store = getSettingsStore();
      const media =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-reduced-motion: reduce)")
          : null;
      const update = () =>
        setSettings(playSettingsFrom(store.get(), media?.matches ?? false));
      update();
      cleanups.push(store.subscribe(update));
      if (media !== null) {
        media.addEventListener("change", update);
        cleanups.push(() => media.removeEventListener("change", update));
      }
    });
    return () => {
      live = false;
      for (const cleanup of cleanups) cleanup();
    };
  }, []);
  return settings;
}

function categoryName(
  category: CategoryId | "mixed" | undefined,
  labels: PracticeCategoryLabels,
): string | null {
  if (category === undefined || category === "mixed") return null;
  return labels[category]?.name ?? null;
}

/** "Hard Geography questions", "Medium questions", "practice questions". */
function areaWords(request: PracticeRunRequest, category: string | null) {
  const difficulty: DifficultyChoice = request.difficulty;
  const words = [
    difficulty === "mixed" ? null : COPY.difficulty[difficulty],
    category,
  ].filter((word): word is string => word !== null);
  return `${words.length === 0 ? "practice" : words.join(" ")} questions`;
}

function segments(
  marks: readonly PracticeMark[],
  index: number,
): ProgressSegment[] {
  return marks.map((mark, i) => {
    const n = i + 1;
    const current = i === index;
    if (mark === "right") {
      return { status: "correct", current, label: COPY.run.segment.right(n) };
    }
    if (mark === "wrong") {
      return { status: "wrong", current, label: COPY.run.segment.wrong(n) };
    }
    return {
      status: "upcoming",
      current,
      label: current
        ? COPY.run.segment.current(n)
        : COPY.run.segment.upcoming(n),
    };
  });
}

function RunHeading({
  state,
  labels,
}: {
  state: PracticeState;
  labels: PracticeCategoryLabels;
}) {
  const name =
    state.request === null
      ? null
      : (categoryName(state.request.category, labels) ?? COPY.mixed);
  const view = state.view;
  const right = state.marks.filter((mark) => mark === "right").length;
  const wrong = state.marks.filter((mark) => mark === "wrong").length;
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <p className="flex min-h-5 items-baseline gap-2 text-sm leading-tight">
        <span className="text-muted-foreground">{COPY.practice}</span>
        {name === null ? null : <strong>{name}</strong>}
      </p>
      {view === null || view.total === null ? null : (
        <ProgressSegments
          variant="bar"
          label={COPY.run.progress(
            Math.min(view.index + 1, view.total),
            view.total,
            right,
            wrong,
          )}
          segments={segments(state.marks, view.index)}
        />
      )}
    </div>
  );
}

function RunSkeleton() {
  return (
    <Loading label={COPY.run.loading} className="flex flex-col gap-4">
      <span className="flex flex-col gap-4">
        <Skeleton width="40%" />
        <SkeletonText lines={2} />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} shape="block" height="56px" />
        ))}
      </span>
    </Loading>
  );
}

function Message({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-4 py-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {body === undefined ? null : <p className="text-base">{body}</p>}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

export function PracticeRunScreen({
  categories,
}: {
  categories: PracticeCategoryLabels;
}) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const settings = usePlaySettings();
  const router = useRouter();
  const navigatedFor = useRef<string | null>(null);

  useEffect(() => {
    setPracticeCategorySlugs(categorySlugs(categories));
  }, [categories]);

  useEffect(() => {
    let live = true;
    void bootClient().then(() => {
      if (!live) return;
      // Read once and gone, so a reload resumes instead of starting again.
      void getPracticeController().begin(takePracticeIntent());
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onChange = () =>
      getPracticeController().visibility(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (state.status !== "finished" || state.runId === null) return;
    if (navigatedFor.current === state.runId) return;
    navigatedFor.current = state.runId;
    router.replace("/practice/results");
  }, [state.status, state.runId, router]);

  const start = (request: PracticeRunRequest) => {
    void getPracticeController().start(request);
  };
  const category = categoryName(state.request?.category, categories);

  let body: ReactNode;
  const view = state.view;
  const round = view?.round ?? null;
  if (
    (state.status === "playing" || state.status === "finished") &&
    view !== null &&
    round !== null &&
    round.open !== null
  ) {
    const item = state.items[view.index];
    const note =
      view.index === 0 && state.request !== null
        ? state.notes.includes("hard_filled")
          ? COPY.run.notes.hardFilled(category)
          : state.notes.includes("repeats_mixed_in")
            ? COPY.run.notes.repeats(areaWords(state.request, category))
            : null
        : null;
    body = (
      <>
        {note === null ? null : (
          <p data-practice-note="" className="text-base text-muted-foreground">
            {note}
          </p>
        )}
        <ChoiceRound
          meta={round.meta}
          open={round.open}
          client={round.client}
          status={view.status}
          reveal={round.reveal}
          error={view.error}
          onIntent={(intent) => getPracticeController().answer(intent)}
          onContinue={() => getPracticeController().continue()}
          continueLabel={
            view.isLast ? COPY.run.seeResults : COPY.run.nextQuestion
          }
          context={{
            mode: view.mode,
            sealed: false,
            list: null,
            itemRef: item?.id ?? "",
            settings,
          }}
        />
      </>
    );
  } else if (state.status === "failed") {
    body =
      state.error === "offline" ? (
        <Message title={COPY.run.offline.title} body={COPY.run.offline.body}>
          <Button
            variant="primary"
            onClick={() =>
              start({
                mode: "category",
                category: "mixed",
                difficulty: state.request?.difficulty ?? "mixed",
                repeats: false,
              })
            }
          >
            {COPY.run.offline.playMixed}
          </Button>
        </Message>
      ) : (
        <Message title={COPY.run.failed.title} body={COPY.run.failed.body}>
          <Button
            variant="primary"
            onClick={() => void getPracticeController().retry()}
          >
            {COPY.run.failed.retry}
          </Button>
        </Message>
      );
  } else if (state.status === "empty") {
    body = (
      <Message title={COPY.run.empty.title}>
        <Button
          variant="primary"
          onClick={() =>
            start({
              mode: "category",
              category: "mixed",
              difficulty: "mixed",
              repeats: false,
            })
          }
        >
          {COPY.run.empty.playMixed}
        </Button>
      </Message>
    );
  } else if (state.status === "exhausted" && state.request !== null) {
    const request = state.request;
    body = (
      <Message title={COPY.run.exhausted.title(category ?? COPY.mixed)}>
        <Button
          variant="primary"
          onClick={() =>
            start({ ...request, category: "mixed", repeats: false })
          }
        >
          {COPY.run.exhausted.hardMixed}
        </Button>
        <Button onClick={() => start({ ...request, repeats: true })}>
          {COPY.run.exhausted.repeats}
        </Button>
      </Message>
    );
  } else {
    body = <RunSkeleton />;
  }
  return (
    <PlayFrame
      header={{
        leave: { href: "/", label: COPY.run.leave },
        progress: <RunHeading state={state} labels={categories} />,
      }}
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4">
        {body}
      </div>
    </PlayFrame>
  );
}
