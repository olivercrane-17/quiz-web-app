/**
 * What a route shows before its feature is built: its title as the page's
 * one `h1`, one line on what's coming there and what works now, and a way
 * home. The route-module stubs that CORE-0b and FIX-DS created for later
 * tickets render it until their owners replace them. A rewritten shell's
 * stub passes `<ShellParam>` (from `@/features/shell/client`) as its child.
 * This file imports no client module, so the shell's index stays free of
 * them.
 *
 * The line (RITE round 2, R2-07): a stub may pass its own. Otherwise a
 * destination the shell draws takes its line from `SHELL_COPY.comingSoon`
 * by its title, so Groups says what to do with a result until Groups
 * exist, and Settings where Hide stopwatch is. Those stubs belong to the
 * tickets that build the pages (GRP-1, STA-1, SET-1), and the title they
 * pass already names the destination. Anything else says it isn't ready
 * yet.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/ui/button-classes";
import { cx } from "@/ui/cx";

import { SHELL_COPY } from "./copy";

/** Each placeholder destination's line, by its title. */
const COMING_SOON: ReadonlyMap<string, string> = new Map(
  Object.entries(SHELL_COPY.comingSoon),
);

/** The line a placeholder titled `title` shows when it is given none. */
export function placeholderLine(title: string): string {
  return COMING_SOON.get(title) ?? SHELL_COPY.notReady;
}

export function PagePlaceholder({
  title,
  line,
  className,
  children,
}: {
  title: string;
  /**
   * What's coming here and what works now. Defaults to the destination's
   * own line, or else the general "isn't ready yet".
   */
  line?: string;
  /** Play screens add their own side gutters. */
  className?: string;
  /** Rendered last, such as a rewritten shell's param marker. */
  children?: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col items-start gap-4 py-6", className)}>
      <h1 className="font-display text-display-2">{title}</h1>
      <p data-placeholder-line="" className="text-body text-ink-2">
        {line ?? placeholderLine(title)}
      </p>
      <Link href="/" className={buttonClasses({ variant: "secondary" })}>
        {SHELL_COPY.goToToday}
      </Link>
      {children}
    </div>
  );
}
