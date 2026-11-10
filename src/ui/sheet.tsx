"use client";

/**
 * Sheets and dialogs (DESIGN §6.10).
 *
 * - **Modal** (the default): the report sheet, the age band, the nickname
 *   question, confirms, the streak sheet. A native `<dialog>` opened with
 *   `showModal()`, so the page behind is inert, focus stays inside and the
 *   browser draws the scrim. A bottom sheet on phones, centred (max 480 px)
 *   from 768 px. Escape, the scrim and the close button call `onClose`;
 *   without `onClose` the sheet can only be left through its own actions.
 *   Focus moves to `initialFocusRef` (else the first control) on open and
 *   back to the opener on close. A sheet that must be answered and that the
 *   browser closes anyway (Chromium stops letting Escape be cancelled after
 *   repeated presses without a click) opens again at once. The dialog
 *   carries its own pair of live regions, because the page's pair is inert
 *   behind it; `announce()` writes there while the sheet is open.
 * - **Inline** (`modal={false}`): the explanation sheet of every reveal. It
 *   sits in space the layout reserved, so nothing above it moves, and stays
 *   until the player taps Continue. It is a labelled region; the round
 *   decides where focus goes (usually `titleRef`, the reveal heading).
 *   Opening by itself (the reveal's 1.2 s beat), it rises from below into
 *   that space (DESIGN §7.3): unseen for its first frame, so the round's
 *   scroll to Continue measures the final box, then 360 ms up, and a tap or
 *   key anywhere completes the rise at once. Opened by the player's own
 *   press (a pointerdown or keydown handler, as the tap that completes the
 *   automatic part at once), or open from the start (a reload), it is
 *   simply there. Its `data-arrival` says which.
 *
 * The looks are `.kn-dialog` and `.kn-sheet` in `ui.css`: surface, a 28 px
 * top radius, the sheet shadow, a rise of 360 ms while a modal's scrim
 * fades in (a fade under reduced motion). A modal's title is set in
 * `display-5`, the explanation sheet's in `display-3`. `Dialog` (./dialog)
 * is the modal one by name.
 *
 * **The grab handle** (36 by 4) does what it looks like it does (RITE
 * round 1, R1-36): on a modal sheet that can be dismissed, on a phone,
 * dragging it down moves the sheet with the finger, and letting go past a
 * third of its height (at most 120 px) or with a downward flick closes it
 * through `onClose`; a shorter drag springs back. The close button, the
 * scrim and Escape stay the ways to close it without dragging (WCAG
 * 2.5.7). A sheet that must be answered, and the inline explanation sheet,
 * which nothing dismisses but Continue, show no handle at all.
 *
 * The parent owns `open`. Children render only while open.
 *
 * The inline sheet's code is ./sheet-inline.tsx, which a round imports
 * directly (`InlineSheet`), so a screen with no modal sheet loads none of
 * this file.
 */
import {
  useEffect,
  useId,
  useRef,
  type PointerEvent,
  type RefObject,
} from "react";

import { buttonClasses } from "./button-classes";
import { UI_COPY } from "./copy";
import { cx } from "./cx";
import { CrossIcon } from "./icons";
import { InlineSheet, SheetBody, type SheetProps } from "./sheet-inline";

export type { SheetProps };

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Past this far down, letting go closes the sheet: a third of it, at most 120 px. */
export function dragDismissDistance(sheetHeight: number): number {
  return Math.max(48, Math.min(120, sheetHeight / 3));
}

/** A flick this fast downward (px per ms) closes the sheet however short the drag. */
const FLICK_SPEED = 0.6;

interface Drag {
  pointerId: number;
  startY: number;
  lastY: number;
  lastAt: number;
  speed: number;
}

/**
 * The grab handle of a dismissible modal sheet: drag it down to close the
 * sheet. Pointer input only, so it is hidden from screen readers; the
 * close button, the scrim and Escape do the same without a drag.
 */
