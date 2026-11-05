"use client";

/**
 * The sync code itself (DESIGN §12.25, PRD §3.10.2): the code in four
 * groups on a sunken well, set in Atkinson Hyperlegible Next 28/700 with
 * tabular figures and 0.08 em letter spacing, where every character must
 * be told apart; "Copy code" (secondary), "I've saved it" (text), and the
 * warning with the lock: "Anyone with this code can play as you, so keep
 * it private." `/me/sync` adds "Make a new code", behind a confirm.
 *
 * Mounted by `/me/sync`, the stop screen's sync offer, the claim card's
 * fallback, and the iOS install pitch and installed first run (CAL-1) and
 * the first server-saved quiz (EDT-3), each with its own trigger. Screen
 * readers hear the code one character at a time, group by group.
 */
import Link from "next/link";
import { useId, useState } from "react";

import { formatSyncCode, type SyncCode } from "@/engine/types";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { buttonClasses } from "@/ui/button-classes";
import { cx } from "@/ui/cx";
import { Dialog } from "@/ui/dialog";
import { CheckIcon, CopyIcon } from "@/ui/icons";
import { Skeleton } from "@/ui/skeleton";
import { showToast } from "@/ui/toast";

import { IDENTITY_CLIENT_COPY } from "../client-copy";
import { LockIcon } from "../icons";
import type { ScreenError } from "../errors";
import type { SyncTrigger } from "../offers/eligibility";
import { useSyncCode, type SaveMethod } from "./use-sync-code";

const COPY = IDENTITY_CLIENT_COPY;

export interface SyncCodePanelProps {
  /** What offered the code, for `sync_code_saved`. */
  trigger: SyncTrigger;
  /** Ask for a code at once when the device has none (the tap was Show my code). */
  autoCreate?: boolean;
  /** Offer "Make a new code" (`/me/sync`). */
  allowNew?: boolean;
  /** How "Show my code" looks: a secondary button, or a text button beside a card's own action. */
  showVariant?: "secondary" | "text";
  /** After Copy code or I've saved it. */
  onSaved?: (method: SaveMethod) => void;
  className?: string;
}

/** "K 7 Q X, 2 M 9 P, ...": the code as a screen reader should spell it. */
export function spokenCode(code: SyncCode): string {
  return formatSyncCode(code)
    .split("-")
    .map((group) => group.split("").join(" "))
    .join(", ");
}

function errorText(error: ScreenError): string {
  switch (error) {
    case "offline":
      return COPY.sync.errors.offline;
    case "rate_limited":
      return COPY.sync.errors.rateLimited;
    case "unavailable":
      return COPY.unavailable;
    default:
      return COPY.sync.errors.generic;
  }
}

function ErrorLine({
  error,
  onRetry,
}: {
  error: ScreenError;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3" data-sync-error="">
      <p className="text-body-sm text-incorrect-text">{errorText(error)}</p>
      {error === "generic" || error === "offline" ? (
        <Button variant="text" onClick={onRetry}>
          {COPY.tryAgain}
        </Button>
      ) : null}
    </div>
  );
}

function CodeWell({ code }: { code: SyncCode }) {
  return (
    <div
      className="rounded-md bg-sunken px-4 py-5 text-center"
      data-sync-code={code}
    >
      <p
        aria-hidden="true"
        className="font-text text-[1.75rem] leading-tight font-bold tracking-[0.08em] break-words tabular-nums select-all"
      >
        {formatSyncCode(code)}
      </p>
      <p className="sr-only">
        {COPY.sync.codeLabel}: {spokenCode(code)}
      </p>
    </div>
  );
}

export function SyncCodePanel({
  trigger,
  autoCreate = false,
  allowNew = false,
  showVariant = "secondary",
  onSaved,
  className,
}: SyncCodePanelProps) {
  const { view, request, markSaved } = useSyncCode(trigger, {
    autoCreate,
    onSaved,
  });
  const [confirming, setConfirming] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const warningId = useId();

  if (view.phase === "loading") {
    return (
      <div className={className} aria-busy="true" data-sync-panel="loading">
        <span className="sr-only">{COPY.sync.loading}</span>
        <Skeleton shape="block" height="5.5rem" />
      </div>
    );
  }

  if (view.phase === "no_profile") {
    return (
      <div
        className={cx("flex flex-col items-start gap-3", className)}
        data-sync-panel="no-profile"
      >
        <p className="text-body text-ink-2">{COPY.sync.noProfile}</p>
        <Link href="/daily" className={buttonClasses({ variant: "secondary" })}>
          {COPY.playDaily}
        </Link>
      </div>
    );
  }

  if (view.phase === "none") {
    return (
      <div
        className={cx("flex flex-col items-start gap-2", className)}
        data-sync-panel="none"
      >
        <Button
          variant={showVariant}
          busy={view.busy}
          onClick={() => {
            void request();
          }}
        >
          {COPY.sync.show}
        </Button>
        {view.mayReplace ? (
          <p className="text-meta text-ink-2">{COPY.sync.replacesOld}</p>
        ) : null}
        {view.error === null ? null : (
          <ErrorLine
            error={view.error}
            onRetry={() => {
              void request();
            }}
          />
        )}
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatSyncCode(view.code));
      setCopyFailed(false);
      showToast(COPY.sync.copied);
      markSaved("copy");
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div
      className={cx("flex flex-col gap-3", className)}
      data-sync-panel="ready"
    >
      <CodeWell code={view.code} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          aria-describedby={warningId}
          onClick={() => {
            void copy();
          }}
        >
          <CopyIcon size={18} />
          {COPY.sync.copy}
        </Button>
        <Button
          variant="text"
          onClick={() => {
            markSaved("confirm");
            announce(COPY.sync.savedLine);
          }}
        >
          {COPY.sync.saved}
        </Button>
      </div>
      {copyFailed ? (
        <p className="text-body-sm text-incorrect-text" role="status">
          {COPY.sync.copyFailed}
        </p>
      ) : null}
      {view.saved ? (
        <p className="flex items-center gap-2 text-body-sm" data-sync-saved="">
          <CheckIcon size={18} className="text-correct-text" />
          {COPY.sync.savedLine}
        </p>
      ) : null}
      <p
        id={warningId}
        className="flex items-start gap-2 text-body-sm text-ink-2"
      >
        <LockIcon size={18} className="mt-0.5" />
        {COPY.sync.warning}
      </p>
      {allowNew ? (
        <div>
          <Button
            variant="text"
            busy={view.busy}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {COPY.sync.makeNew}
          </Button>
          {view.error === null ? null : (
            <ErrorLine
              error={view.error}
              onRetry={() => {
                void request();
              }}
            />
          )}
          <Dialog
            open={confirming}
            title={COPY.sync.confirmNewTitle}
            description={COPY.sync.confirmNewBody}
            onClose={() => {
              setConfirming(false);
            }}
            closeLabel={COPY.cancel}
            actions={
              <>
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirming(false);
                    void request();
                  }}
                >
                  {COPY.sync.makeNew}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  {COPY.cancel}
                </Button>
              </>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
