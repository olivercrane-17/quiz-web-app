"use client";

/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): the Encore round (PRD §3.1.5,
 * §4.2; DESIGN §6.5, §12.2), registered in ../registry.tsx.
 *
 * The question, then one number field with its unit beside it, one polite
 * line beneath that shows the parsed preview ("You're answering 1,250 km",
 * grouped in the preview and never in the field, so the caret never jumps)
 * or, in its place, the inline error, so a screen reader hears whichever
 * is current; the two band hints, and Lock in. The field asks for the
 * numeric keypad (`inputmode` numeric, or decimal when decimals are
 * allowed), and Enter locks in too. Locking in sends the parsed value
 * once; the guess can't change afterwards. Focusing the field reads the
 * question with it, so a desktop pointer (where the field takes focus on
 * arrival) still hears what is asked.
 *
 * With the keypad open (tracked through `visualViewport`), Lock in sits
 * right under the preview, above the hints, and the page scrolls so the
 * field and Lock in clear the keypad (DESIGN §6.5, §10.3): numeric keypads
 * have no return key. Pressing a button then keeps focus in the field
 * until the click lands, so the keypad doesn't close under the finger.
 *
 * The hints, the number line and its text name the Encore's own bands
 * (`encoreBandsOf`), or the defaults for its kind.
 *
 * On the result the hints give way to the result card: "Your guess 1,200 km
 * · Answer 1,250 km · 4% off", the band chip, the number line, the
 * explanation, the crowd line once enough have answered, the heart and
 * report actions, Learn more, and "See your results". Focus lands on the
 * result line (AC-DLY-18), and Enter there continues (PRD §3.0.3). A voided
 * Encore shows the withdrawn card.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { TUNABLES } from "@/config/tunables";
import { formatEncoreAmount, parseEncoreInput } from "@/engine/encore";
import {
  encoreBandsOf,
  type EncoreClient,
  type EncoreOpen,
  type EncoreReveal,
} from "@/engine/rounds/encore";
import { analyticsMode } from "@/features/analytics/track";
import { RevealActions } from "@/features/reports/reveal-actions";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { CrossIcon } from "@/ui/icons";

import type { RoundComponentProps } from "../contracts";
import { MYSTERY_COPY } from "../mystery/copy";
import {
  continueOnEnter,
  focusTargetProps,
  keepFocusOnControls,
} from "../mystery/focus";
import { TargetIcon } from "../mystery/icons";
import {
  LearnMoreLink,
  SourcesLine,
  WithdrawnCard,
  useFocusOnMount,
} from "../mystery/reveal-parts";
import { DISPLAY_FONT, TONE, enter } from "../mystery/tones";
import { keepInView, useOnScreenKeyboard } from "../mystery/use-keyboard";
import { ENCORE_COPY, encoreAnnouncementText, parseErrorText } from "./copy";
import { NumberLine } from "./number-line";

export { encoreAnnouncementText, ENCORE_COPY };

function openOf(
  open: RoundComponentProps["open"],
  client: unknown,
): EncoreOpen | null {
  if (open.family === "encore") return open;
  const fromClient = (client as Partial<EncoreClient> | null)?.open;
  return fromClient?.family === "encore" ? fromClient : null;
}

export function EncoreRound(props: RoundComponentProps) {
  const { reveal, context, continueLabel, onContinue } = props;
  if (reveal?.family === "withdrawn") {
    return (
      <WithdrawnCard
        kicker={ENCORE_COPY.label}
        title={ENCORE_COPY.withdrawn}
        body={null}
        continueLabel={continueLabel}
        onContinue={onContinue}
        reducedMotion={context.settings.reducedMotion}
      />
    );
  }
  const open = openOf(props.open, props.client);
  if (open === null) return null;
  return (
    <EncorePlay
      {...props}
      encore={open}
      result={reveal?.family === "encore" ? reveal : null}
    />
  );
}

/** True on a desktop pointer, where the field takes focus at once (PRD §3.1.5 Empty). */
function finePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: fine)").matches
  );
}

