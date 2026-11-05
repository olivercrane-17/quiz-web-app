"use client";

/**
 * Extension point (ARCHITECTURE §2.3): the nickname field that challenges,
 * Groups and Settings render (PRD §3.10.6, §3.7.1, §3.12.1; DESIGN §12.19).
 * Its value is the `NicknameInput` that `setNickname` and the Group calls
 * take: `{ generated }` for a name from the reviewed lists, `{ custom }`
 * for typed text.
 *
 * - With the 18+ band (`allowCustom`): a text field prefilled with the
 *   generated name, and Shuffle name beside it. Typing makes a custom name;
 *   emptying the field, or typing a generated name back exactly, means the
 *   generated name again. Shuffle puts another generated name in the field.
 * - Without it: the generated-name picker, the name and Shuffle name (the
 *   13 to 17 band, PRD §3.10.6). While the band is unknown the caller
 *   passes `onCustomRequest`, so "Type your own name" lets it ask the band
 *   first. Once the answer arrives, focus moves to the text field (18+) or
 *   to Shuffle name (13 to 17), since the button that asked is gone. The
 *   picker shows a generated name even when `value` is custom.
 * - Filter feedback: typed text goes through the slur filter's client half
 *   (./filter.ts), whose term list loads, as a lazy chunk, the first time
 *   the field takes focus. A hit shows "Please choose a different name."
 *   under the field once typing pauses for `FILTER_SETTLE_MS`, or at once
 *   when the field loses focus, and is spoken once. It stays while the
 *   text stays blocked and goes as soon as the text is clean.
 *   `onBlockedChange` hears the verdict on mount and at each change, at
 *   once, so a caller can hold its Save.
 * - The server checks again and has the last word: the caller passes its
 *   refusal back as `error`, which takes the same line (and is spoken)
 *   until the caller clears it.
 *
 * The field never logs, tracks or sends the text anywhere; its caller
 * sends the value, and only to the RPC that stores it.
 */
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import type { NicknameInput } from "@/backend";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { CrossIcon } from "@/ui/icons";

import { FILTER_SETTLE_MS, NICKNAME_COPY, NICKNAME_MAX_LENGTH } from "./copy";
import { loadTextFilter, type TextFilter } from "./filter";
import { shuffleName } from "./names";
import { ShuffleIcon } from "./shuffle-icon";

export interface NicknameFieldProps {
  /** The visible label: "What should your friends see?" */
  label: string;
  /** The player's generated friendly name, such as "Plucky Otter": the first name offered. */
  generated: string;
  value: NicknameInput;
  onChange(value: NicknameInput): void;
  /** Custom names need the 18+ band; without it the field is the generated-name picker. */
  allowCustom: boolean;
  /**
   * The age band is unknown: the picker offers "Type your own name", which
   * calls this so the caller can ask the band (PRD §3.10.6). Leave it out
   * once the band is known.
   */
  onCustomRequest?: () => void;
  /** The client filter's verdict on the typed text, on mount and at each change. */
  onBlockedChange?: (blocked: boolean) => void;
  /** A refusal to show under the field, such as the server's "Please choose a different name." */
  error?: string | null;
  disabled?: boolean;
}

/** The DS-1 field: a 2 px ink border, radius `lg`, 48 px tall (DESIGN §4, §6.5). */
const FIELD_CLASSES =
  "min-h-12 min-w-0 flex-[1_1_12em] rounded-lg border-2 border-ink bg-surface px-4 text-lead text-ink placeholder:text-ink-3 disabled:border-rule-strong disabled:bg-sunken disabled:text-ink-2";

