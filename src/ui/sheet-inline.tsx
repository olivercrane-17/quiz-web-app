"use client";

/**
 * The inline sheet (DESIGN §6.10): the explanation sheet of every reveal,
 * `<Sheet modal={false}>` by another name. It lives apart from the modal
 * sheet (./sheet.tsx, where both are described) so a screen that only ever
 * shows explanations, a practice run say, loads no dialog, scrim, grab
 * handle or drag code (RITE round 4's bundle work, §10.9). `Sheet` still
 * renders it for `modal={false}`.
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

import { cx } from "./cx";

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

export function SheetBody({
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
  grab,
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
  /** The grab handle, on a sheet a drag can dismiss; null elsewhere. */
  grab: ReactNode;
}) {
  return (
    <div className="kn-sheet-body" data-compact={compact ? "" : undefined}>
      {grab}
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

export function InlineSheet({
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
        // Nothing dismisses the explanation sheet but Continue: no handle.
        grab={null}
      />
    </section>
  );
}
