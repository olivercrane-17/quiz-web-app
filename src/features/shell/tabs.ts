/**
 * The four destinations (PRD §6.1, DESIGN §6.13) and which one a path
 * belongs to.
 *
 * A tab is the current page (`aria-current="page"`) only on its own
 * address; below it (the archive under Today, Settings and the challenge
 * shelf under Me) it marks the current section (`aria-current="true"`).
 * The static shells of §10.1 count as the sections they serve, because a
 * rewritten page is prerendered at its `/shell/...` path while the browser
 * shows the original one: both must pick the same tab, or hydration would
 * not match.
 */
import { SHELL_CLIENT_COPY } from "./client-copy";

export type TabId = "today" | "practice" | "groups" | "me";

export interface TabDefinition {
  id: TabId;
  href: string;
  label: string;
  /**
   * Whether the link prefetches. On wherever a page exists, placeholders
   * included (/g and /me until GRP-1 and STA-1): a prefetched page arrives
   * with its title, so Next's route announcer reads "Groups · Knewt"
   * rather than whatever heading the document holds first (RITE round 1,
   * R1-09). Off only while a destination has no page on this branch, since
   * that prefetch would log a 404: /practice until FIX-PRA's greybox
   * merges, and PRA-2 turns it on with the hub (a one-line Touch, §12.3).
   * PERF-1 checks every link when it tunes prefetching (ARCHITECTURE §10.9
   * item 5).
   */
  prefetch: boolean;
}

export const TABS: readonly TabDefinition[] = [
  {
    id: "today",
    href: "/",
    label: SHELL_CLIENT_COPY.tabs.today,
    prefetch: true,
  },
  {
    id: "practice",
    href: "/practice",
    label: SHELL_CLIENT_COPY.tabs.practice,
    prefetch: false,
  },
  {
    id: "groups",
    href: "/g",
    label: SHELL_CLIENT_COPY.tabs.groups,
    prefetch: true,
  },
  { id: "me", href: "/me", label: SHELL_CLIENT_COPY.tabs.me, prefetch: true },
];

export interface ActiveTab {
  tab: TabId;
  /** True on the tab's own address. */
  exact: boolean;
}

/** Path prefixes of each tab's section, beyond its own address. */
const SECTIONS: Readonly<Record<TabId, readonly string[]>> = {
  today: ["/archive"],
  practice: ["/practice", "/categories"],
  groups: ["/g", "/shell/group", "/shell/group-settings"],
  me: ["/me", "/settings", "/challenges", "/create", "/shell/editor"],
};

function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The tab whose section holds `pathname`, or null outside the four sections. */
export function tabForPath(pathname: string | null): ActiveTab | null {
  if (pathname === null || pathname === "") return null;
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  for (const tab of TABS) {
    if (path === tab.href) return { tab: tab.id, exact: true };
  }
  for (const tab of TABS) {
    if (SECTIONS[tab.id].some((prefix) => within(path, prefix))) {
      return { tab: tab.id, exact: false };
    }
  }
  return null;
}
