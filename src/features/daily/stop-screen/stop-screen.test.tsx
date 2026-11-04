/**
 * The stop screen's rows (PRD §3.1.6 item 6), as RITE round 1 left them:
 * the Encore row says what the Encore is for (decision D2, R1-07).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { roundMeta } from "@/engine/run/testing";
import type { ResolvedRound } from "@/engine/types";

import { RoundRow } from "./stop-screen";

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
  it("R1-07 says the Encore breaks ties and scores no points, keeping its in-app '4% off'", () => {
    const encore = row(ENCORE);
    expect(encore).toHaveTextContent("Encore");
    expect(encore).toHaveTextContent("Breaks ties. Scores no points.");
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
