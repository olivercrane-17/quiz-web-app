"use client";

/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): the Mystery round (PRD
 * §3.1.4, §4.1; DESIGN §6.3, §6.4, §7.4, §12.2), registered in
 * ../registry.tsx.
 *
 * Top to bottom: the round's kicker, the answer type as the screen's
 * heading with its category chip under it (always in the same place, so it
 * never moves between Mysteries, R1-33), and the stake indicator at the
 * right; the clue ladder with its stamps; then the guess combobox, or from
 * clue `options_from_clue` the four options; then Next clue, after the
 * field in reading and focus order, so the first Tab reaches the field
 * (D15). In the player's first Daily, Mystery 1's clue 1 carries the hint
 * that a wrong guess costs the same as Next clue (PRD §3.1.4, R1-04), read
 * with the field too. When the round resolves, the reveal card (or the
 * withdrawn card) replaces it all.
 *
 * Focus (DESIGN §6.4, §11): the heading on arrival; after a wrong guess it
 * stays in the field, so the keyboard stays up and the status region reads
 * the new clue; after Next clue or a pick it moves to the new clue's
 * heading. Every focus target carries `focusTargetProps` (`round_heading`,
 * `clue_heading`, `reveal_heading`), which is where the run machine's focus
 * commands land: `clue_heading` marks the field after a wrong guess and the
 * clue otherwise. While the on-screen keyboard is open, pressing any of the
 * round's buttons keeps focus in the field until the click lands, because a
 * blur closes the keyboard and reflows the compact layout under the finger.
 * When the four options arrive, the page scrolls so they show under the
 * last clue, as far as the clue's top allows (R1-33: C and D sat below the
 * fold at 360 by 640).
 *
 * Keys, while focus is in the round and shortcuts are on: A to D pick an
 * option (digits 1 to 4 too, unless an option reads as a number: D6), and
 * "/" goes to the guess field (R1-32).
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
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";

import type { RoundComponentProps } from "../contracts";
import { GuessCombobox } from "./combobox";
import { MYSTERY_COPY } from "./copy";
import { focusTargetProps, keepFocusOnControls } from "./focus";
import { categoryName, roundLabel, RoundKicker } from "./kicker";
import { ClueLadder } from "./ladder";
import { NextClueButton, nextClueLabel } from "./next-clue";
import { MysteryOptions, optionForKey } from "./options";
import { MysteryRevealCard } from "./reveal";
import { WithdrawnCard } from "./reveal-parts";
import { StakeIndicator } from "./stake";
import { DISPLAY_FONT, TONE } from "./tones";
import {
  keepBetween,
  useOnScreenKeyboard,
  viewportBottom,
} from "./use-keyboard";

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

/**
 * The round context's first-Daily flag (PRD §3.1.4, R1-04): the player has
 * never finished a Daily, as the Daily's start said. A context without it
 * (practice, a challenge) counts as a returning player.
 */
function firstDailyOf(context: RoundComponentProps["context"]): boolean {
  return context.firstDaily === true;
}

/** Keys the round leaves alone: typing in a field. */
function typingIn(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  );
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
  const hintId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const clueHeadingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

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

  // PRD §3.1.4: under Mystery 1's clue 1, in the player's first Daily only.
  // With the keyboard up the player is typing: the space goes to the rows.
  const firstDailyHint =
    firstDailyOf(context) &&
    meta.ordinal === 1 &&
    open.clue === 1 &&
    !optionsShowing
      ? { id: hintId, text: MYSTERY_COPY.ladder.firstDailyHint }
      : null;

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
    } else if (optionsShowing) {
      // The options just arrived under the clue: show them as well, as far
      // as the clue's top allows, so C and D aren't left below the fold.
      clueHeadingRef.current?.focus({ preventScroll: true });
      const card = clueHeadingRef.current?.closest("[data-clue-card]");
      const block = optionsRef.current?.getBoundingClientRect();
      if (card instanceof HTMLElement && block !== undefined && block.height) {
        keepBetween(
          viewportBottom(),
          block.bottom,
          card.getBoundingClientRect().top,
          "read",
        );
      }
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

  // While the list is open or the keyboard is up, the combobox keeps the
  // field, three whole rows and the top of the current clue's card in view.
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

  // Keys, while focus is inside the round (PRD §3.0.3): A to D pick (digits
  // too unless an option is a number, D6), and "/" reaches the field (R1-32).
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!settings.shortcuts || busy || offline) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (typingIn(event.target)) return;
    if (open.options === null) {
      if (event.key !== "/") return;
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    const option = optionForKey(event.key, open.options);
    if (option === null) return;
    event.preventDefault();
    // A held key repeats: the first press is the pick.
    if (event.repeat) return;
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
      // With the keyboard up the gaps tighten, so the whole current clue
      // fits above the field and its three rows (AC-DLY-32).
      className={cx("flex flex-col py-2", keyboard.open ? "gap-1" : "gap-2")}
    >
      {/* At large text sizes the worth scale drops under the title instead of
          squeezing it: 11rem is the title's share before anything wraps. */}
      <div className="flex flex-wrap items-start justify-between gap-x-2.5 gap-y-2">
        <div className="min-w-0 flex-[1_1_11rem]">
          <RoundKicker meta={meta} />
          <h1
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            {...focusTargetProps("round_heading")}
            className={cx(
              "mt-0.5 text-[clamp(1.5rem,6.9vw,1.6875rem)] leading-[1.08] font-semibold tracking-[-0.01em] outline-none",
              DISPLAY_FONT,
            )}
          >
            <span className="sr-only">{MYSTERY_COPY.titlePrefix}</span>{" "}
            {MYSTERY_COPY.title(meta.answerType)}
          </h1>
          {category === null ? null : (
            // Its own line, at the left: the chip stays put whatever the
            // title's length (R1-33). The design system's flat label, not
            // a pill that reads as a control (R1-27); a long name wraps
            // inside it at 200% text rather than widen the page.
            <p className="mt-1.5 flex" data-category-chip="">
              <Chip className="max-w-full whitespace-normal">{category}</Chip>
            </p>
          )}
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
        note={keyboard.open ? null : firstDailyHint}
      />

      {optionsShowing && open.options !== null ? (
        <div ref={optionsRef} data-options-area="">
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
            <p className={cx("mt-2 text-[0.9375rem] font-semibold", TONE.ink2)}>
              {MYSTERY_COPY.checking}
            </p>
          ) : null}
          {/* With options from clue 3, the last clue is still to come (D15: after them). */}
          {nextClue === null ? null : <div className="mt-3">{nextClue}</div>}
        </div>
      ) : (
        <div className={keyboard.open ? undefined : "mt-1"}>
          <GuessCombobox
            answerType={meta.answerType}
            list={list}
            alreadyGuessed={alreadyGuessed}
            clue={open.clue}
            resetKey={open.wrongGuesses.length}
            busy={busy && lastIntent?.kind === "guess"}
            disabled={offline || busy}
            sound={settings.sound}
            keyboard={keyboard}
            focusTarget={wrongGuessFocus}
            beside={keyboard.open ? (nextClue ?? undefined) : undefined}
            keepVisible={currentClueCard}
            // The hint is read with the field while it shows.
            {...(firstDailyHint === null || keyboard.open
              ? {}
              : { describedBy: hintId })}
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
          {/* D15: Next clue comes after the field, in reading and focus order. */}
          {keyboard.open || nextClue === null ? null : (
            <div className="mt-3">{nextClue}</div>
          )}
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