function SheetGrab({
  sheetRef,
  onDismiss,
}: {
  sheetRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  const drag = useRef<Drag | null>(null);

  const move = (offset: number) => {
    const sheet = sheetRef.current;
    if (sheet === null) return;
    sheet.style.translate = offset > 0 ? `0 ${offset}px` : "";
  };
  const end = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    drag.current = null;
    const sheet = sheetRef.current;
    if (sheet !== null) delete sheet.dataset.dragging;
    const offset = event.clientY - current.startY;
    const height = sheet?.getBoundingClientRect().height ?? 0;
    if (
      !cancelled &&
      offset > 0 &&
      (offset >= dragDismissDistance(height) || current.speed >= FLICK_SPEED)
    ) {
      onDismiss();
      return;
    }
    // Spring back; the sheet's own transition carries it home.
    move(0);
  };

  return (
    <div
      aria-hidden="true"
      data-sheet-grab=""
      className="kn-sheet-grab"
      onPointerDown={(event) => {
        if (event.button !== 0 || sheetRef.current === null) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          lastY: event.clientY,
          lastAt: performance.now(),
          speed: 0,
        };
        sheetRef.current.dataset.dragging = "";
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current === null || current.pointerId !== event.pointerId) return;
        const now = performance.now();
        const elapsed = now - current.lastAt;
        if (elapsed > 0) {
          current.speed = (event.clientY - current.lastY) / elapsed;
        }
        current.lastY = event.clientY;
        current.lastAt = now;
        move(Math.max(0, event.clientY - current.startY));
      }}
      onPointerUp={(event) => {
        end(event, false);
      }}
      onPointerCancel={(event) => {
        end(event, true);
      }}
    />
  );
}

function ModalSheet({
  open,
  onClose,
  closeLabel = UI_COPY.close,
  initialFocusRef,
  className,
  id,
  description,
  ...body
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || !open) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // A sheet closed by a drag opens again in its place.
    dialog.style.translate = "";
    delete dialog.dataset.dragging;
    if (!dialog.hasAttribute("open")) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    const target =
      initialFocusRef?.current ??
      dialog.querySelector<HTMLElement>(FOCUSABLE) ??
      dialog;
    target.focus();
    return () => {
      if (dialog.hasAttribute("open")) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      if (opener?.isConnected) opener.focus();
    };
  }, [open, initialFocusRef]);

  const closeButton =
    onClose === undefined ? null : (
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className={buttonClasses({ variant: "icon", className: "-m-2" })}
      >
        <CrossIcon size={24} />
      </button>
    );

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      data-sheet="modal"
      // Escape: let the browser close it, then report through onClose (below).
      // A sheet without onClose must be answered, so Escape does nothing.
      onCancel={(event) => {
        if (onClose === undefined) event.preventDefault();
      }}
      // Closed by the browser (Escape) while the parent still has it open.
      // A sheet that must be answered reopens: its cancel stops being
      // cancelable after repeated Escapes without a user activation.
      onClose={() => {
        if (!open) return;
        if (onClose !== undefined) {
          onClose();
          return;
        }
        const dialog = dialogRef.current;
        if (dialog === null || dialog.hasAttribute("open")) return;
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }}
      // A click on the scrim lands on the dialog itself, outside the body.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
      // Browsers without showModal (and test DOMs) get Escape by hand.
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          typeof dialogRef.current?.showModal !== "function"
        ) {
          onClose?.();
        }
      }}
      className={cx("kn-dialog", className)}
    >
      {open ? (
        <SheetBody
          {...body}
          description={description}
          titleId={titleId}
          descriptionId={descriptionId}
          closeButton={closeButton}
          grab={
            onClose === undefined ? null : (
              <SheetGrab sheetRef={dialogRef} onDismiss={onClose} />
            )
          }
        />
      ) : null}
      {/*
       * showModal() makes everything outside the dialog inert, the body's
       * live regions included, so announce() writes here while the sheet is
       * open (WCAG 4.1.3). Both exist before the first message.
       */}
      <div
        data-qz-live="polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        data-qz-live="assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </dialog>
  );
}

export function Sheet({ modal = true, ...props }: SheetProps) {
  return modal ? <ModalSheet {...props} /> : <InlineSheet {...props} />;
}
