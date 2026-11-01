/**
 * Extension point (ARCHITECTURE §2.3): the Share button on the stop screen,
 * archive results, practice results and the finished home card (PRD §3.5,
 * DESIGN §6.11). Screens render `<ShareButton payload={...} surface="stop" />`
 * with text built by the engine's share module.
 *
 * A stub until SHR-1, which builds it: Web Share with text only, the
 * clipboard as fallback with its status copy, a selected read-only text box
 * as the last resort, the mini grid inside the button, and the
 * `share_open`, `share_complete` and `share_cancel` events. It renders
 * nothing until then.
 */
import type { EventProps } from "@/analytics/dictionary";
import type { ShareCell } from "@/engine/types";

/** Where the button sits, as `share_open` records it. */
export type ShareSurface = EventProps<"share_open">["surface"];

export interface SharePayload {
  /** Exactly what is shared: path-only link last, never an answer (PRD §3.5.1). */
  text: string;
  /** The run's analytics mode for the share events (`analyticsMode()` maps a run mode). */
  mode: EventProps<"share_open">["mode"];
  /** The player's own rows, drawn small inside the button; null for no preview. */
  grid: readonly (readonly ShareCell[])[] | null;
}

export interface ShareButtonProps {
  payload: SharePayload;
  surface: ShareSurface;
}

export function ShareButton(_props: ShareButtonProps) {
  return null;
}
