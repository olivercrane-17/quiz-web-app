"use client";

/**
 * The param of a rewritten per-user path, for the island of its shell
 * (ARCHITECTURE §10.1, §10.2 rules 2 and 8): `usePathParam("/g/:groupId")`
 * at /g/0f8fad5b is `"0f8fad5b"`.
 *
 * Every id of a pattern resolves to the one segment its shell lives at
 * (`/shell/group`), so React never remounts the island when the id
 * changes: Next reuses it on a push from /g/A to /g/B, and keeps it mounted
 * but hidden (`<Activity>`) while another tab shows, then shows that same
 * copy again at the next id or on Back. A read of `location.pathname` in a
 * mount effect would keep the first id for good. This hook follows the
 * router's pathname instead, so the island must reset its per-id state when
 * the value changes (or key itself by it).
 *
 * It is null on the server and during hydration, so the HTML matches what
 * the prerender produced, and null at the shell's own `/shell/<name>`
 * address (the invalid-link copy) or on any other route (while hidden).
 * Call it inside `<Suspense>` (§10.2 rule 2). `useParams` never works
 * here: the shells have no dynamic segment.
 */
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { matchPathParam } from "@/platform/path-param";

/** Nothing to subscribe to: usePathname re-renders on every navigation. */
function subscribe(): () => void {
  return () => {};
}

const onServer = (): null => null;

export function usePathParam(source: string): string | null {
  const pathname = usePathname();
  return useSyncExternalStore(
    subscribe,
    () => matchPathParam(source, pathname),
    onServer,
  );
}