function EncorePlay({
  encore,
  result,
  status,
  error,
  onIntent,
  onContinue,
  continueLabel,
  context,
}: RoundComponentProps & {
  encore: EncoreOpen;
  result: EncoreReveal | null;
}) {
  const { settings } = context;
  const ids = useId();
  const unitId = `${ids}-unit`;
  const previewId = `${ids}-preview`;
  const errorId = `${ids}-error`;
  const questionId = `${ids}-question`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const lockInRef = useRef<HTMLButtonElement>(null);

  const [raw, setRaw] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const [fieldFocused, setFieldFocused] = useState(false);
  const busy = status === "judging" || status === "checking";
  const offline = status === "offline";
  const locked = result !== null || busy;
  const keyboard = useOnScreenKeyboard(fieldFocused && result === null);

  const rules = { decimals: encore.decimals, valueKind: encore.valueKind };
  const parsed = parseEncoreInput(raw, rules);
  const typed = raw.trim() !== "";
  const invalid = typed && !parsed.ok;
  const previewing = parsed.ok && result === null;
  const bands = encoreBandsOf(encore);
  const unitWord = encore.unitLabel;

  // Arrival: the field on a desktop pointer, else the question. Once only:
  // the result card moves focus itself.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (result !== null) return;
    if (finePointer()) inputRef.current?.focus();
    else headingRef.current?.focus();
  }, [result]);

  // With the keypad up, the field and Lock in sit between the top edge and
  // the keypad (DESIGN §6.5: Lock in just above the keypad).
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const lock = lockInRef.current;
    if (!keyboard.open || field === null || lock === null) return;
    keepInView(
      keyboard,
      lock.getBoundingClientRect().bottom,
      field.getBoundingClientRect().top,
    );
  }, [keyboard]);

  function lockIn() {
    if (!parsed.ok || locked || offline) return;
    setSent(parsed.value);
    onIntent({ family: "encore", kind: "lock_in", value: parsed.value });
  }

  // What the field shows once locked in: the value sent, or after a reload the reveal's guess.
  const shownValue = result !== null && raw === "" ? String(result.guess) : raw;

  const hints = (
    <div
      role="group"
      aria-label={ENCORE_COPY.hints.group}
      className="mt-3 flex flex-wrap gap-2"
    >
      {/* Ink on sunken: the greybox's secondary ink is too light on it (4.34:1). */}
      <span
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full py-[5px] pr-[11px] pl-2 text-[0.8125rem] font-bold forced-colors:border forced-colors:border-[color:CanvasText]",
          TONE.sunken,
          TONE.ink,
        )}
      >
        <TargetIcon size={16} />
        {ENCORE_COPY.hints.bullseye(bands.bullseye, encore.valueKind)}
      </span>
      <span
        className={cx(
          "inline-flex items-center rounded-full px-[11px] py-[5px] text-[0.8125rem] font-bold forced-colors:border forced-colors:border-[color:CanvasText]",
          TONE.sunken,
          TONE.ink,
        )}
      >
        {ENCORE_COPY.hints.close(bands.close, encore.valueKind)}
      </span>
    </div>
  );

  return (
    <section
      aria-labelledby={questionId}
      data-round="encore"
      data-keyboard={keyboard.open ? "open" : undefined}
      data-motion={settings.reducedMotion ? "reduce" : undefined}
      onMouseDown={keyboard.open ? keepFocusOnControls : undefined}
      className="flex flex-col py-2"
    >
      <p
        className={cx(
          "flex items-center gap-1.5 text-[0.8125rem] font-bold tracking-[0.01em]",
          TONE.ink3,
        )}
      >
        <TargetIcon size={16} />
        {ENCORE_COPY.kicker}
      </p>
      <h1
        id={questionId}
        ref={headingRef}
        tabIndex={-1}
        {...focusTargetProps("round_heading")}
        className="mt-2 text-[clamp(1.375rem,6.2vw,1.5625rem)] leading-[1.28] font-bold text-balance outline-none"
      >
        {encore.question}
      </h1>
      <p className={cx("mt-2 text-[0.9375rem] font-semibold", TONE.ink2)}>
        {ENCORE_COPY.tiebreak}
      </p>

      <div
        ref={fieldRef}
        className={cx(
          "relative mt-4 flex h-[5.25rem] items-center gap-2.5 overflow-hidden rounded-2xl border-2 px-4 pb-3.5 outline-offset-2 has-[input:focus-visible]:outline-[3px] has-[input:focus-visible]:outline-[color:color-mix(in_oklab,var(--kn-play-accent,var(--foreground))_50%,transparent)]",
          TONE.surface,
          TONE.inkBorder,
        )}
      >
        <label
          htmlFor={`${ids}-input`}
          className={cx("absolute top-1.5 left-4 text-xs font-bold", TONE.ink3)}
        >
          {ENCORE_COPY.field}
        </label>
        <input
          ref={inputRef}
          id={`${ids}-input`}
          type="text"
          inputMode={encore.decimals === 0 ? "numeric" : "decimal"}
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={shownValue}
          readOnly={locked || offline}
          aria-disabled={offline || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={[
            // The question first: focusing the field reads what is asked.
            questionId,
            unitWord === "" ? null : unitId,
            previewing ? previewId : null,
            invalid ? errorId : null,
          ]
            .filter((part) => part !== null)
            .join(" ")}
          onChange={(event) => {
            setRaw(event.target.value);
          }}
          onFocus={() => {
            setFieldFocused(true);
          }}
          onBlur={() => {
            setFieldFocused(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              lockIn();
            }
          }}
          className={cx(
            "mt-4 min-w-0 flex-1 bg-transparent text-[2.75rem] leading-none font-bold tracking-[-0.01em] tabular-nums outline-none",
            DISPLAY_FONT,
            TONE.ink,
          )}
        />
        {unitWord === "" ? null : (
          <span
            id={unitId}
            className={cx("mt-4 shrink-0 text-lg font-bold", TONE.ink2)}
          >
            {unitWord}
          </span>
        )}
        {/* A ruler along the bottom edge: the Encore is a measurement. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[9px] bg-[repeating-linear-gradient(90deg,var(--kn-rule-strong,color-mix(in_oklab,var(--foreground)_40%,transparent))_0_1.5px,transparent_1.5px_9px)] bg-[length:auto_6px] bg-bottom bg-repeat-x opacity-70"
        />
      </div>

      {/* One polite line: the preview, or the error that replaces it. */}
      <p
        aria-live="polite"
        className="mt-2.5 min-h-[1.4em] text-[0.9375rem] font-semibold"
      >
        {invalid && !parsed.ok ? (
          <span
            id={errorId}
            data-encore-error={parsed.error}
            className={cx(
              "inline-flex items-center gap-1.5",
              TONE.incorrectText,
            )}
          >
            <CrossIcon size={16} />
            {parseErrorText(parsed.error, encore.decimals)}
          </span>
        ) : previewing && parsed.ok ? (
          <span id={previewId} className={TONE.ink2}>
            {ENCORE_COPY.previewLead}{" "}
            <strong className={TONE.ink}>
              {formatEncoreAmount(
                parsed.value,
                encore.unitShort,
                encore.valueKind,
              )}
            </strong>
          </span>
        ) : null}
      </p>

      {result === null ? (
        <>
          {keyboard.open ? null : hints}
          <EncoreStateLine
            status={status}
            error={error}
            onRetry={
              sent === null
                ? null
                : () => {
                    onIntent({
                      family: "encore",
                      kind: "lock_in",
                      value: sent,
                    });
                  }
            }
          />
          <Button
            ref={lockInRef}
            variant="primary"
            block
            className="mt-5"
            disabled={!parsed.ok || offline}
            focusableWhenDisabled
            busy={busy}
            onClick={lockIn}
            data-lock-in=""
          >
            {ENCORE_COPY.lockIn}
          </Button>
          {/* With the keypad up the hints wait under Lock in. */}
          {keyboard.open ? hints : null}
        </>
      ) : (
        <EncoreResult
          encore={encore}
          result={result}
          continueLabel={continueLabel}
          onContinue={onContinue}
          itemRef={context.itemRef}
          mode={context.mode}
          reducedMotion={settings.reducedMotion}
          sound={settings.sound}
          haptics={settings.haptics}
        />
      )}
    </section>
  );
}

