"use client";

/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): the Encore round (PRD §3.1.5,
 * §4.2; DESIGN §6.5, §12.2), registered in ../registry.tsx.
 *
 * The kicker ("Encore · one number, no points") and the question, the line
 * that says what the Encore decides, and what comes after it ("If you tie
 * on points, the closer guess ranks higher. Time only counts after that.",
 * D2 and D21, R2-04), then one number field with its unit beside
 * it (under the number when the field is narrow in em, as at large text on
 * a phone), one line beneath that shows the parsed preview ("You're
 * answering 1,250 km", grouped in the preview and never in the field, so
 * the caret never jumps) or, in its place, the inline error; the two band
 * hints, and Lock in. The line is spoken through the status region once
 * typing has settled for `PREVIEW_ANNOUNCE_DELAY_MS` (R1-34), so a screen
 * reader hears the number meant rather than every keystroke; the field's
 * description holds it too. The field asks for the numeric keypad
 * (`inputmode` numeric, or decimal when decimals are allowed), and Enter
 * locks in too: once a keyboard is in use, "Enter locks in." says so at
 * the right of the line under the field, and in the field's description
 * (R4-15, D32). Locking in sends the parsed value once; the guess can't
 * change afterwards. Focusing the field reads the question with it, so a
 * desktop pointer (where the field takes focus on arrival) still hears
 * what is asked.
 *
 * With the keypad open (tracked through `visualViewport`), Lock in sits
 * right under the preview, above the hints, and the page scrolls so the
 * field and Lock in clear the keypad (DESIGN §6.5, §10.3): numeric keypads
 * have no return key. Pressing a button then keeps focus in the field
 * until the click lands, so the keypad doesn't close under the finger.
 *
 * The number shows whole as it is typed: when it would run past the field
 * (at 200% text on a phone, "1,250,000" needs 344 px of a 258 px field),
 * its font steps down until it fits, and grows back as it shortens
 * (`useFittedFont`, R1-03). Short answers keep the full size.
 *
 * The hints, the number line and its text name the Encore's own bands
 * (`encoreBandsOf`), or the defaults for its kind.
 *
 * On the result the hints give way to the result card: "Your guess 1,200 km
 * · Answer 1,250 km · 4% off", the band chip ("Bullseye" or "Close guess",
 * D16), the number line, the two band lines again as its legend (D16: a
 * guess outside both still shows where they were), the explanation, the
 * crowd line once enough have answered, the heart and report actions,
 * Learn more, and "See your results". Focus lands on the result line
 * (AC-DLY-18), and Enter there continues (PRD §3.0.3). A voided Encore
 * shows the withdrawn card.
 *
 * "See your results" is docked at the bottom of the screen, as the stop
 * screen docks "Done for today" (DESIGN §10.2, §12.4): at 390 by 844 it
 * sat below the fold after Lock in, and nothing said it was there (R2-12).
 * The dock's height is the page's bottom scroll inset, so focus never
 * lands under it, and toasts rise above it. As the result arrives, the
 * page scrolls the least distance that shows the result card between the
 * sticky header and the dock, its top first when it is taller than that.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

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
import { ScrollInset } from "@/features/shell/client";
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
import { useKeyLegend } from "@/ui/key-legend";
import { loadLateParts, useLateParts } from "../mystery/late";
import {
  LearnMoreLink,
  SourcesLine,
  WithdrawnCard,
} from "../mystery/reveal-parts";
import { DISPLAY_FONT, TONE, enter } from "../mystery/tones";
import {
  keepBetween,
  keepInView,
  useOnScreenKeyboard,
  viewportBottom,
} from "../mystery/use-keyboard";
import {
  ENCORE_COPY,
  PREVIEW_ANNOUNCE_DELAY_MS,
  encoreAnnouncementText,
  parseErrorText,
} from "./copy";

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

/** The least the number shrinks to: about the size of body text at 200%. */
const MIN_FIELD_FONT_PX = 20;

/**
 * Fits what the field shows to its width (R1-03): from the field's full
 * size, the font steps down until the number no longer scrolls inside the
 * field, so its leading digits never hide, and comes back up as the number
 * shortens. Measured rather than worked out from the length, since digits,
 * separators and the unit beside the field each take their own room. It
 * fits again when the window's size changes, as on a rotation.
 */
