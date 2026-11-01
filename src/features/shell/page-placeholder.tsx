/**
 * What a route shows before its feature is built: its title as the page's
 * one `h1`, a plain line, and a way home. The route-module stubs that
 * CORE-0b created for later tickets render it until their owners replace
 * them.
 */
import Link from "next/link";

import { buttonClasses } from "@/ui/button-classes";
import { cx } from "@/ui/cx";

import { SHELL_COPY } from "./copy";

export function PagePlaceholder({
  title,
  className,
}: {
  title: string;
  /** Play screens add their own side gutters. */
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-start gap-4 py-6", className)}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-base text-muted-foreground">{SHELL_COPY.notReady}</p>
      <Link href="/" className={buttonClasses({ variant: "secondary" })}>
        {SHELL_COPY.goToToday}
      </Link>
    </div>
  );
}
