"use client";

/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): multiple choice, true/false
 * and comparison rounds (PRD §3.0.3, §3.3.2; DESIGN §6.2, §6.10, §7.3), for
 * every mode that plays them: practice, Blitz, Survival, review, sealed
 * compositions, room phones and quizzes. Registered in ../registry.tsx;
 * practice imports it alone from `@/features/rounds/client`.
 *
 * - Layout: on phones the stem sits at the top and the options anchor to
 *   the bottom of the space the screen gives the round (a screen that
 *   wants the thumb zone gives it a full-height flex column), so they sit
 *   in the lower part and in the same place from one question to the next
 *   (PRD §3.0.3, DESIGN §10.2). From 768 px the options follow the stem.
 * - Commit on release: AnswerButton paints the press on `pointerdown` and
 *   commits on `click`, so sliding off cancels (WCAG 2.5.2). Keys 1 to 4 do
 *   the same, pressed on keydown and committed on keyup, only while focus
 *   is inside the question region and never with shortcuts off (WCAG 2.1.4).
 * - The beat: the pick locks at once and the verdict shows 400 ms
 *   (TUNABLES.answers.revealMs) after the commit, even when it came back
 *   sooner. A slower verdict shows when it lands, with "Checking…" past
 *   1.5 s. The practice controller itself holds its verdicts for the beat,
 *   so the run's header changes with the options; a verdict that lands
 *   within a frame of the beat's end shows in that same commit.
 * - The explanation sheet opens at 1.2 s under the options. The question
 *   keeps its height as the sheet joins, so nothing above the sheet moves;
 *   the page then scrolls just enough to show Continue, which lands at the
 *   bottom of the screen, where the answers were. On a short phone, under
 *   740 px tall, it opens compact (DESIGN §6.10): the verdict, the title,
 *   the explanation's first line with "Read more", and Continue. Otherwise
 *   it holds the verdict, the explanation, Learn more, the reveal actions
 *   and Continue. A tap anywhere, or a fresh Enter, first completes the
 *   automatic part at once; Enter on the sheet continues. A held key's
 *   repeats do neither. With auto-advance on, Continue fires by itself
 *   after 2 s plus 0.25 s a word, and any tap or key cancels it.
 * - Speech: the verdict goes to the polite status region as it shows at
 *   400 ms, from here, so it lands with what the eye sees ("Not quite. You
 *   chose Lyon. The answer is Paris."). Controllers drop the run machine's
 *   `announce` commands for choice verdicts (`correct`, `wrong_choice`), or
 *   the player would hear it twice. The sheet's heading carries the verdict
 *   too ("Not quite. It's Paris."), because the focus move to it cuts off
 *   speech in progress; a tap that opens the sheet before the verdict has
 *   been spoken leaves the heading as the only telling.
 * - Focus: the question's heading when a round opens; the sheet's title
 *   when the sheet opens (the reveal heading, as AC-DLY-18 asks), without
 *   the browser's own scroll, which Continue's replaces.
 * - A round that mounts with its reveal already there (a reload, a tab
 *   coming back) shows the sheet at once, with no beat and no speech.
 */
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import { TUNABLES } from "@/config/tunables";
import { wordCount } from "@/engine/text/metrics";
import type { RoundOpen, RoundReveal } from "@/engine/types";
import { analyticsMode } from "@/features/analytics/track";
import { RevealActions } from "@/features/reports/reveal-actions";
import { systemClock } from "@/platform/clock";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { AnswerButton, type AnswerState } from "@/ui/answer-button";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { UI_COPY } from "@/ui/copy";
import { cx } from "@/ui/cx";
import { CheckIcon, CrossIcon } from "@/ui/icons";
import { Sheet } from "@/ui/sheet";

import type { PlaySettings, RoundComponentProps } from "../contracts";
import { CHOICE_COPY, DIFFICULTY_PIPS, learnMoreUrl } from "./copy";

type ChoiceOpen = Extract<RoundOpen, { family: "choice" }>;
type ChoiceReveal = Extract<RoundReveal, { family: "choice" }>;
type Stage = "question" | "verdict" | "sheet";

const REVEAL_MS = TUNABLES.answers.revealMs;
/** DESIGN §7.3: the explanation sheet rises at 1.2 s. */
export const SHEET_AFTER_MS = 1200;
/**
 * A verdict that lands this close to the beat's end shows at once, in the
 * commit that brought it, rather than one task later: the practice header
 * shows its mark in that commit too.
 */
const BEAT_SLACK_MS = 16;
/** PRD §3.0.3: auto-advance waits 2 s plus 0.25 s per word. */
const AUTO_ADVANCE_MS = 2000;
const AUTO_ADVANCE_PER_WORD_MS = 250;
const SHORTCUT_KEYS = ["1", "2", "3", "4"];
/** DESIGN §6.2: 2 by 2 from 768 px only when every option is shorter. */
const GRID_LABEL_MAX = 24;
/**
 * DESIGN §6.10: short phones, under 740 px tall, get the compact sheet. A
 * phone is a narrow screen or a touch screen: a laptop's window is often
 * under 740 px too, and there the full sheet fits under the options.
 */
export const SHORT_SCREEN_QUERY =
  "(max-height: 739px) and (max-width: 767px), (max-height: 739px) and (pointer: coarse)";

function shortScreen(): MediaQueryList | null {
  return typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(SHORT_SCREEN_QUERY);
}

function subscribeShortScreen(listener: () => void): () => void {
  const media = shortScreen();
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}

/** True on a short phone; false on the server and without matchMedia. */
function useShortScreen(): boolean {
  return useSyncExternalStore(
    subscribeShortScreen,
    () => shortScreen()?.matches ?? false,
    () => false,
  );
}

function labelAt(open: ChoiceOpen, index: number | null): string {
  if (index === null) return "";
  return open.options.find((option) => option.index === index)?.label ?? "";
}

export function verdictText(open: ChoiceOpen, reveal: ChoiceReveal): string {
  const answer = labelAt(open, reveal.correctIndex);
  return reveal.correct
    ? CHOICE_COPY.status.correct(answer)
    : CHOICE_COPY.status.wrong(labelAt(open, reveal.chosenIndex), answer);
}

/** What the verdict sounds and feels like, besides its words (DESIGN §7.3, §8, §9). */
function feel(reveal: ChoiceReveal, settings: PlaySettings): void {
  if (settings.sound) playEffect(reveal.correct ? "correct" : "wrong");
  if (settings.haptics) {
    vibrate(reveal.correct ? HAPTICS.correct : HAPTICS.wrong);
  }
}

function isControl(target: EventTarget): boolean {
  return (
    target instanceof Element &&
    target.closest("a, button, input, select, textarea") !== null
  );
}

function Pips({ filled }: { filled: number }) {
  return (
    <span aria-hidden="true" className="tracking-tight">
      {"●".repeat(filled)}
      {"○".repeat(3 - filled)}
    </span>
  );
}

export function ChoiceRound(props: RoundComponentProps) {
  const { open } = props;
  if (open.family !== "choice") return null;
  // Each round starts fresh: its own beat, focus and held key.
  return <ChoiceRoundView key={open.index} {...props} open={open} />;
}

function ChoiceRoundView({
  meta,
  open,
  status,
  reveal,
  error,
  onIntent,
  onContinue,
  continueLabel,
  context,
}: Omit<RoundComponentProps, "open"> & { open: ChoiceOpen }) {
  const settings = context.settings;
  const choiceReveal = reveal?.family === "choice" ? reveal : null;
  const [stage, setStage] = useState<Stage>(() =>
    reveal?.family === "choice" ? "sheet" : "question",
  );
  /** The option committed here, until its verdict shows. */
  const [picked, setPicked] = useState<number | null>(null);
  /** The option whose shortcut key is down. */
  const [held, setHeld] = useState<number | null>(null);
  const [autoCancelled, setAutoCancelled] = useState(false);
  /** The question's height when the sheet joined it, kept so nothing moves. */
  const [questionHeight, setQuestionHeight] = useState<number | null>(null);
  /** The compact sheet's explanation, opened by "Read more". */
  const [expanded, setExpanded] = useState(false);
  /** Mounted with its reveal there: no beat, no speech, no auto-advance. */
  const [startedRevealed] = useState(reveal?.family === "choice");
  const compact = useShortScreen();
  const committedAt = useRef<number | null>(null);
  const spoken = useRef(reveal?.family === "choice");
  const questionRef = useRef<HTMLDivElement>(null);
  const stemRef = useRef<HTMLHeadingElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const explanationRef = useRef<HTMLParagraphElement>(null);
  const autoLineRef = useRef<HTMLSpanElement>(null);
  const stemId = useId();
  const explanationId = useId();

  const waiting =
    status === "judging" || status === "checking" || status === "offline";
  const shown = choiceReveal !== null && stage !== "question";
  const sheetOpen = stage === "sheet" && choiceReveal !== null;
  const interactive =
    choiceReveal === null &&
    stage === "question" &&
    (status === "idle" || status === "error");
  const lockedIndex =
    choiceReveal !== null || waiting
      ? (picked ?? choiceReveal?.chosenIndex ?? null)
      : null;
  const shortcutsOn = settings.shortcuts && interactive;

  /** The verdict's cues, once: spoken at the 400 ms reveal, felt either way. */
  const cue = (aloud: boolean) => {
    if (choiceReveal === null || spoken.current) return;
    spoken.current = true;
    if (aloud) announce(verdictText(open, choiceReveal));
    feel(choiceReveal, settings);
  };
  const openSheet = () => {
    setQuestionHeight(
      questionRef.current?.getBoundingClientRect().height ?? null,
    );
    setStage("sheet");
  };
  /** The tap or key that completes the automatic part at once. */
  const completeNow = () => {
    if (choiceReveal === null || stage === "sheet") return false;
    // The sheet opens in this same tick and its heading, which takes focus,
    // says the verdict; words sent now would be cut off by the focus move.
    cue(false);
    openSheet();
    return true;
  };
  const showVerdict = useEffectEvent(() => {
    cue(true);
    setStage((current) => (current === "question" ? "verdict" : current));
  });
  const sheetDue = useEffectEvent(() => {
    if (stage !== "sheet") openSheet();
  });
  const autoContinue = useEffectEvent(() => {
    onContinue();
  });

  useEffect(() => {
    // A round that opens without its reveal starts on its question.
    if (!startedRevealed) stemRef.current?.focus();
  }, [startedRevealed]);

  // The beat runs from the commit: the verdict at 400 ms, the sheet at 1.2 s.
  // A layout effect, so a verdict that is already due shows before paint, in
  // the commit that brought it.
  useLayoutEffect(() => {
    if (choiceReveal === null || startedRevealed) return;
    const elapsed =
      committedAt.current === null
        ? REVEAL_MS
        : systemClock.monotonic() - committedAt.current;
    const toVerdict = REVEAL_MS - elapsed;
    let verdict: ReturnType<typeof setTimeout> | null = null;
    if (toVerdict <= BEAT_SLACK_MS) showVerdict();
    else verdict = setTimeout(showVerdict, toVerdict);
    const sheet = setTimeout(sheetDue, Math.max(0, SHEET_AFTER_MS - elapsed));
    return () => {
      if (verdict !== null) clearTimeout(verdict);
      clearTimeout(sheet);
    };
  }, [choiceReveal, startedRevealed]);

  // The sheet's title takes focus without the browser's scroll; then the
  // page scrolls just enough to show all of Continue.
  useLayoutEffect(() => {
    if (!sheetOpen) return;
    titleRef.current?.focus({ preventScroll: true });
    const button = continueRef.current;
    if (button !== null && typeof button.scrollIntoView === "function") {
      button.scrollIntoView({ block: "nearest" });
    }
  }, [sheetOpen]);

  // "Read more" goes away as it opens the text, so focus moves to the text.
  useLayoutEffect(() => {
    if (expanded) explanationRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  const autoAdvance =
    settings.autoAdvance &&
    !autoCancelled &&
    !startedRevealed &&
    stage === "sheet" &&
    choiceReveal !== null;
  const autoMs =
    AUTO_ADVANCE_MS +
    AUTO_ADVANCE_PER_WORD_MS * wordCount(choiceReveal?.explanation ?? "");

  useEffect(() => {
    if (!autoAdvance) return;
    const timer = setTimeout(autoContinue, autoMs);
    const line = autoLineRef.current;
    const animation =
      line === null ||
      settings.reducedMotion ||
      typeof line.animate !== "function"
        ? null
        : line.animate(
            [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
            {
              duration: autoMs,
              easing: "linear",
              fill: "forwards",
            },
          );
    return () => {
      clearTimeout(timer);
      animation?.cancel();
    };
  }, [autoAdvance, autoMs, settings.reducedMotion]);

  useEffect(() => {
    if (status === "error" && error !== null) announce(CHOICE_COPY.error);
  }, [status, error]);

  const commit = (index: number) => {
    if (!interactive) return;
    committedAt.current = systemClock.monotonic();
    setPicked(index);
    setHeld(null);
    if (settings.haptics) vibrate(HAPTICS.lockIn);
    onIntent({ family: "choice", kind: "answer", option: index });
  };

  const optionState = (index: number): AnswerState => {
    if (shown && choiceReveal !== null) {
      if (index === choiceReveal.correctIndex) return "correct";
      if (index === choiceReveal.chosenIndex) return "your-answer";
      return "dimmed";
    }
    if (lockedIndex !== null) {
      return index === lockedIndex ? "locked" : "disabled";
    }
    return interactive ? "idle" : "disabled";
  };

  const onRoundKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (autoAdvance) setAutoCancelled(true);
    // Only a fresh press completes the reveal or continues. Held down, Enter
    // would commit, then complete on its first repeat and continue on the
    // next, so the player never saw the verdict or the explanation.
    if (event.repeat) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (completeNow()) {
      event.preventDefault();
      return;
    }
    if (
      event.key === "Enter" &&
      stage === "sheet" &&
      !isControl(event.target)
    ) {
      event.preventDefault();
      onContinue();
    }
  };

  const onQuestionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!shortcutsOn || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = SHORTCUT_KEYS.indexOf(event.key);
    if (index < 0 || index >= open.options.length) return;
    event.preventDefault();
    if (!event.repeat) setHeld(index);
  };

  const onQuestionKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = SHORTCUT_KEYS.indexOf(event.key);
    if (held === null || index !== held) return;
    event.preventDefault();
    commit(index);
  };

  const grid =
    open.format !== "mc" ||
    open.options.every((option) => option.label.length < GRID_LABEL_MAX);
  const values = shown ? (choiceReveal?.valueDisplay ?? null) : null;
  const crowdShare =
    choiceReveal?.crowd?.optionShares[choiceReveal.correctIndex] ?? null;
  const answer = labelAt(open, choiceReveal?.correctIndex ?? null);
  const quiz = context.mode === "quiz" || context.mode === "quiz_solo";
  const clamped = compact && !expanded;
  const title = CHOICE_COPY.title(answer, open.format);

  return (
    <div
      data-round="choice"
      data-stage={stage}
      className="flex flex-1 flex-col gap-4"
      onKeyDown={onRoundKeyDown}
      onPointerDownCapture={(event) => {
        if (autoAdvance) setAutoCancelled(true);
        // The sheet's title has just taken focus; the press's own mousedown
        // would hand it to whatever was tapped, such as the stem.
        if (completeNow()) event.preventDefault();
      }}
    >
      <div
        ref={questionRef}
        data-question=""
        className="flex flex-1 flex-col gap-4 md:flex-none"
        style={
          questionHeight === null ? undefined : { minHeight: questionHeight }
        }
        onKeyDown={onQuestionKeyDown}
        onKeyUp={onQuestionKeyUp}
        onBlur={(event) => {
          // A key held while focus leaves the question never commits.
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setHeld(null);
          }
        }}
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-muted-foreground">
            {CHOICE_COPY.kicker(meta.ordinal, meta.ofType)}
            {meta.difficulty === null ? null : (
              <>
                {" · "}
                <span className="whitespace-nowrap">
                  <Pips filled={DIFFICULTY_PIPS[meta.difficulty]} />{" "}
                  {CHOICE_COPY.difficulty[meta.difficulty]}
                </span>
              </>
            )}
          </p>
          <h1
            ref={stemRef}
            id={stemId}
            tabIndex={-1}
            className="text-2xl leading-snug font-bold text-balance outline-none"
          >
            {open.stem}
          </h1>
        </div>
        <ol
          // Preflight's list-style: none would cost the list its role in WebKit.
          role="list"
          aria-labelledby={stemId}
          // grid-cols-1 is minmax(0, 1fr): a revealed option's tag can't
          // widen the column past the screen.
          className={cx(
            "mt-auto grid grid-cols-1 gap-3 md:mt-0",
            grid && "md:grid-cols-2",
          )}
        >
          {open.options.map((option) => (
            <li key={option.index} className="min-w-0">
              <AnswerButton
                index={option.index}
                state={optionState(option.index)}
                pressed={held === option.index}
                shortcut={
                  shortcutsOn && option.index < SHORTCUT_KEYS.length
                    ? (SHORTCUT_KEYS[option.index] ?? null)
                    : null
                }
                onCommit={() => commit(option.index)}
                onPressStart={
                  settings.sound ? () => playEffect("tap") : undefined
                }
                className="h-full"
              >
                {option.label}
                {values === null ? null : (
                  <span className="block text-base font-normal">
                    {values[option.index]}
                  </span>
                )}
              </AnswerButton>
            </li>
          ))}
        </ol>
      </div>

      {status === "checking" && !shown ? (
        <p className="text-base font-semibold">{UI_COPY.checking}</p>
      ) : null}
      {status === "error" && error !== null && !shown ? (
        <p className="text-base font-semibold">{CHOICE_COPY.error}</p>
      ) : null}

      <Sheet
        open={sheetOpen}
        modal={false}
        compact={compact}
        titleAs="h2"
        title={
          choiceReveal === null ? (
            title
          ) : (
            <>
              {/* The verdict row, inside the heading, so the heading that
                  takes focus says it first: "Not quite. It's Uranus." */}
              <span
                data-verdict={choiceReveal.correct ? "right" : "wrong"}
                className="mb-1 flex items-center gap-2 text-sm font-extrabold"
              >
                {choiceReveal.correct ? <CheckIcon /> : <CrossIcon />}
                {choiceReveal.correct ? CHOICE_COPY.right : CHOICE_COPY.wrong}
                <span className="sr-only">.</span>
              </span>{" "}
              {title}
            </>
          )
        }
        titleRef={titleRef}
        actions={
          <Button
            ref={continueRef}
            variant="primary"
            block
            onClick={onContinue}
            aria-describedby={autoAdvance ? `${stemId}-auto` : undefined}
          >
            {continueLabel}
            {autoAdvance ? (
              <span
                ref={autoLineRef}
                aria-hidden="true"
                className="absolute inset-x-3 bottom-1.5 h-0.5 origin-left rounded-full bg-background/70"
              />
            ) : null}
          </Button>
        }
      >
        {choiceReveal === null ? null : (
          <>
            {crowdShare === null ? null : (
              <p className="text-sm font-semibold text-muted-foreground">
                {CHOICE_COPY.crowd(crowdShare)}
              </p>
            )}
            {/* The clamped line keeps room for some 16 characters; past that,
                at 200% text say, Read more drops under it instead. */}
            <div
              className={
                clamped ? "flex flex-wrap items-baseline gap-x-2" : undefined
              }
            >
              <p
                ref={explanationRef}
                id={explanationId}
                tabIndex={-1}
                data-clamped={clamped ? "" : undefined}
                className={cx(
                  "text-base outline-none",
                  clamped && "line-clamp-1 min-w-0 shrink grow basis-[16ch]",
                )}
              >
                {choiceReveal.explanation}
              </p>
              {clamped ? (
                <button
                  type="button"
                  aria-expanded={false}
                  aria-controls={explanationId}
                  onClick={() => setExpanded(true)}
                  className={buttonClasses({
                    variant: "text",
                    className: "shrink-0",
                  })}
                >
                  {CHOICE_COPY.readMore}
                </button>
              ) : null}
            </div>
            {clamped ? null : (
              <div className="-mx-3 flex flex-wrap items-center gap-1">
                <a
                  href={learnMoreUrl(choiceReveal.learnMore)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={CHOICE_COPY.learnMoreLabel(
                    choiceReveal.learnMore,
                  )}
                  className={buttonClasses({ variant: "ghost" })}
                >
                  {CHOICE_COPY.learnMore}
                </a>
                <RevealActions
                  itemRef={context.itemRef}
                  mode={analyticsMode(context.mode)}
                  round={quiz ? "quiz" : "choice"}
                />
              </div>
            )}
            {autoAdvance ? (
              <p id={`${stemId}-auto`} className="sr-only">
                {CHOICE_COPY.autoAdvance}
              </p>
            ) : null}
          </>
        )}
      </Sheet>
    </div>
  );
}
