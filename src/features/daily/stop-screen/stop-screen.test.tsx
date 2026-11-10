/**
 * The stop screen's rows (PRD §3.1.6 item 6): the Encore row says what the
 * Encore is for and which tiebreak comes first (decisions D2 and D21, R1-07,
 * R2-04), and its band reads "Close guess" (D16, R2-24). Then the results
 * themselves: Share straight under the score card (R2-10), and the card's
 * rows and legend on their cream inset (R2-09).
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { roundMeta } from "@/engine/run/testing";
import {
  parseAttemptId,
  parseDailyNumber,
  parseLocalDate,
  type DailyResults,
  type ResolvedRound,
} from "@/engine/types";

import { Results, RoundRow } from "./stop-screen";

vi.mock("next/navigation", () => ({
  useParams: () => ({ number: "42" }),
  useRouter: () => ({ replace: () => {}, push: () => {}, prefetch: () => {} }),
  usePathname: () => "/daily/42/results",
}));

const ENCORE: ResolvedRound = {
  meta: roundMeta(3, "encore"),
  outcome: {
    family: "encore",
    error: { kind: "relative", value: 0.0417, display: "4% off" },
    band: "bullseye",
    voided: false,
  },
  reveal: {
    family: "encore",
    guess: 90,
    answer: 86.4,
    unit: "metres",
    unitShort: "m",
    error: { kind: "relative", value: 0.0417, display: "4% off" },
    band: "bullseye",
    explanation: "",
    learnMore: "",
    sourceLabels: [],
    crowd: null,
  },
};

const MYSTERY: ResolvedRound = {
  meta: { ...roundMeta(0, "mystery"), ordinal: 1, ofType: 3, category: "hist" },
  outcome: {
    family: "mystery",
    solvedOn: 2,
    points: 3,
    voided: false,
    category: "hist",
    cells: ["passed", "solved", "unused", "unused"],
  },
  reveal: {
    family: "mystery",
    answer: {
      entityId: "fx.x.person.odile-marsh" as never,
      display: "Odile Marsh",
    },
    clues: ["1", "2", "3", "4"],
    solvedOn: 2,
    points: 3,
    pickedOption: null,
    explanation: "",
    learnMore: "",
    sourceLabels: [],
    crowd: null,
  },
};

function row(round: ResolvedRound): HTMLElement {
  render(
    <ol>
      <RoundRow round={round} />
    </ol>,
  );
  return screen.getByRole("listitem");
}

describe("the stop screen's rounds", () => {
  it("R1-07 R2-04 says the Encore breaks ties, the closest Encore before time, and scores no points, keeping its in-app '4% off'", () => {
    const encore = row(ENCORE);
    expect(encore).toHaveTextContent("Encore");
    expect(encore).toHaveTextContent(
      "Breaks ties: closest Encore first, then time. Scores no points.",
    );
    expect(encore).toHaveTextContent(
      "You said 90 m, the answer was 86.4 m: 4% off",
    );
    expect(encore).toHaveTextContent("Bullseye");
  });

  it("keeps a Mystery row to its category, answer and points", () => {
    const mystery = row(MYSTERY);
    expect(mystery).toHaveTextContent("Mystery 1 · History");
    expect(mystery).toHaveTextContent("The answer: Odile Marsh");
    expect(mystery).toHaveTextContent("Solved on clue 2 · 3 points");
    expect(mystery).not.toHaveTextContent("Scores no points");
  });
});

/** ENCORE at 13% off: inside the close band. */
const CLOSE_ENCORE: ResolvedRound = {
  ...ENCORE,
  outcome: {
    family: "encore",
    error: { kind: "relative", value: 0.13, display: "13% off" },
    band: "close",
    voided: false,
  },
  reveal: {
    ...(ENCORE.reveal as Extract<
      ResolvedRound["reveal"],
      { family: "encore" }
    >),
    guess: 240,
    answer: 212,
    unit: "steps",
    unitShort: "steps",
    error: { kind: "relative", value: 0.13, display: "13% off" },
    band: "close",
  },
};

