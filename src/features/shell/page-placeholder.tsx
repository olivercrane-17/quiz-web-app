/**
 * What a route shows before its feature is built: its title as the page's
 * one `h1`, a plain line, and a way home. The route-module stubs that
 * CORE-0b created for later tickets render it until their owners replace
 * them. A rewritten shell's stub passes `<ShellParam>` (from
 * `@/features/shell/client`) as its child. This file imports no client
 * module, so the shell's index stays free of them.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/ui/button-classes";
import { cx } from "@/ui/cx";

import { SHELL_COPY } from "./copy";

export function PagePlaceholder({
  title,
  className,
  children,
}: {
  title: string;
  /** Play screens add their own side gutters. */
  className?: string;
  /** Rendered last, such as a rewritten shell's param marker. */
  children?: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col items-start gap-4 py-6", className)}>
      <h1 className="font-display text-display-2">{title}</h1>
      <p className="text-body text-ink-2">{SHELL_COPY.notReady}</p>
      <Link href="/" className={buttonClasses({ variant: "secondary" })}>
        {SHELL_COPY.goToToday}
      </Link>
      {children}
    </div>
  );
}
