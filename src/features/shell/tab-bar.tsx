/**
 * The tab bar (DESIGN §6.13): a bottom bar on phones, text tabs in the top
 * bar from 768 px. The tabs layout renders one of each and CSS shows one,
 * so the focus order always follows the visual order; the hidden one is
 * `display: none` and out of the accessibility tree.
 *
 * The active marker sits inside `<Suspense>` (ARCHITECTURE §10.2 rule 2).
 */
import { Suspense } from "react";

import { ActiveTabList } from "./active-tab-list";
import { SHELL_COPY } from "./copy";
import { TabList, type TabPlacement } from "./tab-list";

export function TabBar({
  placement,
  className,
}: {
  placement: TabPlacement;
  className?: string;
}) {
  return (
    <nav
      aria-label={SHELL_COPY.mainNav}
      data-placement={placement}
      className={className}
    >
      <Suspense fallback={<TabList active={null} placement={placement} />}>
        <ActiveTabList placement={placement} />
      </Suspense>
    </nav>
  );
}
