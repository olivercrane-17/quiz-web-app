"use client";

/**
 * Extension point (ARCHITECTURE §2.3): the nickname field used by
 * challenges, Groups and Settings (PRD §3.10.6). The generated friendly name
 * is the default; the 18+ band may type a custom name instead.
 *
 * A working greybox until MOD-1, which adds the generated-name picker
 * (Shuffle) and the slur filter's feedback as the player types, and keeps
 * these props. Until then a custom name is checked only by the server,
 * whose refusal the caller passes back as `error`. An empty custom field
 * means the generated name.
 */
import { useId } from "react";

import type { NicknameInput } from "@/backend";
import { cx } from "@/ui/cx";

import { NICKNAME_COPY, NICKNAME_MAX_LENGTH } from "./copy";

export interface NicknameFieldProps {
  /** The visible label: "What should your friends see?" */
  label: string;
  /** The generated friendly name, such as "Plucky Otter". */
  generated: string;
  value: NicknameInput;
  onChange(value: NicknameInput): void;
  /** Custom names need the 18+ band; otherwise only the generated name shows. */
  allowCustom: boolean;
  /** A refusal to show under the field, such as "Please choose different wording." */
  error?: string | null;
  disabled?: boolean;
}

export function NicknameField({
  label,
  generated,
  value,
  onChange,
  allowCustom,
  error = null,
  disabled = false,
}: NicknameFieldProps) {
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();
  const custom = "custom" in value ? value.custom : "";
  const describedBy = error === null ? hintId : `${hintId} ${errorId}`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="font-bold">
        {label}
      </label>
      {allowCustom ? (
        <input
          id={fieldId}
          type="text"
          value={custom}
          placeholder={generated}
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          spellCheck={false}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={error === null ? undefined : true}
          onChange={(event) => {
            const text = event.target.value;
            onChange(text.trim() === "" ? { generated } : { custom: text });
          }}
          className={cx(
            "min-h-12 rounded-2xl border-2 border-foreground/60 bg-background px-4 text-lg outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-foreground",
            error !== null && "border-dashed border-foreground",
          )}
        />
      ) : (
        <output
          id={fieldId}
          aria-describedby={describedBy}
          className="min-h-12 rounded-2xl bg-muted px-4 py-2.5 text-lg font-semibold"
        >
          {generated}
        </output>
      )}
      <p id={hintId} className="text-sm text-muted-foreground">
        {allowCustom
          ? NICKNAME_COPY.customHint(generated)
          : NICKNAME_COPY.generatedHint}
      </p>
      {error === null ? null : (
        <p id={errorId} className="text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
