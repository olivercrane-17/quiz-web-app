/**
 * How to play's sheet, fetched as a chunk of its own (ARCHITECTURE §10.9):
 * the Daily's first paint needs neither its words nor the modal sheet's
 * code. It stands apart from the screen so a test can make the fetch fail,
 * as it does offline or on a chunk error.
 */
import type { HowToPlaySheet } from "./how-to-play-sheet";

export function loadHowToPlaySheet(): Promise<typeof HowToPlaySheet> {
  return import("./how-to-play-sheet").then((sheet) => sheet.HowToPlaySheet);
}