export function NicknameField({
  label,
  generated,
  value,
  onChange,
  allowCustom,
  onCustomRequest,
  onBlockedChange,
  error = null,
  disabled = false,
}: NicknameFieldProps) {
  const labelId = useId();
  const fieldId = useId();
  const hintId = useId();
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const shuffleRef = useRef<HTMLButtonElement>(null);
  /** Set by "Type your own name", whose button goes once the band is known. */
  const focusAfterAsking = useRef(false);

  /** The generated name offered while the value is custom: the last one shown. */
  const [offered, setOffered] = useState<string | null>(null);
  /** The generated name whose text the player cleared from the field. */
  const [emptied, setEmptied] = useState<string | null>(null);
  const [filter, setFilter] = useState<TextFilter | null>(null);
  /** The filter's answer is showing for the current run of blocked text. */
  const [noticed, setNoticed] = useState(false);

  const custom = "custom" in value ? value.custom : null;
  const suggestion =
    "generated" in value ? value.generated : (offered ?? generated);
  const typed = allowCustom ? custom : null;
  const blocked = typed !== null && filter !== null && filter.isBlocked(typed);
  const message = error ?? (blocked && noticed ? NICKNAME_COPY.blocked : null);

  // Typing has paused on blocked text: show the answer.
  useEffect(() => {
    if (!blocked || noticed) return;
    const timer = setTimeout(() => {
      setNoticed(true);
    }, FILTER_SETTLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [blocked, noticed, typed]);

  // Each new message is spoken once, through the status region.
  useEffect(() => {
    if (message !== null) announce(message);
  }, [message]);

  const reportBlocked = useEffectEvent((verdict: boolean) => {
    onBlockedChange?.(verdict);
  });
  useEffect(() => {
    reportBlocked(blocked);
  }, [blocked]);

  // The band is answered: focus the text field (18+), or Shuffle where the
  // button that asked was (13 to 17), so focus never drops to the page.
  const asking = onCustomRequest !== undefined;
  useEffect(() => {
    if (!focusAfterAsking.current || (asking && !allowCustom)) return;
    focusAfterAsking.current = false;
    (allowCustom ? inputRef : shuffleRef).current?.focus();
  }, [allowCustom, asking]);

  function needFilter() {
    if (filter !== null) return;
    loadTextFilter().then(setFilter, () => {
      // Offline, or the chunk failed: the server still checks on save, and
      // the next focus tries again.
    });
  }

  function typedChange(text: string) {
    needFilter();
    if (filter === null || !filter.isBlocked(text)) setNoticed(false);
    setOffered(suggestion);
    if (text.trim() === "") {
      setEmptied(suggestion);
      onChange({ generated: suggestion });
    } else if (text === suggestion || text === generated) {
      setEmptied(null);
      onChange({ generated: text });
    } else {
      onChange({ custom: text });
    }
  }

  function shuffle() {
    const next = shuffleName(suggestion);
    setOffered(next);
    setEmptied(null);
    setNoticed(false);
    onChange({ generated: next });
    announce(next);
  }

  const messageLine =
    message === null ? null : (
      <p
        id={messageId}
        className="flex items-start gap-1.5 text-body-sm font-bold text-incorrect-text"
      >
        <CrossIcon size={16} className="mt-0.5" />
        {message}
      </p>
    );
  const shuffleButton = (describedBy?: string) => (
    <Button
      ref={shuffleRef}
      variant="secondary"
      size="small"
      disabled={disabled}
      aria-describedby={describedBy}
      onClick={shuffle}
    >
      <ShuffleIcon size={18} />
      {NICKNAME_COPY.shuffle}
    </Button>
  );

  if (allowCustom) {
    const text = custom ?? (emptied === suggestion ? "" : suggestion);
    return (
      <div className="flex flex-col gap-2" data-nickname-field="custom">
        <label htmlFor={fieldId} className="text-label text-ink">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            id={fieldId}
            type="text"
            value={text}
            placeholder={suggestion}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="nickname"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            disabled={disabled}
            aria-describedby={
              message === null ? hintId : `${hintId} ${messageId}`
            }
            aria-invalid={message === null ? undefined : true}
            onFocus={needFilter}
            onBlur={() => {
              if (blocked) setNoticed(true);
            }}
            onChange={(event) => {
              typedChange(event.target.value);
            }}
            className={FIELD_CLASSES}
          />
          {shuffleButton()}
        </div>
        {messageLine}
        <p id={hintId} className="text-body-sm text-ink-2">
          {NICKNAME_COPY.customHint(suggestion)}
        </p>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-2"
      data-nickname-field="generated"
    >
      <span id={labelId} className="text-label text-ink">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <p
          id={fieldId}
          className="flex min-h-12 min-w-0 flex-[1_1_12em] items-center rounded-lg bg-sunken px-4 py-2 text-lead font-bold text-ink"
        >
          {suggestion}
        </p>
        {shuffleButton(
          onCustomRequest === undefined ? `${fieldId} ${hintId}` : fieldId,
        )}
      </div>
      {messageLine}
      {onCustomRequest === undefined ? (
        <p id={hintId} className="text-body-sm text-ink-2">
          {NICKNAME_COPY.generatedHint}
        </p>
      ) : (
        <Button
          variant="text"
          disabled={disabled}
          className="self-start"
          onClick={() => {
            focusAfterAsking.current = true;
            onCustomRequest();
          }}
        >
          {NICKNAME_COPY.typeOwn}
        </Button>
      )}
    </div>
  );
}
