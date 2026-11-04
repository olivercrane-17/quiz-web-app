"use client";

/**
 * The Daily header's More menu (DESIGN §6.13, PRD §3.1.3): How to play and
 * the stopwatch's Hide or Show, in the overflow menu rather than as
 * surprise buttons (RITE round 1, R1-04 and R1-05). Sound, high-contrast
 * feedback, reduce motion and All settings join it with DLY-2 and SET-1.
 *
 * ARIA's menu button pattern: the button names the menu and says whether
 * it is open; Arrow keys move through the items and wrap, Home and End
 * jump, Escape closes it back to what opened it, Tab closes it and moves
 * on, and a press outside closes it. The screen owns whether it is open and
 * which item takes focus, because the stopwatch opens the same menu, at
 * Hide stopwatch (DESIGN §6.7).
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type Ref,
} from "react";

import { buttonClasses } from "@/ui/button-classes";

import { DAILY_SCREEN_COPY } from "../client-copy";

export type MoreMenuItem = "how_to_play" | "stopwatch";

export interface MoreMenuProps {
  /** Null while closed; otherwise the item that takes focus as it opens. */
  openAt: MoreMenuItem | null;
  /** The menu was opened from the More button (not the stopwatch). */
  fromButton: boolean;
  onOpen(at: MoreMenuItem, opener: HTMLElement): void;
  /** `restoreFocus`: back to whatever opened it (Escape). */
  onClose(restoreFocus: boolean): void;
  stopwatchShown: boolean;
  onHowToPlay(): void;
  onToggleStopwatch(): void;
  menuId: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

const COPY = DAILY_SCREEN_COPY.more;
/** A 3 px ring inside the item, so the menu's edge never clips it (DESIGN §11). */
const ITEM_CLASSES =
  "min-h-11 rounded-xl px-3 text-left text-base font-semibold outline-offset-[-3px] hover:bg-foreground/5 focus-visible:outline-[3px] focus-visible:outline-foreground";
const ITEMS: readonly MoreMenuItem[] = ["how_to_play", "stopwatch"];

/** Three dots in a row: "more" (DESIGN §5). */
function MoreIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export function MoreMenu({
  openAt,
  fromButton,
  onOpen,
  onClose,
  stopwatchShown,
  onHowToPlay,
  onToggleStopwatch,
  menuId,
  buttonRef,
}: MoreMenuProps) {
  const open = openAt !== null;
  const menuRef = useRef<HTMLDivElement>(null);

  const items = (): HTMLButtonElement[] => [
    ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    ) ?? []),
  ];

  // The item the menu opened at takes focus, as the pattern asks.
  useLayoutEffect(() => {
    if (openAt === null) return;
    const index = ITEMS.indexOf(openAt);
    items()[index]?.focus();
  }, [openAt]);

  // A press anywhere but the menu or what opens it closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-more-menu-button], [data-stopwatch]") !== null
      ) {
        return;
      }
      onClose(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const at = list.findIndex((item) => item === document.activeElement);
    const move = (to: number) => {
      event.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(at + 1);
        return;
      case "ArrowUp":
        move(at - 1);
        return;
      case "Home":
        move(0);
        return;
      case "End":
        move(list.length - 1);
        return;
      case "Escape":
        event.preventDefault();
        onClose(true);
        return;
      case "Tab":
        // Focus moves on to wherever Tab takes it; the menu just closes.
        onClose(false);
        return;
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={COPY.label}
        aria-haspopup="menu"
        aria-expanded={open && fromButton}
        aria-controls={open ? menuId : undefined}
        data-more-menu-button=""
        onClick={(event) => {
          if (open) onClose(false);
          else onOpen("how_to_play", event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          onOpen(
            event.key === "ArrowUp" ? "stopwatch" : "how_to_play",
            event.currentTarget,
          );
        }}
        className={buttonClasses({ variant: "icon" })}
      >
        <MoreIcon />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={COPY.label}
          data-more-menu=""
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-20 mt-2 flex min-w-[12rem] flex-col rounded-2xl border border-border bg-background p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={onHowToPlay}
            className={ITEM_CLASSES}
          >
            {COPY.howToPlay}
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={onToggleStopwatch}
            className={ITEM_CLASSES}
          >
            {stopwatchShown ? COPY.hideStopwatch : COPY.showStopwatch}
          </button>
        </div>
      ) : null}
    </div>
  );
}
