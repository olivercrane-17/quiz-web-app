"use client";

/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): the Mystery round (PRD
 * §3.1.4, §4.1; DESIGN §6.3, §6.4, §7.4, §12.2), registered in
 * ../registry.tsx.
 *
 * Top to bottom: the round's kicker, the answer type as the screen's
 * heading with its category chip, and the stake indicator at the right;
 * the clue ladder with its stamps and the Next clue slot; then the guess
 * combobox, or from clue `options_from_clue` the four options. When the
 * round resolves, the reveal card (or the withdrawn card) replaces it all.
 *
 * Focus (DESIGN §6.4, §11): the heading on arrival; after a wrong guess it
 * stays in the field, so the keyboard stays up and the status region reads
 * the new clue; after Next clue or a pick it moves to the new clue's
 * heading, because the button pressed is gone. Every focus target carries
 * `focusTargetProps` (`round_heading`, `clue_heading`, `reveal_heading`),
 * which is where the run machine's focus commands land: `clue_heading`
 * marks the field after a wrong guess and the clue otherwise. While the
 * on-screen keyboard is open, pressing any of the round's buttons keeps
 * focus in the field until the click lands, because a blur closes the
 * keyboard and reflows the compact layout under the finger.
 *
 * The component renders what the run machine holds and sends intents back;
 * it never calls the backend. Announcements of verdicts come from the
 * controller (`mysteryAnnouncementText` words them); the round speaks its
 * own suggestion counts and the error under the field (DESIGN §6.9). The
 * offline line is left to the controller, which announces the lost
 * connection assertively.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { TUNABLES } from "@/config/tunables";
import type { MysteryClient, MysteryOpen } from "@/engine/rounds/mystery";
import { worthOnClue } from "@/engine/scoring/mystery";
import type { EntityId, RoundIntent } from "@/engine/types";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";

import type { RoundComponentProps } from "../contracts";
import { GuessCombobox } from "./combobox";
import { MYSTERY_COPY } from "./copy";
import { focusTargetProps, keepFocusOnControls } from "./focus";
import { categoryName, roundLabel, RoundKicker } from "./kicker";
import { ClueLadder } from "./ladder";
import { NextClueButton, nextClueLabel } from "./next-clue";
import { MysteryOptions } from "./options";
import { MysteryRevealCard } from "./reveal";
import { WithdrawnCard } from "./reveal-parts";
import { StakeIndicator } from "./stake";
import { DISPLAY_FONT, TONE } from "./tones";
import { useOnScreenKeyboard } from "./use-keyboard";

export { mysteryAnnouncementText, MYSTERY_COPY } from "./copy";
export { StakeIndicator } from "./stake";

type MysteryIntent = Extract<RoundIntent, { family: "mystery" }>;

/** The open the round last showed: the prop, or the plugin client's copy. */
function lastOpenOf(
  open: RoundComponentProps["open"],
  client: unknown,
): MysteryOpen | null {
  if (open.family === "mystery") return open;
  const fromClient = (client as Partial<MysteryClient> | null)?.open;
  return fromClient?.family === "mystery" ? fromClient : null;
}

export function MysteryRound(props: RoundComponentProps) {
  const { meta, reveal, context, continueLabel, onContinue } = props;
  if (reveal?.family === "withdrawn") {
    return (
      <WithdrawnCard
        kicker={roundLabel(meta)}
        title={MYSTERY_COPY.withdrawn.title}
        body={MYSTERY_COPY.withdrawn.body}
        continueLabel={continueLabel}
        onContinue={onContinue}
        reducedMotion={context.settings.reducedMotion}
      />
    );
  }
  if (reveal?.family === "mystery") {
    return (
      <MysteryRevealCard
        meta={meta}
        reveal={reveal}
        lastOpen={lastOpenOf(props.open, props.client)}
        continueLabel={continueLabel}
        onContinue={onContinue}
        itemRef={context.itemRef}
        mode={context.mode}
        settings={context.settings}
      />
    );
  }
  const open = props.open;
  if (open.family !== "mystery") return null;
  return <MysteryPlay {...props} open={open} />;
}

