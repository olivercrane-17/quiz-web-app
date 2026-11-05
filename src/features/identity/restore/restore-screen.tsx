"use client";

/**
 * Restore from a code, `/restore` (PRD §3.10.2, §5.13; DESIGN §12.26): one
 * field, "Your sync code", grouped as you type, the hint "You'll find it in
 * Me, then Your sync code, on your other device." and the primary
 * "Restore".
 *
 * - A device with progress of its own (a registered identity, or practice
 *   history) confirms first; Cancel keeps its identity (AC-SYN-06).
 * - The device mints a new secret and sends it with the code; the server
 *   adds it as a credential and answers the player and profile, and the
 *   device switches to it, posts the backup cookie and lands on Today with
 *   "Welcome back, Plucky Otter. Your 23-day streak is here."
 * - A code that can't be one fails at once without costing an attempt;
 *   the server's refusals use the PRD's copy inline, next to the field.
 */
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { getBackend } from "@/backend";
import {
  parseSyncCode,
  type BackendError,
  type SyncCode,
} from "@/engine/types";
import { track } from "@/features/analytics/track";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";

import { bootClient } from "../boot";
import { IDENTITY_CLIENT_COPY } from "../client-copy";
import { ConfirmReplace, useDeviceStreak } from "../confirm-replace";
import { deviceHasProgress } from "../device";
import { mintSecret } from "../mint";
import { finishRestore } from "../restore-flow";
import {
  caretAfter,
  codeCharactersBefore,
  formatTypedCode,
} from "./code-input";

const COPY = IDENTITY_CLIENT_COPY;
/** The failure window (AC-SYN-04); a longer wait means the daily cap. */
const FAILURE_WINDOW_MS = 15 * 60_000;

function refusalText(error: BackendError): string {
  switch (error.code) {
    case "not_found":
    case "invalid_input":
      return COPY.restore.errors.bad;
    case "rate_limited":
      return (error.retryAfterMs ?? 0) > FAILURE_WINDOW_MS
        ? COPY.restore.errors.rateLimitedToday
        : COPY.restore.errors.rateLimited;
    case "offline":
      return COPY.restore.errors.offline;
    case "unavailable":
    case "feature_disabled":
      return COPY.unavailable;
    default:
      return COPY.restore.errors.generic;
  }
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function RestoreScreen() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SyncCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const streak = useDeviceStreak(hasProgress);
  const inputRef = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const ids = useId();
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;

  useEffect(() => {
    void bootClient().then(() => {
      setHasProgress(deviceHasProgress());
    });
  }, []);

  // Grouping rewrites the text; the caret stays after the same character.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (caret.current === null || input === null) return;
    if (document.activeElement === input) {
      input.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  }, [text]);

  const fail = (message: string) => {
    setError(message);
    announce(message);
    inputRef.current?.focus();
  };

  const redeem = async (code: SyncCode) => {
    setBusy(true);
    await bootClient();
    const replacing = deviceHasProgress();
    const secret = mintSecret();
    const backend = await getBackend();
    const result = await backend.identity.redeemSyncCode(code, secret);
    if (result.ok) {
      track("sync_code_redeem", { result: "ok", replaced_progress: replacing });
      const done = await finishRestore({
        restored: result.value,
        secret,
        source: "sync",
        code,
      });
      if (done) return;
      setBusy(false);
      fail(COPY.restore.errors.generic);
      return;
    }
    setBusy(false);
    const { code: reason } = result.error;
    if (reason === "not_found" || reason === "invalid_input") {
      track("sync_code_redeem", { result: "bad", replaced_progress: false });
    } else if (reason === "rate_limited") {
      track("sync_code_redeem", {
        result: "rate_limited",
        replaced_progress: false,
      });
    } else if (reason === "offline") {
      track("offline_state_shown", { feature: "restore" });
    }
    fail(refusalText(result.error));
  };

  return (
    <div className="flex flex-col gap-6" data-restore-screen="">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const code = parseSyncCode(text);
          if (code === null) {
            fail(COPY.restore.errors.bad);
            return;
          }
          if (isOffline()) {
            track("offline_state_shown", { feature: "restore" });
            fail(COPY.restore.errors.offline);
            return;
          }
          setError(null);
          // Asked after the boot, so a quick submit can't skip the confirm.
          void bootClient().then(() => {
            if (deviceHasProgress()) {
              setHasProgress(true);
              setConfirming(code);
            } else {
              void redeem(code);
            }
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-code`} className="text-label">
            {COPY.restore.fieldLabel}
          </label>
          <input
            ref={inputRef}
            id={`${ids}-code`}
            name="code"
            type="text"
            inputMode="text"
            enterKeyHint="go"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={text}
            readOnly={busy}
            aria-invalid={error !== null || undefined}
            aria-describedby={[hintId, error === null ? null : errorId]
              .filter((part) => part !== null)
              .join(" ")}
            className="h-14 w-full rounded-md border-2 border-ink bg-surface px-4 font-text text-[1.375rem] font-bold tracking-[0.08em] text-ink tabular-nums placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-3"
            onChange={(event) => {
              const raw = event.target.value;
              const at = event.target.selectionStart ?? raw.length;
              const formatted = formatTypedCode(raw);
              caret.current = caretAfter(codeCharactersBefore(raw, at));
              setText(formatted);
              setError(null);
            }}
          />
          <p id={hintId} className="text-meta text-ink-2">
            {COPY.restore.hint}
          </p>
          {error === null ? null : (
            <p
              id={errorId}
              className="text-body-sm text-incorrect-text"
              data-restore-error=""
            >
              {error}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          type="submit"
          busy={busy}
          className="self-start"
        >
          {COPY.restore.submit}
        </Button>
      </form>

      <Link
        href="/"
        className={buttonClasses({ variant: "text", className: "self-start" })}
      >
        {COPY.goToToday}
      </Link>

      <ConfirmReplace
        open={confirming !== null}
        streak={streak}
        via="code"
        onCancel={() => {
          setConfirming(null);
        }}
        onConfirm={() => {
          const code = confirming;
          setConfirming(null);
          if (code !== null) void redeem(code);
        }}
      />
    </div>
  );
}
