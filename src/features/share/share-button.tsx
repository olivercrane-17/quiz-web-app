"use client";

/**
 * Extension point (ARCHITECTURE §2.3): the Share button on the stop screen,
 * archive results, practice results and the finished home card (PRD §3.5,
 * DESIGN §6.11). Screens render `<ShareButton payload={...} surface="stop" />`
 * with text built by the engine's share module.
 *
 * The greybox path (RITE round 1, R1-01), in PRD §3.5.2's order:
 *
 * 1. Web Share with the text alone, the link as its last line, so every app
 *    keeps text-then-link order. Resolving logs `share_complete` (native);
 *    an `AbortError` (the player closed the sheet) logs `share_cancel` and
 *    nothing else. Any other refusal, as in-app browsers give, falls through.
 * 2. The clipboard: on success, `share_complete` (clipboard) and "Copied.
 *    Paste it into your group chat." as a toast, which says it in the
 *    status region too (DESIGN §6.9).
 * 3. When both fail, a read-only text box with the text selected and "Copy
 *    this text", sized to the whole text and as wide as its row; the
 *    player's own copy from it logs `share_complete` (manual), once.
 *
 * After a copy the button's own label reads "Copied" for two seconds
 * (RITE round 4, R4-06), so the confirmation is where the press was as
 * well as in the toast; the button keeps the wider label's width, so
 * nothing beside it moves.
 *
 * Every press logs `share_open` first, which never counts as a share. A
 * press while the share sheet is still open does nothing. The toast is the
 * design system's (`@/ui/toast`). SHR-1 owns this file from
 * Wave 12: it draws the mini grid inside the button from `payload.grid`
 * and moves these words into the share feature's copy.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { EventProps } from "@/analytics/dictionary";
import type { ShareCell } from "@/engine/types";
import { track } from "@/features/analytics/track";
import { Button } from "@/ui/button";
import { showToast } from "@/ui/toast";

/** Where the button sits, as `share_open` records it. */
export type ShareSurface = EventProps<"share_open">["surface"];

export interface SharePayload {
  /** Exactly what is shared: path-only link last, never an answer (PRD §3.5.1). */
  text: string;
  /** The run's analytics mode for the share events (`analyticsMode()` maps a run mode). */
  mode: EventProps<"share_open">["mode"];
  /** The player's own rows, drawn small inside the button; null for no preview. */
  grid: readonly (readonly ShareCell[])[] | null;
}

export interface ShareButtonProps {
  payload: SharePayload;
  surface: ShareSurface;
}

/** The button's words (PRD §3.5.2, DESIGN §1.4). */
export const SHARE_BUTTON_COPY = {
  share: "Share",
  copied: "Copied. Paste it into your group chat.",
  /** The button's own label for two seconds after a copy (R4-06). */
  copiedLabel: "Copied",
  copyThis: "Copy this text",
} as const;

/** How long the button reads "Copied" after a copy (R4-06). */
export const COPIED_LABEL_MS = 2_000;

type Shared = "native" | "cancelled" | "unavailable";

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** Web Share with the text alone (PRD §3.5.2). */
async function shareNatively(text: string): Promise<Shared> {
  const nav: Partial<Pick<Navigator, "share" | "canShare">> =
    typeof navigator === "undefined" ? {} : navigator;
  if (typeof nav.share !== "function") return "unavailable";
  if (typeof nav.canShare === "function" && !nav.canShare({ text })) {
    return "unavailable";
  }
  try {
    await nav.share({ text });
    return "native";
  } catch (error) {
    // The player closed the sheet; anything else falls to the clipboard.
    return isAbort(error) ? "cancelled" : "unavailable";
  }
}

/**
 * Brings a focused share box into view whole, not just its caret, which is
 * all a browser scrolls to when a text box takes focus. With the page's
 * scroll padding, the box then clears a bar held at the bottom of the
 * screen, such as the stop screen's dock (R1-12, WCAG 2.4.11). A box that
 * is already in view stays put.
 */
export function revealWholeBox(box: HTMLElement): void {
  if (typeof box.scrollIntoView === "function") {
    box.scrollIntoView({ block: "nearest" });
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (typeof clipboard?.writeText !== "function") return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareButton({ payload, surface }: ShareButtonProps) {
  const { text, mode } = payload;
  const [manual, setManual] = useState(false);
  /** The clipboard took the text: the label says so for two seconds. */
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sharing = useRef(false);
  const copiedByHand = useRef(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const boxId = useId();

  // The last resort opens on the text, selected, so one copy takes it all.
  useLayoutEffect(() => {
    if (!manual) return;
    const box = boxRef.current;
    if (box === null) return;
    box.focus();
    box.select();
  }, [manual]);

  useEffect(
    () => () => {
      clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function share() {
    if (sharing.current) return;
    sharing.current = true;
    try {
      track("share_open", { mode, surface });
      const native = await shareNatively(text);
      if (native === "native") {
        track("share_complete", { method: "native", mode, surface });
        return;
      }
      if (native === "cancelled") {
        track("share_cancel", { mode, surface });
        return;
      }
      if (await copyToClipboard(text)) {
        track("share_complete", { method: "clipboard", mode, surface });
        showToast(SHARE_BUTTON_COPY.copied);
        setCopied(true);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_LABEL_MS);
        return;
      }
      copiedByHand.current = false;
      setManual(true);
    } finally {
      sharing.current = false;
    }
  }

  return (
    <div
      // Once the text box shows, it takes its row's whole width, so a
      // button row it sits in never squeezes it (R1-01).
      className={
        manual
          ? "flex w-full basis-full flex-col items-start gap-2"
          : "flex flex-col items-start gap-2"
      }
      data-share-button=""
    >
      <Button
        variant="secondary"
        onClick={() => {
          void share();
        }}
      >
        {/* The wider label's width is held by an unseen pseudo-element,
            so "Copied" moves nothing beside the button. */}
        <span
          data-share-label={copied ? "copied" : "share"}
          data-wide={SHARE_BUTTON_COPY.copiedLabel}
          className="inline-flex flex-col items-center after:invisible after:h-0 after:overflow-hidden after:content-[attr(data-wide)]"
        >
          {copied ? SHARE_BUTTON_COPY.copiedLabel : SHARE_BUTTON_COPY.share}
        </span>
      </Button>
      {manual ? (
        <div className="flex w-full flex-col gap-1">
          <label htmlFor={boxId} className="text-sm font-semibold">
            {SHARE_BUTTON_COPY.copyThis}
          </label>
          <textarea
            id={boxId}
            ref={boxRef}
            readOnly
            value={text}
            // The fallback height where field sizing isn't supported; where
            // it is, the box grows to the whole text, wrapped lines included.
            rows={text.split("\n").length}
            data-share-fallback=""
            onFocus={(event) => {
              revealWholeBox(event.currentTarget);
            }}
            onCopy={() => {
              if (copiedByHand.current) return;
              copiedByHand.current = true;
              track("share_complete", { method: "manual", mode, surface });
            }}
            className="field-sizing-content w-full resize-none rounded-xl border border-border bg-muted p-3 font-sans text-base outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-foreground"
          />
        </div>
      ) : null}
    </div>
  );
}
