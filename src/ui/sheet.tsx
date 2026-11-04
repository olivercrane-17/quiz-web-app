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
 * top radius, the 36 by 4 grab handle, the sheet shadow, a rise of 360 ms
 * while a modal's scrim fades in (a fade under reduced motion). A modal's
 * title is set in `display-5`, the explanation sheet's in `display-3`.
 * `Dialog` (./dialog) is the modal one by name.
 *
 * The parent owns `open`. Children render only while open.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";

import { buttonClasses } from "./button-classes";
import { UI_COPY } from "./copy";
import { cx } from "./cx";
import { CrossIcon } from "./icons";

export interface SheetProps {
  open: boolean;
  /** False for the explanation sheet. */
  modal?: boolean;
  title: ReactNode;
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
  titleAs?: "h2" | "h3";
  /** The title heading, focusable (tabIndex -1), for focus moves such as AC-DLY-18. */
  titleRef?: Ref<HTMLHeadingElement>;
  description?: ReactNode;
  /** Modal only: Escape, the scrim and the close button. Omit for a sheet that must be answered. */
  onClose?: () => void;
  closeLabel?: string;
  /** What takes focus when a modal sheet opens; the first control otherwise. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Short phones (under 740 px tall): the compact explanation sheet. */
  compact?: boolean;
  /** The bottom row: primary first on phones. */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * True for the rest of the task in which the player pressed (a pointerdown
 * or keydown anywhere), so an inline sheet that opens in that task knows the
 * press opened it. Watched from the first inline sheet's mount; these
 * listeners run before React's own, which sit on the document.
 */
let pressing = false;
let watchingPresses = false;

function watchPresses(): void {
  if (watchingPresses || typeof window === "undefined") return;
  watchingPresses = true;
  const mark = () => {
    pressing = true;
    setTimeout(() => {
      pressing = false;
    }, 0);
  };
  window.addEventListener("pointerdown", mark, true);
  window.addEventListener("keydown", mark, true);
}

function SheetBody({
  title,
  hideTitle,
  titleAs: Heading = "h2",
  titleRef,
  titleId,
  description,
  descriptionId,
  actions,
  children,
  compact,
  closeButton,
}: Pick<
  SheetProps,
  | "title"
  | "hideTitle"
  | "titleAs"
  | "titleRef"
  | "description"
  | "actions"
  | "children"
  | "compact"
> & {
  titleId: string;
  descriptionId: string;
  closeButton: ReactNode;
}) {
  return (
    <div className="kn-sheet-body" data-compact={compact ? "" : undefined}>
      <span aria-hidden="true" className="kn-sheet-grab" />
      <div className="kn-sheet-head">
        <Heading
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className={cx("kn-sheet-title", hideTitle && "sr-only")}
        >
          {title}
        </Heading>
        {closeButton}
      </div>
      {description === undefined ? null : (
        <div id={descriptionId} className="kn-sheet-text">
          {description}
        </div>
      )}
      {children}
      {actions === undefined ? null : (
        <div className="kn-sheet-actions">{actions}</div>
      )}
    </div>
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

function InlineSheet({
  open,
  className,
  id,
  description,
  initialFocusRef,
  ...body
}: SheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  /** False while the sheet has been open since it mounted (a reload). */
  const closedSinceMount = useRef(!open);

  useEffect(() => {
    watchPresses();
  }, []);

  useEffect(() => {
    if (open) initialFocusRef?.current?.focus();
  }, [open, initialFocusRef]);

  // Before paint, and before the round's own layout effects (a child's
  // effects run first): there at once, or unseen until it rises.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!open || section === null) {
      closedSinceMount.current = true;
      return;
    }
    if (section.dataset.arrival !== undefined) return;
    section.dataset.arrival =
      !closedSinceMount.current || pressing ? "instant" : "pending";
  }, [open]);

  // After every layout effect of the commit (the round's scroll to Continue
  // among them), the rise starts; a tap or key anywhere completes it.
  useEffect(() => {
    const section = sectionRef.current;
    if (!open || section === null) return;
    if (section.dataset.arrival === "pending") section.dataset.arrival = "rise";
    if (
      section.dataset.arrival !== "rise" ||
      typeof section.getAnimations !== "function"
    ) {
      return;
    }
    const complete = () => {
      for (const animation of section.getAnimations()) animation.finish();
    };
    window.addEventListener("pointerdown", complete, true);
    window.addEventListener("keydown", complete, true);
    return () => {
      window.removeEventListener("pointerdown", complete, true);
      window.removeEventListener("keydown", complete, true);
    };
  }, [open]);

  if (!open) return null;
  return (
    <section
      ref={sectionRef}
      id={id}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      data-sheet="inline"
      className={cx("kn-sheet", className)}
    >
      <SheetBody
        {...body}
        description={description}
        titleId={titleId}
        descriptionId={descriptionId}
        closeButton={null}
      />
    </section>
  );
}

export function Sheet({ modal = true, ...props }: SheetProps) {
  return modal ? <ModalSheet {...props} /> : <InlineSheet {...props} />;
}
