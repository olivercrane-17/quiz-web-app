/**
 * The run this tab is playing: `qz:practice-run` in session storage, next
 * to `qz:practice-intent` (ARCHITECTURE §6.2). Unfinished runs live in
 * localStorage, which every tab shares, so without this a reload would
 * resume the newest run on the device, often another tab's, and both tabs
 * would then write the same `qz:runs:<id>`. Session storage belongs to one
 * tab and survives its reloads, which is exactly the scope a resume needs.
 *
 * Blocked storage reads as no run: the controller then falls back to the
 * newest run on the device, as it did before.
 */
import type { TabRunStore } from "./controller";

export const PRACTICE_TAB_RUN_KEY = "qz:practice-run";

/** Run ids are UUIDs; anything else in the key is ignored. */
const RUN_ID = /^[0-9a-f-]{8,64}$/i;

export const sessionTabRun: TabRunStore = {
  runId() {
    try {
      const value = sessionStorage.getItem(PRACTICE_TAB_RUN_KEY);
      return value !== null && RUN_ID.test(value) ? value : null;
    } catch {
      return null;
    }
  },
  setRunId(runId) {
    try {
      if (runId === null) sessionStorage.removeItem(PRACTICE_TAB_RUN_KEY);
      else sessionStorage.setItem(PRACTICE_TAB_RUN_KEY, runId);
    } catch {
      // Blocked storage: a reload falls back to the newest run on the device.
    }
  },
};
