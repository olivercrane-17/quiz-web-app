/**
 * The tab bar (DESIGN §6.13): a bottom bar on phones, text tabs in the top
 * bar from 768 px. The tabs layout renders one of each and CSS shows one,
 * so the focus order always follows the visual order; the hidden one is
 * `display: none` and out of the accessibility tree.
 *
 * The active marker sits inside `<Suspense>` (ARCHITECTURE §10.2 rule 2).
 * `marked={false}` leaves it out, for a page that belongs to no tab and is
 * prerendered once for many addresses: the not-found page, served at
 * `/practice` until that page exists, would otherwise mark a tab the
 * prerender didn't, and hydration would not match.
 *
 * The bottom bar is where toasts rise from (`data-toast-anchor`, DESIGN
 * §6.9): 16 px above it, never over a tab. Its height is the page's bottom
 * scroll inset (`ScrollInset`), so focus never lands under it.
 */
import { Suspense } from "react";

import { ActiveTabList } from "./active-tab-list";
import { SHELL_COPY } from "./copy";
import { ScrollInset } from "./scroll-inset";
import { TabList, type TabPlacement } from "./tab-list";

export function TabBar({
  placement,
  marked = true,
  className,
}: {
  placement: TabPlacement;
  /** False: no tab is marked as the current one, and the URL is never read. */
  marked?: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label={SHELL_COPY.mainNav}
      data-placement={placement}
      data-toast-anchor={placement === "bottom" ? "" : undefined}
      className={className}
    >
      {placement === "bottom" ? <ScrollInset edge="bottom" /> : null}
      {marked ? (
        <Suspense fallback={<TabList active={null} placement={placement} />}>
          <ActiveTabList placement={placement} />
        </Suspense>
      ) : (
        <TabList active={null} placement={placement} />
      )}
    </nav>
  );
}
