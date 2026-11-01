"use client";

/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): the Encore round (PRD §3.1.5,
 * §4.2; DESIGN §6.5, §12.2), registered in ../registry.tsx.
 *
 * The question, then one number field with its unit beside it, the parsed
 * preview beneath ("You're answering 1,250 km", grouped in the preview and
 * never in the field, so the caret never jumps), inline errors, the two
 * band hints, and Lock in. The field asks for the numeric keypad
 * (`inputmode` numeric, or decimal when decimals are allowed), and Enter
 * locks in too. Locking in sends the parsed value once; the guess can't
 * change afterwards.
 *
 * On the result the hints give way to the result card: "Your guess 1,200 km
 * · Answer 1,250 km · 4% off", the band chip, the number line, the
 * explanation, the crowd line once enough have answered, the heart and
 * report actions, Learn more, and "See your results". Focus lands on the
 * result line (AC-DLY-18). A voided Encore shows the withdrawn card.
 */
import { useEffect, useId, useRef, useState } from "react";

import { TUNABLES } from "@/config/tunables";
import { formatEncoreAmount, parseEncoreInput } from "@/engine/encore";
import type {
  EncoreClient,
  EncoreOpen,
  EncoreReveal,
} from "@/engine/rounds/encore";
import { bandsFor } from "@/engine/scoring/encore";
import { analyticsMode } from "@/features/analytics/track";
import { RevealActions } from "@/features/reports/reveal-actions";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { CrossIcon } from "@/ui/icons";

import type { RoundComponentProps } from "../contracts";
import { MYSTERY_COPY } from "../mystery/copy";
import { TargetIcon } from "../mystery/icons";
import {
  LearnMoreLink,
  SourcesLine,
  WithdrawnCard,
  useFocusOnMount,
} from "../mystery/reveal-parts";
import { DISPLAY_FONT, TONE, enter } from "../mystery/tones";
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

  const [raw, setRaw] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const busy = status === "judging" || status === "checking";
  const offline = status === "offline";
  const locked = result !== null || busy;

  const rules = { decimals: encore.decimals, valueKind: encore.valueKind };
  const parsed = parseEncoreInput(raw, rules);
  const typed = raw.trim() !== "";
  const invalid = typed && !parsed.ok;
  const bands = bandsFor(encore.valueKind, null);
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

  function lockIn() {
    if (!parsed.ok || locked || offline) return;
    setSent(parsed.value);
    onIntent({ family: "encore", kind: "lock_in", value: parsed.value });
  }

  // What the field shows once locked in: the value sent, or after a reload the reveal's guess.
  const shownValue = result !== null && raw === "" ? String(result.guess) : raw;

  return (
    <section
      aria-labelledby={questionId}
      data-round="encore"
      data-motion={settings.reducedMotion ? "reduce" : undefined}
      className="flex flex-col py-2"
    >
      <p
        className={cx(
          "flex items-center gap-1.5 text-[13px] font-bold tracking-[0.01em]",
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
        data-focus-target="round_heading"
        className="mt-2 text-[clamp(22px,6.2vw,25px)] leading-[1.28] font-bold text-balance outline-none"
      >
        {encore.question}
      </h1>
      <p className={cx("mt-2 text-[15px] font-semibold", TONE.ink2)}>
        {ENCORE_COPY.tiebreak}
      </p>

      <div
        className={cx(
          "relative mt-4 flex h-[84px] items-center gap-2.5 overflow-hidden rounded-2xl border-2 px-4 pb-3.5 outline-offset-2 has-[input:focus-visible]:outline-[3px] has-[input:focus-visible]:outline-[color:color-mix(in_oklab,var(--kn-play-accent,var(--foreground))_50%,transparent)]",
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
          readOnly={locked}
          aria-disabled={offline || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={
            [
              unitWord === "" ? null : unitId,
              parsed.ok && result === null ? previewId : null,
              invalid ? errorId : null,
            ]
              .filter((part) => part !== null)
              .join(" ") || undefined
          }
          onChange={(event) => {
            setRaw(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              lockIn();
            }
          }}
          className={cx(
            "mt-4 min-w-0 flex-1 bg-transparent text-[44px] leading-none font-bold tracking-[-0.01em] tabular-nums outline-none",
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

      <p
        id={previewId}
        aria-live="polite"
        className={cx(
          "mt-2.5 min-h-[1.4em] text-[15px] font-semibold",
          TONE.ink2,
        )}
      >
        {parsed.ok && result === null ? (
          <>
            {ENCORE_COPY.previewLead}{" "}
            <strong className={TONE.ink}>
              {formatEncoreAmount(
                parsed.value,
                encore.unitShort,
                encore.valueKind,
              )}
            </strong>
          </>
        ) : null}
      </p>
      {invalid && !parsed.ok ? (
        <p
          id={errorId}
          data-encore-error={parsed.error}
          className={cx(
            "flex items-center gap-1.5 text-[15px] font-semibold",
            TONE.incorrectText,
          )}
        >
          <CrossIcon size={16} />
          {parseErrorText(parsed.error, encore.decimals)}
        </p>
      ) : null}

      {result === null ? (
        <>
          <div
            role="group"
            aria-label={ENCORE_COPY.hints.group}
            className="mt-3 flex flex-wrap gap-2"
          >
            <span
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full py-[5px] pr-[11px] pl-2 text-[13px] font-bold",
                TONE.sunken,
                TONE.ink2,
              )}
            >
              <TargetIcon size={16} />
              {ENCORE_COPY.hints.bullseye(bands.bullseye, encore.valueKind)}
            </span>
            <span
              className={cx(
                "inline-flex items-center rounded-full px-[11px] py-[5px] text-[13px] font-bold",
                TONE.sunken,
                TONE.ink2,
              )}
            >
              {ENCORE_COPY.hints.close(bands.close, encore.valueKind)}
            </span>
          </div>
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
  if (text === null) return null;
  return (
    <div
      data-round-error={error?.code ?? status}
      className={cx(
        "mt-3 flex flex-wrap items-center gap-x-3 text-[15px] font-semibold",
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
    <>
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
          data-focus-target="reveal_heading"
          className="text-[17px] leading-snug font-bold outline-none"
        >
          {ENCORE_COPY.result.line(guess, answer, result.error.display)}
        </h2>
        {result.band === null ? null : (
          <p className="mt-2">
            <span
              data-band-chip={result.band}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full py-[3px] pr-2.5 pl-[7px] text-[13px] font-extrabold",
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
          bands={bandsFor(kind, null)}
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
          <p className={cx("mt-2 text-[15px]", TONE.ink2)} data-crowd="encore">
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
    </>
  );
}
