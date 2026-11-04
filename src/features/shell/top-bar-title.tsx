"use client";

/**
 * A tab page's title in the top bar (DESIGN §6.13): on phones, every tab
 * page but Today shows a centred `display-6` title over a `meta` line
 * between icon buttons, in place of the wordmark. From 768 px the bar
 * keeps the wordmark and the text tabs, so the page shows its own heading
 * there. Today renders none and keeps the wordmark.
 *
 * Render one anywhere in the page (the `(tabs)` layout is shared, so a
 * page can't replace its bar). It portals into the slot `AppHeader` keeps
 * beside the wordmark and marks the bar while it is mounted. `start` takes
 * an icon button at the left, such as Back; `end`, when given, replaces
 * the streak chip and Settings on phones, as the Group board's settings
 * icon does (DESIGN §12.20). The title is a line of the banner, not a
 * heading: the page keeps its own `h1`, hidden on phones if it only repeats
 * the title.
 *
 * The bar is prerendered with its wordmark, so on a full load the title
 * takes its place when the page hydrates; on a client navigation it is
 * there in the first frame.
 */
import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { TOP_BAR_TITLE_SLOT } from "./landmarks";

export interface TopBarTitleProps {
  /** The page's name: "Practice", or a Group's name. */
  title: ReactNode;
  /** The line under it: "12 members", "Updated 10 minutes ago". */
  meta?: ReactNode;
  /** An icon button at the left, such as Back. */
  start?: ReactNode;
  /** Icon buttons at the right, in place of the streak chip and Settings. */
  end?: ReactNode;
}

const noSubscription = () => () => {};
const findSlot = () => document.querySelector<HTMLElement>(TOP_BAR_TITLE_SLOT);
const noSlotOnTheServer = () => null;

export function TopBarTitle({ title, meta, start, end }: TopBarTitleProps) {
  // The slot is in the layout's markup and never changes: read it once the
  // page is on the client (null while it prerenders and hydrates).
  const slot = useSyncExternalStore(
    noSubscription,
    findSlot,
    noSlotOnTheServer,
  );
  const ownEnd = end !== undefined;

  useLayoutEffect(() => {
    const bar = slot?.closest<HTMLElement>(".kn-topbar");
    if (bar === null || bar === undefined) return;
    bar.dataset.titled = ownEnd ? "own-end" : "";
    return () => {
      bar.removeAttribute("data-titled");
    };
  }, [slot, ownEnd]);

  if (slot === null) return null;
  return createPortal(
    <>
      {start === undefined ? null : (
        <div className="kn-topbar-title-start">{start}</div>
      )}
      <p className="kn-topbar-heading">
        <span className="kn-topbar-heading-title">{title}</span>
        {meta === undefined ? null : (
          <span className="kn-topbar-heading-meta">{meta}</span>
        )}
      </p>
      {ownEnd ? <div className="kn-topbar-title-end">{end}</div> : null}
    </>,
    slot,
  );
}
