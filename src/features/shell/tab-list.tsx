/**
 * The four tab links, with or without the active marker. The tab bar
 * renders it twice: once as the `<Suspense>` fallback with no marker (what
 * a prerender shows while `usePathname` suspends, ARCHITECTURE §10.2 rule
 * 2), and once from `ActiveTabList` with the marker.
 *
 * At the bottom (phones) each tab is an icon over its label; in the top bar
 * (from 768 px) the label alone. The active tab is in ink with an eft bar,
 * at its top edge below and under the label above (DESIGN §6.13); the bar
 * is decorative, `aria-current` carries the state.
 */
import type { Route } from "next";
import Link from "next/link";
import type { ComponentType } from "react";

import {
  CalendarDaysIcon,
  LayersIcon,
  UserRoundIcon,
  UsersIcon,
  type IconProps,
} from "@/ui/icons";

import { TABS, type ActiveTab, type TabId } from "./tabs";

export type TabPlacement = "top" | "bottom";

/** DESIGN §5's tab icons. */
const TAB_ICONS: Record<TabId, ComponentType<IconProps>> = {
  today: CalendarDaysIcon,
  practice: LayersIcon,
  groups: UsersIcon,
  me: UserRoundIcon,
};

export function TabList({
  active,
  placement,
}: {
  active: ActiveTab | null;
  placement: TabPlacement;
}) {
  return (
    <ul className="kn-tabs">
      {TABS.map((tab) => {
        const current = active?.tab === tab.id;
        const Icon = TAB_ICONS[tab.id];
        return (
          <li key={tab.id}>
            <Link
              // Practice, Groups and Me are built by later tickets; the
              // destinations are fixed by PRD §6.1.
              href={tab.href as Route}
              prefetch={tab.prefetch ? undefined : false}
              aria-current={
                current ? (active.exact ? "page" : "true") : undefined
              }
              data-active={current ? "" : undefined}
              className="kn-tab"
            >
              {current ? (
                <span aria-hidden="true" className="kn-tab-marker" />
              ) : null}
              {placement === "bottom" ? <Icon size={24} /> : null}
              {tab.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
