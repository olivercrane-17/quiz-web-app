/**
 * Extension point (ARCHITECTURE §2.3): the incident banner slot under every
 * top bar (DESIGN §6.10). The shell renders `<IncidentBanner />` in each
 * header.
 *
 * A stub until INC-1, which fills it with the banners of PRD §3.15.2: a
 * polite status region, rendered in place when known at load and slid in
 * as an overlay when late, so nothing shifts (AC-INC-05).
 *
 * Size: it sits in every header, so it is in the first load of every tab
 * page, Home included (§10.9 item 2). Keep this file a small "use client"
 * wrapper under 1 kB gzipped (the health check and the empty slot) and load
 * the banner bodies and their copy with dynamic() when one is due.
 */
export function IncidentBanner() {
  return null;
}
