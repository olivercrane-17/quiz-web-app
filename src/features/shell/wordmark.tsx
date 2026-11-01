import Link from "next/link";

import { cx } from "@/ui/cx";

import { SHELL_COPY } from "./copy";

/** The name, linking home. DS-1 swaps the text for the drawn wordmark (DESIGN §1.5). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cx(
        "inline-flex min-h-11 items-center rounded-lg text-xl font-bold tracking-tight text-foreground outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-foreground",
        className,
      )}
    >
      {SHELL_COPY.brand}
    </Link>
  );
}
