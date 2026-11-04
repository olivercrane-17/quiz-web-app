"use client";

/**
 * A dialog (DESIGN §6.10): the report sheet ("What's wrong?"), the age band
 * ("How old are you?"), the nickname question, confirms (delete, restore
 * over existing progress) and the streak sheet. A bottom sheet on phones,
 * centred (max 480 px) from 768 px, the scrim behind, focus trapped,
 * Escape closes, the title in `display-5`, actions at the bottom (primary
 * first on phones, right-aligned on desktop).
 *
 * It is the modal `Sheet` under the name the screens look for; every rule of
 * `Sheet` applies, including the live regions it carries while open.
 */
import { Sheet, type SheetProps } from "./sheet";

export type DialogProps = Omit<SheetProps, "modal" | "compact">;

export function Dialog(props: DialogProps) {
  return <Sheet {...props} modal />;
}
