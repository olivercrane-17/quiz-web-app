"use client";

/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): multiple choice, true/false
 * and comparison rounds (PRD §3.0.3, §3.3.2; DESIGN §6.2, §6.10, §7.3), for
 * every mode that plays them: practice, Blitz, Survival, review, sealed
 * compositions, room phones and quizzes. Registered in ../registry.tsx;
 * practice imports it alone from `@/features/rounds/client`.
 *
 * - Layout: on phones the stem sits at the top and, while the question is
 *   open, the options anchor to the bottom of the space the screen gives the
 *   round (a screen that wants the thumb zone gives it a full-height flex
 *   column), so they sit in the lower part and in the same place from one
 *   question to the next (PRD §3.0.3, DESIGN §10.2). Once an answer locks,
 *   that thumb-zone spacer collapses: the options close up under the stem,
 *   and the explanation sheet later rises at the bottom of the screen, where
 *   the answers were, into the room that freed. Nothing above it moves and
 *   the page doesn't scroll when it fits (RITE round 1, R1-21). From 768 px
 *   the options follow the stem and the sheet follows the options.
 * - Commit on release: AnswerButton paints the press on `pointerdown` and
 *   commits on `click`, so sliding off cancels (WCAG 2.5.2).
 * - Keys (decisions D6, D20 and D30; R1-13, R2-02): the letters A to D
 *   answer, matching the badges, one key per answer. The digits 1 to 4
 *   answer too, except on a question where an option holds a number, so "4"
 *   meant as four bridges never locks in option D. A key acts only while
 *   focus is in the options group: on the group itself, where each question
 *   puts focus (D30, as D28 did at the Daily's clue 4), or on an option.
 *   On the question's heading or anywhere else on the page it commits
 *   nothing (WCAG 2.1.4's "active only on focus", until SET-1's switch).
 *   Pressed on keydown and committed on keyup, never with shortcuts off.
 *   Each option names the keys that answer it in `aria-keyshortcuts` ("A
 *   1"), and the badge's letter is its one hint on the option itself. While
 *   the question is open and shortcuts are on, a line above the options
 *   says "Keys A to D answer at once." (D28; it names only the letters on
 *   screen), from the start (D30); it is drawn here, not in AnswerButton,
 *   in a line held for the whole round so nothing moves (R3-07), and it is
 *   the group's description, so a screen reader hears it after the
 *   question. A letter answers the option it names wherever in the group
 *   focus is, and the ring moves to the answer.
 * - The beat: the pick locks at once and the verdict shows 400 ms
 *   (TUNABLES.answers.revealMs) after the commit, even when it came back
 *   sooner. A slower verdict shows when it lands, with "Checking…" past
 *   1.5 s. The practice controller itself holds its verdicts for the beat,
 *   so the run's header changes with the options; a verdict that lands
 *   within a frame of the beat's end shows in that same commit.
 * - The explanation sheet opens at 1.2 s with the verdict, the title, the
 *   whole explanation, Learn more, the reveal actions and Continue. On a
 *   short phone, under 740 px tall, it opens compact (DESIGN §6.10), which
 *   is tighter but still whole (D12, R1-31). When it can't fit below the
 *   options, the page scrolls just enough to show all of it, down to
 *   Continue. When that scroll would take the correct option or the pick
 *   under the header, the sheet's body scrolls inside it instead, so both
 *   options, the title and Continue stay in view (`keepSheetInView`, DESIGN
 *   §6.10). Continue is brought into the visual viewport too, which a page
 *   wider than a phone's screen leaves shorter than the layout viewport. A
 *   tap anywhere, or a fresh Enter, first completes the automatic part at
 *   once; Enter on the sheet continues. A held key's repeats do neither.
 *   With auto-advance on, Continue fires by itself after 2 s plus 0.25 s a
 *   word, and any tap or key cancels it.
 * - Speech: the verdict goes to the polite status region as it shows at
 *   400 ms, from here, so it lands with what the eye sees ("Not quite. You
 *   chose Lyon. The answer is Paris."). Controllers drop the run machine's
 *   `announce` commands for choice verdicts (`correct`, `wrong_choice`), or
 *   the player would hear it twice. The sheet's heading carries the verdict
 *   too ("Not quite. It's Paris."), because the focus move to it cuts off
 *   speech in progress; a tap that opens the sheet before the verdict has
 *   been spoken leaves the heading as the only telling. The heading's
 *   pieces join without stray spaces (R1-34).
 * - Focus: the options group when a round opens (D30), without the
 *   browser's scroll; the group is labelled by the question's heading, so
 *   the question is read first. The question's top is then kept below a
 *   sticky header, so the kicker and the stem's first line never open under
 *   it (R1-12). The
 *   sheet's title when the sheet opens (the reveal heading, as AC-DLY-18
 *   asks), but only while focus is still where the answer left it: on the
 *   answered option or elsewhere in the round, or on the page itself. A
 *   player who has moved on, to Leave say, stays there, and the verdict
 *   reaches them through the status region (R1-14).
 * - Words: the options, the title and the status message read the labels
 *   through `displayLabels` (a bare year gains its era beside one BC), and
 *   the title puts the answer mid-sentence (`midSentence`, R1-25).
 * - A round that mounts with its reveal already there (a reload, a tab
 *   coming back) shows the sheet at once, with no beat and no speech.
 */
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import { TUNABLES } from "@/config/tunables";
import { displayLabels, hasNumberOption } from "@/engine/rounds/choice/labels";
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
import { focusWithRing } from "@/ui/focus-ring";
import { CheckIcon, CrossIcon } from "@/ui/icons";
import { Sheet } from "@/ui/sheet";

import type { PlaySettings, RoundComponentProps } from "../contracts";
import { keepTopBelowHeader } from "../viewport";
import { CHOICE_COPY, DIFFICULTY_PIPS, learnMoreUrl } from "./copy";
import { focusIsElsewhere, keepSheetInView } from "./viewport";

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
/** D6: the letters pick, matching the badges A to D. */
const LETTER_KEYS = ["a", "b", "c", "d"];
/** D6: the digits pick only while no option holds a number. */
const DIGIT_KEYS = ["1", "2", "3", "4"];
/** DESIGN §6.2: 2 by 2 from 768 px only when every option is shorter. */
const GRID_LABEL_MAX = 24;
/**
 * DESIGN §6.10: short phones, under 740 px tall, get the compact sheet. A
 * phone is a narrow screen or a touch screen: a laptop's window is often
 * under 740 px too, and there the full sheet fits under the options.
 */
export const SHORT_SCREEN_QUERY =
  "(max-height: 739px) and (max-width: 767px), (max-height: 739px) and (pointer: coarse)";
/**
 * A period that screen readers read and the eye doesn't see. It stays an
 * inline box: a visually hidden box taken out of the flow (`sr-only`) is a
 * block to the accessible-name computation, which then pads it with spaces
 * ("Right . It's Paris.", R1-34).
 */
const HIDDEN_PERIOD = "[clip-path:inset(50%)]";

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

/** The options' labels as they show, by display position (`displayLabels`). */
function shownLabels(open: ChoiceOpen): string[] {
  return displayLabels(open.options.map((option) => option.label));
}

function labelIn(labels: readonly string[], index: number | null): string {
  return index === null ? "" : (labels[index] ?? "");
}

/** The polite status message for a verdict (PRD §3.0.3), with the labels as they show. */
export function verdictText(open: ChoiceOpen, reveal: ChoiceReveal): string {
  const labels = shownLabels(open);
  const answer = labelIn(labels, reveal.correctIndex);
  return reveal.correct
    ? CHOICE_COPY.status.correct(answer)
    : CHOICE_COPY.status.wrong(labelIn(labels, reveal.chosenIndex), answer);
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

/**
 * True when a key event comes from inside the options group: from the group
 * itself, where a question puts focus (D30), or from an option (D20).
 */
function inOptions(event: KeyboardEvent<HTMLElement>): boolean {
  return (
    event.target === event.currentTarget ||
    (event.target instanceof Element && event.target.closest("button") !== null)
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
  /** Mounted with its reveal there: no beat, no speech, no auto-advance. */
  const [startedRevealed] = useState(reveal?.family === "choice");
  const compact = useShortScreen();
  const committedAt = useRef<number | null>(null);
  /** The verdict's cues (speech, sound, haptics) have been given. */
  const cued = useRef(reveal?.family === "choice");
  /** The verdict has gone to the status region. */
  const spokenAloud = useRef(false);
  /** A press inside the round completed the reveal: the title takes focus. */
  const pressClaimedFocus = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const autoLineRef = useRef<HTMLSpanElement>(null);
  const stemId = useId();

  const labels = useMemo(() => shownLabels(open), [open]);
  const digitsPick = useMemo(() => !hasNumberOption(labels), [labels]);

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
  /** The answer has locked in: the thumb-zone spacer gives its room to the sheet. */
  const settled = lockedIndex !== null || choiceReveal !== null;
  const shortcutsOn = settings.shortcuts && interactive;

  /** The option a key picks, or -1: A to D always, 1 to 4 while no option is a number. */
  const optionForKey = (key: string): number => {
    const letter = LETTER_KEYS.indexOf(key.toLowerCase());
    const index =
      letter >= 0 ? letter : digitsPick ? DIGIT_KEYS.indexOf(key) : -1;
    return index < open.options.length ? index : -1;
  };

  /** `aria-keyshortcuts` for the option at `index`: "A 1", or "A" when digits don't pick. */
  const keysFor = (index: number): string | null => {
    const letter = LETTER_KEYS[index];
    if (!shortcutsOn || letter === undefined) return null;
    const digit = digitsPick ? DIGIT_KEYS[index] : undefined;
    return digit === undefined
      ? letter.toUpperCase()
      : `${letter.toUpperCase()} ${digit}`;
  };

  /** The verdict's cues, once: spoken at the 400 ms reveal, felt either way. */
  const cue = (aloud: boolean) => {
    if (choiceReveal === null || cued.current) return;
    cued.current = true;
    if (aloud) {
      spokenAloud.current = true;
      announce(verdictText(open, choiceReveal));
    }
    feel(choiceReveal, settings);
  };
  /** The tap or key that completes the automatic part at once. */
  const completeNow = () => {
    if (choiceReveal === null || stage === "sheet") return false;
    // The sheet opens in this same tick and its heading, which takes focus,
    // says the verdict; words sent now would be cut off by the focus move.
    cue(false);
    setStage("sheet");
    return true;
  };
  const showVerdict = useEffectEvent(() => {
    cue(true);
    setStage((current) => (current === "question" ? "verdict" : current));
  });
  const sheetDue = useEffectEvent(() => {
    setStage("sheet");
  });
  const autoContinue = useEffectEvent(() => {
    onContinue();
  });

  // A round that opens without its reveal starts on its question: focus on
  // the options group (D30), which the stem labels, without the browser's
  // scroll, which would leave the question's top under a sticky header,
  // then the question's top just below it. A layout effect, so the new
  // question never paints in the wrong place.
  useLayoutEffect(() => {
    if (startedRevealed) return;
    if (!focusIsElsewhere(rootRef.current)) {
      // The ring shows when a key press brought the question (R1-34).
      focusWithRing(groupRef.current, { preventScroll: true });
    }
    keepTopBelowHeader(questionRef.current);
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

  // The sheet's title takes focus, without the browser's scroll, only while
  // focus is still where the answer left it (R1-14); otherwise the verdict
  // reaches the player through the status region. Then the sheet fits the
  // screen: as it is, or with the page scrolled just enough to show all of
  // it, down to Continue, and its body scrolling inside it before the page
  // takes the correct option or the pick under the header.
  const sheetOpened = useEffectEvent(() => {
    const claimed = pressClaimedFocus.current;
    pressClaimedFocus.current = false;
    if (claimed || !focusIsElsewhere(rootRef.current)) {
      focusWithRing(titleRef.current, { preventScroll: true });
    } else if (
      choiceReveal !== null &&
      !spokenAloud.current &&
      !startedRevealed
    ) {
      spokenAloud.current = true;
      announce(verdictText(open, choiceReveal));
    }
    keepSheetInView(
      rootRef.current?.querySelector<HTMLElement>('[data-sheet="inline"]') ??
        null,
      {
        body: sheetBodyRef.current,
        keep: [
          ...(questionRef.current?.querySelectorAll(
            '[data-state="correct"], [data-state="your-answer"]',
          ) ?? []),
        ],
        action: continueRef.current,
      },
    );
  });
  useLayoutEffect(() => {
    if (sheetOpen) sheetOpened();
  }, [sheetOpen]);

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

  // D20, D30: the option keys listen on the options group, so they act only
  // while focus is on it or on an option. A key on the heading, the page or
  // a sheet never reaches these handlers.
  const onOptionsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!inOptions(event)) return;
    if (!shortcutsOn || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = optionForKey(event.key);
    if (index < 0) return;
    event.preventDefault();
    if (!event.repeat) setHeld(index);
  };

  const onOptionsKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!inOptions(event)) return;
    const index = optionForKey(event.key);
    if (held === null || index !== held) return;
    event.preventDefault();
    commit(index);
    // R3-07: a letter answers wherever in the group focus is, so the ring
    // follows the answer, as it does for Enter: it never stays on the group
    // or an option the key didn't answer, and the sheet's title takes it.
    const answered =
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[index];
    if (answered !== undefined && answered !== event.target) {
      focusWithRing(answered, { preventScroll: true });
    }
  };

  /** D20's legend (D28's words): the keys, from the start, while the question is open (D30). */
  const legendShown = shortcutsOn;

  const grid =
    open.format !== "mc" ||
    labels.every((label) => label.length < GRID_LABEL_MAX);
  const values = shown ? (choiceReveal?.valueDisplay ?? null) : null;
  const crowdShare =
    choiceReveal?.crowd?.optionShares[choiceReveal.correctIndex] ?? null;
  const answer = labelIn(labels, choiceReveal?.correctIndex ?? null);
  const quiz = context.mode === "quiz" || context.mode === "quiz_solo";
  const title = CHOICE_COPY.title(answer, open.format, meta.category);

  return (
    <div
      ref={rootRef}
      data-round="choice"
      data-stage={stage}
      className="flex flex-1 flex-col gap-4"
      onKeyDown={onRoundKeyDown}
      onPointerDownCapture={(event) => {
        if (autoAdvance) setAutoCancelled(true);
        // The press's own mousedown would hand focus to whatever was tapped
        // (the stem, a locked option, the page); the sheet's title takes it
        // instead, as it would from any of those.
        if (completeNow()) {
          pressClaimedFocus.current = true;
          event.preventDefault();
        }
      }}
    >
      <div
        ref={questionRef}
        data-question=""
        data-settled={settled ? "" : undefined}
        className={cx("flex flex-col gap-4", !settled && "flex-1 md:flex-none")}
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
            id={stemId}
            className="text-2xl leading-snug font-bold text-balance"
          >
            {open.stem}
          </h1>
        </div>
        {/* D30: the group takes focus for each new question, labelled by
            the stem, which is read first, and described by the legend; it
            shows the app's one 3 px ring when that came from the keyboard
            (R1-34). Its keys act from here as from an option (D20). */}
        <div
          ref={groupRef}
          role="group"
          tabIndex={-1}
          aria-labelledby={stemId}
          aria-describedby={legendShown ? `${stemId}-keys` : undefined}
          data-options=""
          // With the legend's line, the options' anchor at the foot of the
          // thumb zone moves up to it; half the round's gap on either side
          // of the line, so it reads with the options.
          className={cx(
            "flex flex-col gap-2 rounded-[14px]",
            !settled && "mt-auto",
            settings.shortcuts ? "md:-mt-2" : "md:mt-0",
          )}
          onKeyDown={onOptionsKeyDown}
          onKeyUp={onOptionsKeyUp}
          onBlur={(event) => {
            // A key held while focus leaves the options never commits.
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setHeld(null);
            }
          }}
        >
          {/* R3-07: the legend sits above the options, so at 200% text it
              shows before them rather than below the screen's edge. Its
              line is held while shortcuts are on, so nothing moves when its
              words go at the lock-in from 768 px (PRD §3.0.3, §25). Once
              the answer locks on a phone, the options close up under the
              stem anyway (R1-21), and the empty line goes with the spacer,
              leaving no band between them. Screen readers hear it as the
              group's description. */}
          {settings.shortcuts ? (
            <p
              id={`${stemId}-keys`}
              data-keys-line=""
              data-keys-legend={legendShown ? "" : undefined}
              aria-hidden="true"
              className={cx(
                "min-h-5 text-sm font-semibold text-muted-foreground",
                settled && "max-md:hidden",
                !legendShown && "invisible",
              )}
            >
              {CHOICE_COPY.keysLegend(open.options.length)}
            </p>
          ) : null}
          <ol
            // Preflight's list-style: none would cost the list its role in WebKit.
            role="list"
            aria-labelledby={stemId}
            // grid-cols-1 is minmax(0, 1fr): a revealed option's tag can't
            // widen the column past the screen.
            className={cx("grid grid-cols-1 gap-3", grid && "md:grid-cols-2")}
          >
            {open.options.map((option) => (
              <li key={option.index} className="min-w-0">
                <AnswerButton
                  index={option.index}
                  state={optionState(option.index)}
                  pressed={held === option.index}
                  shortcut={keysFor(option.index)}
                  onCommit={() => commit(option.index)}
                  onPressStart={
                    settings.sound ? () => playEffect("tap") : undefined
                  }
                  // D6: one key hint per option, the badge's letter; the keys
                  // themselves are in `aria-keyshortcuts`, and AnswerButton
                  // draws no second hint since FIX-DS.
                  className="h-full"
                >
                  {labelIn(labels, option.index)}
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
        // At the bottom of the round on phones, where the answers were.
        className="mt-auto md:mt-0"
        title={
          choiceReveal === null ? (
            title
          ) : (
            <>
              {/* The verdict row, inside the heading, so the heading that
                  takes focus says it first: "Not quite. It's Uranus." The
                  word and its period share one box (R1-34). */}
              <span
                data-verdict={choiceReveal.correct ? "right" : "wrong"}
                className="mb-1 flex items-center gap-2 text-sm font-extrabold"
              >
                {choiceReveal.correct ? <CheckIcon /> : <CrossIcon />}
                <span>
                  {choiceReveal.correct ? CHOICE_COPY.right : CHOICE_COPY.wrong}
                  <span className={HIDDEN_PERIOD}>.</span>
                </span>
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
          // The sheet's body. When the sheet can't fit as it is, this part
          // scrolls inside the sheet (`keepSheetInView`). Its side padding
          // (1rem, the compact sheet's own) keeps the 6 px focus rings of
          // its links inside that box; focused by keyboard to scroll it, it
          // draws the same 3 px ring just inside its own edge.
          <div
            ref={sheetBodyRef}
            data-sheet-body=""
            className={cx(
              "-mx-4 -my-2 flex flex-col px-4 py-2 outline-offset-[-3px] focus-visible:outline-[3px] focus-visible:outline-foreground",
              compact ? "gap-2" : "gap-4",
            )}
          >
            {crowdShare === null ? null : (
              <p className="text-sm font-semibold text-muted-foreground">
                {CHOICE_COPY.crowd(crowdShare)}
              </p>
            )}
            <p data-explanation="" className="text-base">
              {choiceReveal.explanation}
            </p>
            {/* Learn more's text sits within a few pixels of the
                explanation's edge, and its ring 2 px inside the body's. */}
            <div className="-mx-2 flex flex-wrap items-center gap-1">
              <a
                href={learnMoreUrl(choiceReveal.learnMore)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={CHOICE_COPY.learnMoreLabel(choiceReveal.learnMore)}
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
            {autoAdvance ? (
              <p id={`${stemId}-auto`} className="sr-only">
                {CHOICE_COPY.autoAdvance}
              </p>
            ) : null}
          </div>
        )}
      </Sheet>
    </div>
  );
}