function EncoreStateLine({
  status,
  error,
  onRetry,
}: {
  status: RoundComponentProps["status"];
  error: RoundComponentProps["error"];
  onRetry: (() => void) | null;
}) {
  const copy = ENCORE_COPY.errors;
  let text: string | null = null;
  let retry = false;
  if (status === "offline") text = copy.offline;
  else if (status === "checking") text = MYSTERY_COPY.checking;
  else if (status === "error" && error !== null && error.code !== "stale") {
    text = copy.lockIn;
    retry = true;
  }
  // A failed lock-in is spoken as it appears (DESIGN §6.9). The controller
  // announces a lost connection itself, and "Checking…" stays quiet.
  const spoken = retry ? text : null;
  useEffect(() => {
    if (spoken !== null) announce(spoken);
  }, [spoken, error]);
  if (text === null) return null;
  return (
    <div
      data-round-error={error?.code ?? status}
      className={cx(
        "mt-3 flex flex-wrap items-center gap-x-3 text-[0.9375rem] font-semibold",
        status === "checking" ? TONE.ink2 : TONE.incorrectText,
      )}
    >
      <p>{text}</p>
      {retry && onRetry !== null ? (
        <Button variant="text" onClick={onRetry}>
          {copy.retry}
        </Button>
      ) : null}
    </div>
  );
}