function useFittedFont(
  ref: RefObject<HTMLInputElement | null>,
  value: string,
): void {
  useLayoutEffect(() => {
    const input = ref.current;
    if (input === null) return;
    const fit = () => {
      input.style.fontSize = "";
      const width = input.clientWidth;
      if (width === 0 || input.scrollWidth <= width) return;
      const full = Number.parseFloat(getComputedStyle(input).fontSize);
      if (!(full > MIN_FIELD_FONT_PX)) return;
      let size = Math.max(
        MIN_FIELD_FONT_PX,
        Math.floor((full * width) / input.scrollWidth),
      );
      input.style.fontSize = `${String(size)}px`;
      // Rounding and the caret can leave a pixel over.
      while (
        input.scrollWidth > input.clientWidth &&
        size > MIN_FIELD_FONT_PX
      ) {
        size -= 1;
        input.style.fontSize = `${String(size)}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
    };
  }, [ref, value]);
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
  const enterId = `${ids}-enter`;
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
  // R4-15: said only where a keyboard is in use, never on a touch-only phone (D32).
  const enterHint = useKeyLegend() && result === null;
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
    // The result's number line, well before it is due (`late.ts`).
    void loadLateParts();
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
  useFittedFont(inputRef, shownValue);

  const errorText =
    invalid && !parsed.ok
      ? parseErrorText(parsed.error, encore.decimals)
      : null;
  const amount =
    previewing && parsed.ok
      ? formatEncoreAmount(parsed.value, encore.unitShort, encore.valueKind)
      : null;
  // The line under the field, spoken once typing settles (R1-34): each
  // keystroke restarts the wait, and a lock-in or a cleared field cancels it.
  const lineText =
    errorText ??
    (amount === null ? null : `${ENCORE_COPY.previewLead} ${amount}`);
  useEffect(() => {
    if (lineText === null) return;
    const timer = setTimeout(() => {
      announce(lineText);
    }, PREVIEW_ANNOUNCE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [lineText]);

  const hints = (
    <BandHints bands={bands} valueKind={encore.valueKind} className="mt-3" />
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

      {/* The field's width in em decides whether the unit fits beside the
          number: when it doesn't (large text on a phone), the unit takes a
          line of its own under it, so the number keeps the field's width
          and what you type stays in sight (DESIGN §10.5, as R1-03 found for
          the guess field). The height follows the text, never fixed. */}
      <div className="@container/encore mt-4">
        <div
          ref={fieldRef}
          data-encore-field=""
          className={cx(
            // The focus ring is DESIGN §11's: 3 px of the focus token at 3 px.
            "relative flex min-h-[5.25rem] items-center gap-x-2.5 overflow-hidden rounded-2xl border-2 px-4 pb-3.5 outline-offset-[3px] has-[input:focus-visible]:outline-[3px] has-[input:focus-visible]:outline-[color:var(--kn-focus,var(--foreground))] @max-[20em]/encore:flex-wrap",
            TONE.surface,
            TONE.inkBorder,
          )}
        >
          <label
            htmlFor={`${ids}-input`}
            className={cx(
              "absolute top-1.5 left-4 text-xs font-bold",
              TONE.ink3,
            )}
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
              enterHint ? enterId : null,
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
              data-encore-unit=""
              className={cx(
                "mt-4 shrink-0 text-lg font-bold @max-[20em]/encore:mt-1 @max-[20em]/encore:basis-full",
                TONE.ink2,
              )}
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
      </div>

      {/* One line: the preview, or the error that replaces it. The status
          region speaks it once typing settles (above), so it is no live
          region of its own. */}
      <p
        data-encore-line=""
        className="mt-2.5 flex min-h-[1.4em] flex-wrap gap-x-3 text-[0.9375rem] font-semibold"
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
            {errorText}
          </span>
        ) : amount !== null ? (
          <span id={previewId} className={TONE.ink2}>
            {ENCORE_COPY.previewLead}{" "}
            <strong className={TONE.ink}>{amount}</strong>
          </span>
        ) : null}
        {enterHint ? (
          <span
            id={enterId}
            data-enter-hint=""
            className={cx("ml-auto", TONE.ink2)}
          >
            {ENCORE_COPY.enterLocksIn}
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

/**
 * The two band lines (DESIGN §6.5 hint chips): "Within 5% is a bullseye"
 * and "Within 15% is close", named by the Encore's own bands. On the
 * result card they stay as the number line's legend (D16), each with a
 * swatch of the band it names, so a guess outside both still shows where
 * they were.
 */
function BandHints({
  bands,
  valueKind,
  legend = false,
  className,
}: {
  bands: { bullseye: number; close: number };
  valueKind: "quantity" | "year";
  legend?: boolean;
  className?: string;
}) {
  // Ink on sunken: the greybox's secondary ink is too light on it (4.34:1).
  const chip = cx(
    "inline-flex items-center gap-1.5 rounded-full py-[5px] pr-[11px] text-[0.8125rem] font-bold forced-colors:border forced-colors:border-[color:CanvasText]",
    TONE.sunken,
    TONE.ink,
  );
  return (
    <div
      role="group"
      aria-label={ENCORE_COPY.hints.group}
      data-band-hints={legend ? "legend" : "hints"}
      className={cx("flex flex-wrap gap-2", className)}
    >
      <span className={cx(chip, "pl-2")}>
        {legend ? (
          <span
            aria-hidden="true"
            data-swatch="bullseye"
            className={cx(
              "h-3 w-4 rounded-[3px] shadow-[inset_0_0_0_1.5px_var(--kn-correct-line,var(--foreground))] forced-colors:border-2 forced-colors:border-[color:CanvasText]",
              TONE.correctTint,
            )}
          />
        ) : (
          <TargetIcon size={16} />
        )}
        {ENCORE_COPY.hints.bullseye(bands.bullseye, valueKind)}
      </span>
      <span className={cx(chip, legend ? "pl-2" : "pl-[11px]")}>
        {legend ? (
          <span
            aria-hidden="true"
            data-swatch="close"
            className="h-3 w-4 rounded-[3px] bg-[color:color-mix(in_oklab,var(--kn-correct-tint,var(--muted))_55%,transparent)] shadow-[inset_0_0_0_1px_var(--kn-rule-strong,color-mix(in_oklab,var(--foreground)_45%,transparent))] forced-colors:border-[1.5px] forced-colors:border-dashed forced-colors:border-[color:CanvasText]"
          />
        ) : null}
        {ENCORE_COPY.hints.close(bands.close, valueKind)}
      </span>
    </div>
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // The number line loads apart from the round (`late.ts`), asked for as
  // the Encore opens. The result line above it says the same in words.
  const NumberLine = useLateParts()?.NumberLine;
  // The result line takes focus (AC-DLY-18) without the browser's scroll,
  // and the card comes into view above the dock (R2-12): a layout effect,
  // so it never paints anywhere else.
  useLayoutEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    showAboveDock(cardRef.current, dockRef.current);
  }, []);
  const kind = encore.valueKind;
  const bands = encoreBandsOf(encore);
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
        ref={cardRef}
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
              {ENCORE_COPY.result.chip[result.band]}
            </span>
          </p>
        )}
        {NumberLine === undefined ? (
          // The line's room, so the card doesn't grow when it arrives.
          <div aria-hidden="true" className="mt-3 min-h-[5.125rem]" />
        ) : (
          <NumberLine
            valueKind={kind}
            guess={result.guess}
            answer={result.answer}
            median={crowd?.medianGuess ?? null}
            bands={bands}
            unitShort={result.unitShort}
            decimals={encore.decimals}
            reducedMotion={reducedMotion}
          />
        )}
        {/* D16: both band lines stay, as the line's legend. */}
        <BandHints bands={bands} valueKind={kind} legend className="mt-3" />
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
      {/*
       * The dock (R2-12, DESIGN §10.2): "See your results" held at the
       * bottom of the screen while the result scrolls under it, as the stop
       * screen holds "Done for today". It bleeds over the play column's
       * 16 px gutters, its height is the page's bottom scroll inset, and
       * toasts rise above it.
       */}
      <div
        ref={dockRef}
        data-encore-dock=""
        data-toast-anchor=""
        className="sticky bottom-0 z-10 -mx-4 mt-5 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <ScrollInset edge="bottom" />
        <Button variant="primary" block onClick={onContinue} data-continue="">
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Scrolls the least distance that shows `card` between the sticky header
 * and the docked button (R2-12); when it is taller than that room, its top
 * stays in view, under the header. Without layout (a test DOM, a hidden
 * route) the page stays put.
 */
function showAboveDock(card: HTMLElement | null, dock: HTMLElement | null) {
  if (card === null || typeof window.scrollBy !== "function") return;
  const box = card.getBoundingClientRect();
  if (box.height === 0) return;
  const docked = dock?.getBoundingClientRect().height ?? 0;
  keepBetween(viewportBottom() - docked, box.bottom, box.top, "read");
}