describe("the Encore's band (D16, R2-24)", () => {
  it("R2-24 the Encore row for a 13% guess reads 'Close guess', never a bare 'Close'", () => {
    const encore = row(CLOSE_ENCORE);
    expect(encore).toHaveTextContent("13% off");
    expect(within(encore).getByText("Close guess")).toBeVisible();
    expect(within(encore).queryByText("Close")).toBeNull();
  });
});

function results(rounds: ResolvedRound[]): DailyResults {
  const attemptId = parseAttemptId("0f8fad5b-d9cb-469f-a165-70867728950e");
  const dailyNumber = parseDailyNumber(42);
  const date = parseLocalDate("2026-11-01");
  if (attemptId === null || dailyNumber === null || date === null) {
    throw new Error("setup");
  }
  return {
    attempt: {
      attemptId,
      kind: "daily",
      ranked: true,
      daily: { dailyNumber, date },
      composition: "m3e1",
      rounds: rounds.map((round) => round.meta),
      maxPoints: 4,
      resolved: rounds,
      current: null,
      status: "finished",
      points: 3,
      startedAt: 0,
      serverTime: 0,
    },
    summary: {
      attemptId,
      points: 3,
      maxPoints: 4,
      encore: null,
      totalMs: 187_000,
      ranked: true,
      streak: null,
      facts: {
        perfect: false,
        newBestScore: false,
        firstFinish: true,
        milestone: null,
        freezeEarned: false,
        hardestSolvedOnClue1: false,
        bullseye: false,
        earlierFinishes: 0,
      },
    },
    percentile: { status: "cold_start", finishers: 1 },
    histogram: null,
    personal: null,
    challenge: null,
  } as DailyResults;
}

describe("the results (R2-09, R2-10)", () => {
  it("R2-10 puts Share straight under the score card, still secondary, before the share text box", () => {
    render(
      <Results results={results([MYSTERY, ENCORE])} nextUnlockAt={null} />,
    );
    const card = document
      .querySelector("[data-score-inset]")
      ?.closest("section");
    const share = screen.getByRole("button", { name: /share/i });
    const box = screen.getByRole("textbox", { name: "Your share text" });
    expect(card).not.toBeNull();
    // Next in the page after the card, and before the box.
    expect(card?.nextElementSibling?.contains(share)).toBe(true);
    expect(
      share.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // "Done for today" stays the screen's one primary (AC-DLY-14).
    expect(share.className).not.toMatch(/\bkn-btn-primary\b/);
    expect(
      screen.getByRole("link", { name: "Done for today" }).className,
    ).toMatch(/\bkn-btn-primary\b/);
  });

  it("R2-09 sets the card's rows and legend on one inset (cream in light, charcoal in dark), with the time and score outside it", () => {
    render(
      <Results results={results([MYSTERY, ENCORE])} nextUnlockAt={null} />,
    );
    const inset = document.querySelector<HTMLElement>("[data-score-inset]");
    expect(inset).not.toBeNull();
    expect(inset?.querySelector("[data-score-rows]")).not.toBeNull();
    expect(inset?.querySelector("[data-legend]")).toHaveTextContent(
      "🟧 clue used · ✅ solved · ❌ missed · ⬜ not needed",
    );
    // The inset's own tokens (memo §26): cream with ink in light, charcoal
    // with cream ink in dark. No dark: variant, the tokens carry the theme.
    expect(inset?.className).toMatch(/\bbg-card-inset\b/);
    expect(inset?.className).toMatch(/\btext-on-card-inset\b/);
    expect(inset?.className).not.toMatch(/\bdark:/);
    expect(inset?.querySelector("[data-time]")).toBeNull();
    expect(inset?.querySelector("[data-score]")).toBeNull();
  });
});