function MysteryPlay({
  meta,
  open,
  status,
  error,
  onIntent,
  context,
}: RoundComponentProps & { open: MysteryOpen }) {
  const { settings, list } = context;
  const optionsFromClue = TUNABLES.daily.optionsFromClue;
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const clueHeadingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // What the round looked like when it mounted: anything newer animates in.
  const [firstClue] = useState(open.clue);
  const [firstGuesses] = useState(open.wrongGuesses.length);

  const [lastIntent, setLastIntent] = useState<MysteryIntent | null>(null);
  const [fieldFocused, setFieldFocused] = useState(false);

  const busy = status === "judging" || status === "checking";
  const offline = status === "offline";
  const optionsShowing = open.options !== null;
  const worth = worthOnClue(open.clue);
  const nextLabel = nextClueLabel(open.clue, optionsFromClue, optionsShowing);
  const keyboard = useOnScreenKeyboard(fieldFocused && !optionsShowing);
  const alreadyGuessed = useMemo<ReadonlySet<EntityId>>(
    () => new Set(open.wrongGuesses.map((g) => g.entityId)),
    [open.wrongGuesses],
  );

  function send(intent: MysteryIntent) {
    if (busy || offline) return;
    setLastIntent(intent);
    onIntent(intent);
  }

  // Arrival: the screen's heading, which reads "The answer is a person".
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // A new clue: focus, sound and haptics follow what brought it.
  const shownClue = useRef(open.clue);
  const shownGuesses = useRef(open.wrongGuesses.length);
  useEffect(() => {
    if (shownClue.current === open.clue) return;
    const wrongGuess = open.wrongGuesses.length > shownGuesses.current;
    shownClue.current = open.clue;
    shownGuesses.current = open.wrongGuesses.length;
    if (lastIntent?.kind === "guess" && !optionsShowing) {
      inputRef.current?.focus();
    } else {
      clueHeadingRef.current?.focus();
    }
    if (settings.sound) {
      if (wrongGuess || lastIntent?.kind === "pick") playEffect("wrong");
      playEffect("clue_reveal", { clue: open.clue === 1 ? 2 : open.clue });
    }
    if (settings.haptics && (wrongGuess || lastIntent?.kind === "pick")) {
      vibrate(HAPTICS.wrong);
    }
  }, [
    open.clue,
    open.wrongGuesses.length,
    lastIntent,
    optionsShowing,
    settings,
  ]);

  // With the keyboard up the combobox keeps the field, three whole rows and
  // the top of the current clue's card in view.
  const currentClueCard = useCallback(
    () =>
      clueHeadingRef.current?.closest<HTMLElement>("[data-clue-card]") ?? null,
    [],
  );

  // The error under the field is spoken as it appears (DESIGN §6.9). The
  // controller announces a lost connection itself, assertively.
  const message = errorMessage(status, error);
  const spoken = status === "offline" ? null : (message?.text ?? null);
  useEffect(() => {
    if (spoken !== null) announce(spoken);
  }, [spoken, error]);

  // Keys 1 to 4 pick an option while focus is inside the round (PRD §3.0.3).
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!settings.shortcuts || open.options === null || busy || offline) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.target as HTMLElement).tagName === "INPUT") return;
    const n = Number(event.key);
    if (!Number.isInteger(n) || n < 1 || n > 4) return;
    const option = open.options[n - 1];
    if (option === undefined || option.alreadyGuessed) return;
    event.preventDefault();
    send({ family: "mystery", kind: "pick", option: option.index });
  }

  const nextClue =
    nextLabel === null ? null : (
      <NextClueButton
        label={nextLabel}
        busy={busy && lastIntent?.kind === "next_clue"}
        disabled={busy || offline}
        compact={keyboard.open}
        onPress={() => {
          send({ family: "mystery", kind: "next_clue" });
        }}
      />
    );

  const category = categoryName(meta);
  const wrongGuessFocus = lastIntent?.kind === "guess";

  return (
    <section
      aria-labelledby={titleId}
      data-round="mystery"
      data-clue={open.clue}
      data-keyboard={keyboard.open ? "open" : undefined}
      data-motion={settings.reducedMotion ? "reduce" : undefined}
      onKeyDown={onKeyDown}
      onMouseDown={keyboard.open ? keepFocusOnControls : undefined}
      className="flex flex-col gap-2 py-2"
    >
      {/* At large text sizes the worth scale drops under the title instead of
          squeezing it: 11rem is the title's share before anything wraps. */}
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-2">
        <div className="min-w-0 flex-[1_1_11rem]">
          <RoundKicker meta={meta} />
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h1
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              {...focusTargetProps("round_heading")}
              className={cx(
                "text-[clamp(1.5rem,6.9vw,1.6875rem)] leading-[1.08] font-semibold tracking-[-0.01em] outline-none",
                DISPLAY_FONT,
              )}
            >
              <span className="sr-only">{MYSTERY_COPY.titlePrefix}</span>{" "}
              {MYSTERY_COPY.title(meta.answerType)}
            </h1>
            {category === null ? null : (
              <span
                className={cx(
                  "inline-flex min-h-7 items-center rounded-full border-[1.5px] px-[11px] text-[0.8125rem] font-bold whitespace-nowrap",
                  TONE.strongBorder,
                  TONE.surface,
                )}
              >
                {category}
              </span>
            )}
          </div>
        </div>
        <StakeIndicator
          worth={worth}
          reducedMotion={settings.reducedMotion}
          className="ml-auto"
        />
      </div>

      <ClueLadder
        open={open}
        firstClue={firstClue}
        firstGuesses={firstGuesses}
        reducedMotion={settings.reducedMotion}
        compact={keyboard.open}
        optionsShowing={optionsShowing}
        clueHeadingRef={clueHeadingRef}
        headingIsFocusTarget={!wrongGuessFocus || optionsShowing}
        slot={keyboard.open ? null : nextClue}
      />

      {optionsShowing && open.options !== null ? (
        <>
          <MysteryOptions
            options={open.options}
            picked={lastIntent?.kind === "pick" ? lastIntent.option : null}
            busy={busy}
            disabled={offline}
            shortcuts={settings.shortcuts}
            sound={settings.sound}
            haptics={settings.haptics}
            onPick={(option) => {
              send({ family: "mystery", kind: "pick", option });
            }}
          />
          {busy && status === "checking" ? (
            <p className={cx("text-[0.9375rem] font-semibold", TONE.ink2)}>
              {MYSTERY_COPY.checking}
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-1">
          <GuessCombobox
            answerType={meta.answerType}
            list={list}
            alreadyGuessed={alreadyGuessed}
            clue={open.clue}
            busy={busy && lastIntent?.kind === "guess"}
            disabled={offline || busy}
            sound={settings.sound}
            keyboard={keyboard}
            focusTarget={wrongGuessFocus}
            beside={keyboard.open ? nextClue : undefined}
            keepVisible={currentClueCard}
            inputRef={inputRef}
            onGuess={(entityId) => {
              send({ family: "mystery", kind: "guess", entityId });
            }}
            onFocusChange={setFieldFocused}
          />
          {/* Guess keeps its label while busy, so the field keeps its width. */}
          {status === "checking" && lastIntent?.kind === "guess" ? (
            <p className={cx("mt-2 text-[0.9375rem] font-semibold", TONE.ink2)}>
              {MYSTERY_COPY.checking}
            </p>
          ) : null}
        </div>
      )}

      {message === null ? null : (
        <div
          data-round-error={error?.code ?? status}
          className={cx(
            "flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] font-semibold",
            TONE.incorrectText,
          )}
        >
          <p>{message.text}</p>
          {message.retry && lastIntent !== null ? (
            <Button
              variant="text"
              onClick={() => {
                onIntent(lastIntent);
              }}
            >
              {MYSTERY_COPY.errors.retry}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** The words under the field for the round's state, if any (PRD §3.1.4). */
function errorMessage(
  status: RoundComponentProps["status"],
  error: RoundComponentProps["error"],
): { text: string; retry: boolean } | null {
  const copy = MYSTERY_COPY.errors;
  if (status === "offline") return { text: copy.offline, retry: false };
  if (error === null) return null;
  switch (error.code) {
    case "already_guessed":
      return { text: copy.alreadyGuessed, retry: false };
    case "invalid_entity":
      return { text: copy.notOnList, retry: false };
    case "stale":
    case "rate_limited":
    case "offline":
      // The screen resyncs a stale round, and rate limits retry silently first.
      return null;
    default:
      return status === "error" || status === "idle"
        ? { text: copy.guess, retry: status === "error" }
        : null;
  }
}