function EncoreResult({
  encore,
  result,
  continueLabel,
  onContinue,
  itemRef,
  mode,
  reducedMotion,
  sound,
  haptics,
}: {
  encore: EncoreOpen;
  result: EncoreReveal;
  continueLabel: string;
  onContinue(): void;
  itemRef: string;
  mode: RoundComponentProps["context"]["mode"];
  reducedMotion: boolean;
  sound: boolean;
  haptics: boolean;
}) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const kind = encore.valueKind;
  const guess = formatEncoreAmount(result.guess, result.unitShort, kind);
  const answer = formatEncoreAmount(result.answer, result.unitShort, kind);
  const crowd =
    result.crowd !== null && result.crowd.eligible >= TUNABLES.crowd.minN
      ? result.crowd
      : null;

  const cued = useRef(false);
  useEffect(() => {
    if (cued.current) return;
    cued.current = true;
    if (sound && result.band === "bullseye") playEffect("encore_bullseye");
    if (sound && result.band === "close") playEffect("encore_close");
    if (haptics && result.band === "bullseye") vibrate(HAPTICS.correct);
  }, [sound, haptics, result.band]);

  return (
    <div data-encore-reveal="" onKeyDown={continueOnEnter(onContinue)}>
      <div
        data-encore-result={result.band ?? "none"}
        className={cx(
          "mt-4 rounded-3xl border p-4",
          TONE.surface,
          TONE.ruleBorder,
          TONE.ledge,
          enter("card", reducedMotion),
        )}
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          {...focusTargetProps("reveal_heading")}
          className="text-[1.0625rem] leading-snug font-bold outline-none"
        >
          {ENCORE_COPY.result.line(guess, answer, result.error.display)}
        </h2>
        {result.band === null ? null : (
          <p className="mt-2">
            <span
              data-band-chip={result.band}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full py-[3px] pr-2.5 pl-[7px] text-[0.8125rem] font-extrabold forced-colors:border forced-colors:border-[color:CanvasText]",
                result.band === "bullseye"
                  ? cx(
                      TONE.correctTint,
                      "shadow-[inset_0_0_0_1.5px_var(--kn-correct-line,var(--foreground))]",
                    )
                  : TONE.sunken,
                enter("verdict", reducedMotion),
              )}
            >
              {result.band === "bullseye" ? (
                <TargetIcon size={15} className={TONE.correctText} />
              ) : null}
              {ENCORE_COPY.result.band[result.band]}
            </span>
          </p>
        )}
        <NumberLine
          valueKind={kind}
          guess={result.guess}
          answer={result.answer}
          median={crowd?.medianGuess ?? null}
          bands={encoreBandsOf(encore)}
          unitShort={result.unitShort}
          decimals={encore.decimals}
          reducedMotion={reducedMotion}
        />
        <p className="mt-3 text-base leading-normal text-pretty">
          {result.explanation}
        </p>
        <SourcesLine
          labels={result.sourceLabels}
          format={MYSTERY_COPY.reveal.sources}
        />
        {crowd === null ? null : (
          <p
            className={cx("mt-2 text-[0.9375rem]", TONE.ink2)}
            data-crowd="encore"
          >
            {ENCORE_COPY.result.crowd(
              formatEncoreAmount(crowd.medianGuess, result.unitShort, kind),
              crowd.bullseyeShare,
              crowd.closeShare,
            )}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <RevealActions
            itemRef={itemRef}
            mode={analyticsMode(mode)}
            round="encore"
          />
          <LearnMoreLink name={result.learnMore} />
        </div>
      </div>
      <Button
        variant="primary"
        block
        className="mt-5"
        onClick={onContinue}
        data-continue=""
      >
        {continueLabel}
      </Button>
    </div>
  );
}
