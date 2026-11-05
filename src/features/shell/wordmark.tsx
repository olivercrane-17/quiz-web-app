/**
 * The wordmark, linking home (DESIGN §1.5): the newt mark at 36 px beside
 * "knewt" in Fraunces 800 at 29 px, with a 3 px gap. The link is named
 * "Knewt", which contains the lowercase word it shows (WCAG 2.5.3).
 */
import Link from "next/link";

import { cx } from "@/ui/cx";
import { NewtMark } from "@/ui/newt-mark";

import { SHELL_COPY } from "./copy";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={SHELL_COPY.brand}
      className={cx("kn-wordmark", className)}
    >
      <NewtMark size={36} />
      <span className="kn-wordmark-word">{SHELL_COPY.brand.toLowerCase()}</span>
    </Link>
  );
}
