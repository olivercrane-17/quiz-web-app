/**
 * A play screen's frame (PRD §6.1, DESIGN §6.13): the focus-mode header,
 * then the page's `<main>`. Every screen in the `(play)` group renders it,
 * because only the screen knows its run's progress and where Leave goes.
 *
 * The header comes before `<main>`, never inside it: "Skip to content"
 * then really skips Leave and the progress (WCAG 2.4.1), and a `<header>`
 * outside `<main>` is the page's banner landmark. The `(play)` layout adds
 * the skip link and the live regions around it.
 */
import type { ReactNode } from "react";

import { cx } from "@/ui/cx";

import { MAIN_ID } from "./landmarks";
import { PlayHeader, type PlayHeaderProps } from "./play-header";

export interface PlayFrameProps {
  header: PlayHeaderProps;
  children: ReactNode;
  /** Extra classes for `<main>`, which is a full-width flex column. */
  className?: string;
}

export function PlayFrame({ header, children, className }: PlayFrameProps) {
  return (
    <>
      <PlayHeader {...header} />
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className={cx("flex w-full flex-1 flex-col outline-none", className)}
      >
        {children}
      </main>
    </>
  );
}
