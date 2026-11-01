/**
 * Screen-reader announcements through the app's one pair of live regions
 * (ARCHITECTURE §10.3, DESIGN §6.9, §11).
 *
 * - `polite` (`role="status"`): verdicts, counts, confirmations, errors.
 * - `assertive` (`role="alert"`): only a lost connection during a sealed
 *   round.
 *
 * The regions sit at the end of `<body>`, outside every route. They can't
 * live in a layout: Next keeps up to three visited routes mounted but
 * hidden (`<Activity>`, `display: none`), so a layout's regions could be
 * duplicated, or hidden with the route that rendered them, and a hidden
 * region is never read. `<LiveRegions />` creates them as soon as the page
 * hydrates, well before any message, because a screen reader may skip a
 * region that appears together with its first message.
 *
 * While a modal Sheet is open, the page behind it is inert (`showModal()`),
 * the body's regions included, so messages go to the pair the sheet's
 * `<dialog>` carries (`[data-qz-live]`): the sheet that holds focus, else
 * the last one open. A message meant to outlive the sheet ("Report sent")
 * is announced after the sheet closes, so it reaches the page's pair.
 *
 * Each message goes in as a new node, so the same text twice in a row ("Not
 * quite...") is announced twice. Never use it for timers or the stopwatch,
 * which stay silent.
 */

export type Politeness = "polite" | "assertive";

export const LIVE_REGION_IDS: Readonly<Record<Politeness, string>> = {
  polite: "qz-live-polite",
  assertive: "qz-live-assertive",
};

/** The same visually hidden box as Tailwind's `sr-only`. */
const VISUALLY_HIDDEN =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0";

const OPEN_MODAL_SHEET = 'dialog[open][data-sheet="modal"]';

/** The live region of the topmost open modal sheet, if one is open. */
function sheetRegion(politeness: Politeness): HTMLElement | null {
  const focused =
    document.activeElement?.closest<HTMLDialogElement>(OPEN_MODAL_SHEET);
  const sheet =
    focused ??
    [...document.querySelectorAll<HTMLDialogElement>(OPEN_MODAL_SHEET)].at(-1);
  return (
    sheet?.querySelector<HTMLElement>(
      `:scope > [data-qz-live="${politeness}"]`,
    ) ?? null
  );
}

function region(politeness: Politeness): HTMLElement {
  const inSheet = sheetRegion(politeness);
  if (inSheet !== null) return inSheet;
  const id = LIVE_REGION_IDS[politeness];
  const existing = document.getElementById(id);
  if (existing !== null) return existing;
  const created = document.createElement("div");
  created.id = id;
  created.setAttribute("role", politeness === "polite" ? "status" : "alert");
  created.setAttribute("aria-live", politeness);
  created.setAttribute("aria-atomic", "true");
  created.setAttribute("style", VISUALLY_HIDDEN);
  document.body.append(created);
  return created;
}

/** Creates both regions once per document; later calls find them. */
export function ensureLiveRegions(): void {
  if (typeof document === "undefined") return;
  region("polite");
  region("assertive");
}

/** Speaks `message` through a live region. A no-op on the server and for empty text. */
export function announce(
  message: string,
  politeness: Politeness = "polite",
): void {
  if (typeof document === "undefined" || message.trim() === "") return;
  const target = region(politeness);
  const node = document.createElement("p");
  node.textContent = message;
  target.replaceChildren(node);
}

/** Empties every region, the open sheets' too, such as when a screen unmounts. */
export function clearAnnouncements(): void {
  if (typeof document === "undefined") return;
  for (const id of Object.values(LIVE_REGION_IDS)) {
    document.getElementById(id)?.replaceChildren();
  }
  for (const inner of document.querySelectorAll("[data-qz-live]")) {
    inner.replaceChildren();
  }
}
