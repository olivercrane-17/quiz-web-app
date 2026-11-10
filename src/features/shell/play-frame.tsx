/**
 * A play screen's frame (PRD §6.1, DESIGN §6.13): the focus-mode header,
 * then the page's `<main>`. Every screen in the `(play)` group renders it,
 * because only the screen knows its run's progress and where Leave goes.
 *
 * The header comes before `<main>`, never inside it: "Skip to content"
 * then really skips Leave and the progress (WCAG 2.4.1), and a `<header>`
 * outside `<main>` is the page's banner landmark. The `(play)` layout adds
 * the skip link and the live regions around it. `<main>` carries the
 * landmark's id only while its route is on screen (`MainLandmark`).
 *
 * `.kn-play-main` (shell.css) sets `hyphens: manual` for everything a
 * play screen's text inherits (RITE round 2, R2-17). An element with its
 * own `hyphens` utility still overrides it, as the Mystery's clue text
 * does until FIX2-MYS drops its `hyphens-auto`.
 */
import type { ReactNode } from "react";

import { cx } from "@/ui/cx";

import { MainLandmark } from "./main-landmark";
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
      <MainLandmark
        className={cx(
          "kn-play-main flex w-full flex-1 flex-col outline-none",
          className,
        )}
      >
        {children}
      </MainLandmark>
    </>
  );
}
