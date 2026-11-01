/**
 * The four tab links, with or without the active marker. The tab bar
 * renders it twice: once as the `<Suspense>` fallback with no marker (what
 * a prerender shows while `usePathname` suspends, ARCHITECTURE §10.2 rule
 * 2), and once from `ActiveTabList` with the marker.
 */
import type { Route } from "next";
import Link from "next/link";

import { cx } from "@/ui/cx";

import { TABS, type ActiveTab } from "./tabs";

export type TabPlacement = "top" | "bottom";

export function TabList({
  active,
  placement,
}: {
  active: ActiveTab | null;
  placement: TabPlacement;
}) {
  return (
    <ul
      className={cx(
        "flex",
        placement === "bottom" ? "w-full" : "items-center gap-1",
      )}
    >
      {TABS.map((tab) => {
        const current = active?.tab === tab.id;
        return (
          <li
            key={tab.id}
            className={placement === "bottom" ? "flex-1" : undefined}
          >
            <Link
              // Practice, Groups and Me are built by later tickets; the
              // destinations are fixed by PRD §6.1.
              href={tab.href as Route}
              prefetch={tab.prefetch ? undefined : false}
              aria-current={
                current ? (active.exact ? "page" : "true") : undefined
              }
              data-active={current ? "" : undefined}
              className={cx(
                "relative flex items-center justify-center font-bold outline-offset-[-3px] focus-visible:outline-[3px] focus-visible:outline-foreground",
                placement === "bottom"
                  ? "min-h-14 flex-col gap-0.5 text-xs"
                  : "min-h-11 rounded-lg px-3 text-base",
                current ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {current ? (
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute h-[3px] w-7 rounded-full bg-foreground",
                    placement === "bottom" ? "top-0" : "bottom-0.5",
                  )}
                />
              ) : null}
              {tab.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
