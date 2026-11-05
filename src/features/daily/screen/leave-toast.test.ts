/**
 * The Daily's toast on Leave (DESIGN §6.9, RITE round 1 R1-38), which is
 * the design system's toast (`@/ui/toast`) since FIX-DS, and Leave's words,
 * which say whether the stopwatch keeps running (D19, R2-01).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRun, reduceRun, type RunState } from "@/engine/run";
import { config, metas } from "@/engine/run/testing";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import { LIVE_REGION_IDS } from "@/ui/announce";
import { TOAST_ANCHOR } from "@/ui/toast";

import { clockRunning } from "../model/labels";
import {
  TOAST_WAIT_MS,
  leaveWords,
  showToastAfterLeaving,
} from "./leave-toast";

/** Animation frames the test runs by hand. */
let frames: FrameRequestCallback[] = [];

function runFrames(count: number): void {
  for (let i = 0; i < count; i += 1) {
    const due = frames;
    frames = [];
    for (const frame of due) frame(0);
  }
}

const toasts = () => [
  ...document.querySelectorAll<HTMLElement>("[data-toast]"),
];
const status = () =>
  document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
  window.history.replaceState(null, "", "/daily");
});

afterEach(() => {
  document.body.replaceChildren();
  delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
});

describe("the Daily's toast on Leave", () => {
  it("R1-38 shows 'Saved' as the design system's toast once Leave has taken the player off the Daily, and says it in the status region", () => {
    showToastAfterLeaving("Saved", "/daily");
    runFrames(5);
    // Still on the Daily: the next screen isn't there to sit on yet.
    expect(toasts()).toEqual([]);

    window.history.pushState(null, "", "/");
    runFrames(2);
    const [toast] = toasts();
    expect(toast).toHaveTextContent("Saved");
    expect(toast).toHaveClass("kn-toast");
    expect(toast).toHaveAttribute("aria-hidden", "true");
    expect(status()).toBe("Saved");
  });

  it("R1-38 sits 16 px above the tab bar of the screen it lands on", () => {
    showToastAfterLeaving("Saved", "/daily");
    window.history.pushState(null, "", "/");
    // Today's bottom tab bar, the toast's anchor, arrives with the route.
    const nav = document.createElement("nav");
    nav.setAttribute(TOAST_ANCHOR.slice(1, -1), "");
    nav.getBoundingClientRect = () => ({ top: 700 }) as DOMRect;
    (Element.prototype as { checkVisibility?: () => boolean }).checkVisibility =
      () => true;
    document.body.append(nav);
    vi.stubGlobal("innerHeight", 760);
    runFrames(2);
    expect(toasts()[0]?.style.getPropertyValue("--kn-toast-bottom")).toBe(
      "76px",
    );
  });

  it("shows anyway if the address never changes, after a short wait", () => {
    showToastAfterLeaving("Saved", "/daily");
    runFrames(Math.ceil(TOAST_WAIT_MS / 16) + 2);
    expect(toasts()).toHaveLength(1);
  });
});

describe("Leave's words (D19, R2-01)", () => {
  const plugins = createEchoRegistry();
  const KEY = "00000000-0000-4000-8000-000000000001" as never;
  const fresh = () =>
    createRun(config(metas("mystery", "encore"), { sealed: true }), 0).state;
  const open = (state: RunState, at: number): RunState =>
    reduceRun(
      state,
      {
        type: "opened",
        at,
        index: state.index,
        open: {
          family: "mystery",
          index: state.index,
          clue: 1,
          clues: ["c1"],
          wrongGuesses: [],
          options: null,
          issuedAt: at,
        },
      },
      plugins,
    ).state;
  const RUNNING = {
    label:
      "Leave the Daily. Your progress is saved, and the stopwatch keeps running.",
    toast: "Saved. The stopwatch keeps running.",
  };
  const STOPPED = {
    label: "Leave the Daily. Your progress is saved.",
    toast: "Saved",
  };

  it("R2-01 says the stopwatch keeps running while a clue is open, or a guess is being checked", () => {
    const active = open(fresh(), 1_000);
    expect(active.phase).toBe("active");
    expect(clockRunning(active)).toBe(true);
    expect(leaveWords(active, true)).toEqual(RUNNING);
    const judging = reduceRun(
      active,
      {
        type: "intent",
        at: 2_000,
        key: KEY,
        intent: { family: "mystery", kind: "next_clue" },
      },
      plugins,
    ).state;
    expect(judging.phase).toBe("judging");
    expect(leaveWords(judging, true)).toEqual(RUNNING);
  });

  it("R2-01 keeps 'Saved' on a reveal, where the stopwatch is stopped", () => {
    const asked = reduceRun(
      open(fresh(), 1_000),
      {
        type: "intent",
        at: 2_000,
        key: KEY,
        intent: { family: "mystery", kind: "next_clue" },
      },
      plugins,
    ).state;
    const revealed = reduceRun(
      asked,
      {
        type: "verdict",
        at: 3_000,
        key: KEY,
        verdict: {
          kind: "resolved",
          next: null,
          reveal: {
            family: "mystery",
            answer: { entityId: "fx.x.country.echo" as never, display: "E" },
            clues: ["1", "2", "3", "4"],
            solvedOn: 1,
            points: 4,
            pickedOption: null,
            explanation: "",
            learnMore: "",
            sourceLabels: [],
            crowd: null,
          },
        },
      },
      plugins,
    ).state;
    expect(revealed.phase).toBe("revealed");
    expect(clockRunning(revealed)).toBe(false);
    expect(leaveWords(revealed, true)).toEqual(STOPPED);
    // Continue asked for the next clue: the server opens it as the request
    // lands, so its time is counting from then.
    const opening = reduceRun(
      revealed,
      { type: "continue", at: 4_000 },
      plugins,
    ).state;
    expect(opening.phase).toBe("opening");
    expect(leaveWords(opening, true)).toEqual(RUNNING);
    // A begin_round that failed opened nothing.
    const failed = reduceRun(
      opening,
      {
        type: "failed",
        at: 5_000,
        key: null,
        error: {
          code: "offline",
          retryable: true,
          refId: null,
          retryAfterMs: null,
        } as never,
      },
      plugins,
    ).state;
    expect(failed.failing).not.toBeNull();
    expect(leaveWords(failed, true)).toEqual(STOPPED);
  });

  it("R2-01 shows no toast for a Daily that never started, and its X keeps the stopped words", () => {
    expect(leaveWords(null, false)).toEqual({
      label: STOPPED.label,
      toast: null,
    });
    expect(clockRunning(null)).toBe(false);
  });

  it("R2-01 the running toast mirrors its words into the status region", () => {
    showToastAfterLeaving(RUNNING.toast, "/daily");
    window.history.pushState(null, "", "/");
    runFrames(2);
    expect(toasts()[0]).toHaveTextContent(RUNNING.toast);
    expect(status()).toBe(RUNNING.toast);
  });
});
