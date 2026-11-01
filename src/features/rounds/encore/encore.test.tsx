import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SHARED } from "@/config/shared";
import { DEFAULT_ENCORE_BANDS } from "@/engine/scoring/encore";
import {
  parseItemId,
  type EncoreContent,
  type RoundIntent,
  type RoundReveal,
} from "@/engine/types";
import { LIVE_REGION_IDS } from "@/ui/announce";
import { renderWithUser } from "@/test/render";

import type { RoundComponentProps } from "../contracts";
import { EncoreHarness, TEST_SETTINGS, encoreMeta } from "../mystery/testing";
import { EncoreRound } from ".";
import {
  ENCORE_COPY,
  bandWords,
  encoreAnnouncementText,
  parseErrorText,
} from "./copy";

function encore(overrides: Partial<EncoreContent> = {}): EncoreContent {
  const id = parseItemId("fx.e.0101");
  if (id === null) throw new Error("bad id");
  return {
    id,
    category: "geo",
    tags: [],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: 3,
    explanation: "The fixture road runs 1,250 km end to end.",
    learnMore: "Coast Road (fixture)",
    kind: "encore",
    question: "How long is the fixture Coast Road, in kilometres?",
    unit: "kilometres",
    unitShort: "km",
    unitLabel: "km",
    valueKind: "quantity",
    answer: 1250,
    decimals: 0,
    bands: null,
    predicted: { pClose: 0.3, pExact: 0.05, spread: 0.1, estimator: "v0" },
    sourceLabels: [],
    ...overrides,
  };
}

function play(content = encore()) {
  const onIntent = vi.fn<(intent: RoundIntent) => void>();
  const onContinue = vi.fn();
  const view = renderWithUser(
    <EncoreHarness
      content={content}
      onIntent={onIntent}
      onContinue={onContinue}
    />,
  );
  return { ...view, onIntent, onContinue };
}

const numberField = () => screen.getByRole("textbox", { name: "Your number" });
const lockIn = () => screen.getByRole("button", { name: "Lock in" });
const liveText = () =>
  document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";

describe("EncoreRound, entering a number", () => {
  it("asks the question, with the unit beside the field and the numeric keypad", () => {
    play();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "How long is the fixture Coast Road, in kilometres?",
      }),
    ).toHaveFocus();
    expect(
      screen.getByText("Encore · one number, the tiebreak"),
    ).toBeInTheDocument();
    expect(numberField()).toHaveAttribute("inputmode", "numeric");
    expect(numberField()).toHaveAccessibleDescription("km");
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Within 5% is a bullseye")).toBeInTheDocument();
    expect(screen.getByText("Within 15% is close")).toBeInTheDocument();
  });

  it("asks for the decimal keypad when decimals are allowed", () => {
    play(encore({ decimals: 1, answer: 1250.5 }));
    expect(numberField()).toHaveAttribute("inputmode", "decimal");
  });

  it("previews the parsed number with grouping and its unit, and enables Lock in", async () => {
    const { user } = play();
    await user.type(numberField(), "1250");
    const preview = screen.getByText("You're answering", { exact: false });
    expect(preview).toHaveTextContent("You're answering 1,250 km");
    expect(preview).toHaveAttribute("aria-live", "polite");
    expect(numberField()).toHaveValue("1250");
    expect(lockIn()).not.toHaveAttribute("aria-disabled");
    expect(numberField()).toHaveAccessibleDescription(
      "km You're answering 1,250 km",
    );
  });

  it.each([
    ["abc", 0, "Numbers only, please."],
    ["-5", 0, "Positive numbers only."],
    ["0", 0, "Positive numbers only."],
    ["1,250", 1, "Up to 1 decimal place, please."],
    ["1,250.5,3", 1, "Check the dots and commas."],
    ["1234567890123456", 0, "That's more digits than we can take."],
  ] as const)(
    "shows an inline error for %s and keeps Lock in disabled",
    async (typed, decimals, message) => {
      const { user } = play(
        encore({ decimals, answer: decimals === 0 ? 1250 : 1250.5 }),
      );
      await user.type(numberField(), typed);
      const error = screen.getByText(message);
      expect(error.closest("[data-encore-error]")).toBeInTheDocument();
      expect(numberField()).toHaveAttribute("aria-invalid", "true");
      expect(lockIn()).toHaveAttribute("aria-disabled", "true");
      expect(
        screen.queryByText("You're answering", { exact: false }),
      ).toBeNull();
    },
  );

  it("says nothing while the field is empty", async () => {
    const { user } = play();
    await user.type(numberField(), "12");
    await user.clear(numberField());
    expect(screen.queryByText("Numbers only, please.")).toBeNull();
    expect(numberField()).not.toHaveAttribute("aria-invalid");
  });

  it("locks in the parsed value once, from the button or Enter", async () => {
    const { user, onIntent } = play();
    await user.type(numberField(), "1,200{Enter}");
    expect(onIntent).toHaveBeenCalledOnce();
    expect(onIntent).toHaveBeenCalledWith({
      family: "encore",
      kind: "lock_in",
      value: 1200,
    });
    // The guess can't change afterwards.
    expect(numberField()).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Lock in" })).toBeNull();
  });

  it("writes years plainly, with year hints and no unit", async () => {
    const { user } = play(
      encore({
        valueKind: "year",
        answer: 1388,
        unit: "",
        unitShort: "",
        unitLabel: "",
      }),
    );
    expect(
      screen.getByText("Within 2 years is a bullseye"),
    ).toBeInTheDocument();
    expect(screen.getByText("Within 5 years is close")).toBeInTheDocument();
    await user.type(numberField(), "1390");
    expect(
      screen.getByText("You're answering", { exact: false }),
    ).toHaveTextContent("You're answering 1390");
    await user.clear(numberField());
    await user.type(numberField(), "10000");
    expect(screen.getByText("Years run from 1 to 9999.")).toBeInTheDocument();
  });
});

describe("EncoreRound, the result", () => {
  it("replaces the hints with the result line, the band and the number line, and moves focus there", async () => {
    const { user, onContinue } = play();
    await user.type(numberField(), "1200");
    await user.click(lockIn());

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Your guess 1,200 km · Answer 1,250 km · 4% off",
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("data-focus-target", "reveal_heading");
    expect(screen.queryByText("Within 5% is a bullseye")).toBeNull();
    const chip = document.querySelector("[data-band-chip]");
    expect(chip).toHaveTextContent("Bullseye");
    expect(liveText()).toBe(
      "Bullseye. 4% off. You said 1,200 km. The answer was 1,250 km.",
    );
    expect(
      screen.getByText("The fixture road runs 1,250 km end to end."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /^Learn more about Coast Road \(fixture\)/,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See your results" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  function resultProps(
    reveal: RoundReveal,
    reducedMotion: boolean,
  ): RoundComponentProps {
    return {
      meta: encoreMeta(),
      open: {
        family: "encore",
        index: 3,
        question: "How long is the fixture Coast Road, in kilometres?",
        unit: "kilometres",
        unitShort: "km",
        unitLabel: "km",
        valueKind: "quantity",
        decimals: 0,
        issuedAt: 0,
      },
      client: null,
      status: "revealed",
      reveal,
      error: null,
      onIntent: vi.fn(),
      onContinue: vi.fn(),
      continueLabel: "See your results",
      context: {
        mode: "daily",
        sealed: true,
        list: null,
        itemRef: "daily:42:4",
        settings: { ...TEST_SETTINGS, reducedMotion },
      },
    };
  }

  const reveal = (eligible: number): RoundReveal => ({
    family: "encore",
    guess: 1200,
    answer: 1250,
    unit: "kilometres",
    unitShort: "km",
    error: { kind: "relative", value: 50 / 1200, display: "4% off" },
    band: "bullseye",
    explanation: "The fixture road runs 1,250 km end to end.",
    learnMore: "Coast Road (fixture)",
    sourceLabels: ["Fixture survey"],
    crowd: {
      medianGuess: 1100,
      bullseyeShare: 18,
      closeShare: 41,
      buckets: [18, 23, 40, 19],
      eligible,
    },
  });

  it("AC-DLY-35 draws the number line with the guess, the answer and the median marked and both bands shaded, with a text equivalent", () => {
    renderWithUser(<EncoreRound {...resultProps(reveal(120), false)} />);
    const line = screen.getByRole("img", {
      name: "Your guess 1,200 km. Answer 1,250 km. Median guess 1,100 km. Bullseye means within 5%, close within 15%.",
    });
    expect(line).toHaveAttribute("data-number-line", "ratio");
    for (const mark of ["guess", "answer", "median", "needle"]) {
      expect(line.querySelector(`[data-mark="${mark}"]`)).not.toBeNull();
    }
    for (const band of ["bullseye", "close"]) {
      expect(line.querySelector(`[data-band="${band}"]`)).not.toBeNull();
    }
    // The answer sits in the middle; the bullseye band holds the guess.
    expect(line.querySelector('[data-mark="answer"]')).toHaveStyle({
      left: "50.000%",
    });
    // The needle travels from the guess to the answer.
    expect(line.querySelector('[data-mark="needle"]')?.className).toMatch(
      /transition-\[left\]/,
    );
    expect(
      screen.getByText(
        "Median guess 1,100 km. 18% hit the bullseye and 41% were close.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Source: Fixture survey")).toBeInTheDocument();
  });

  it("AC-DLY-35 keeps the needle still under reduced motion, and leaves the median out before crowd stats qualify", () => {
    renderWithUser(<EncoreRound {...resultProps(reveal(12), true)} />);
    const line = screen.getByRole("img", {
      name: "Your guess 1,200 km. Answer 1,250 km. Bullseye means within 5%, close within 15%.",
    });
    expect(line).toHaveAttribute("data-motion", "reduce");
    expect(line.querySelector('[data-mark="needle"]')?.className).not.toMatch(
      /transition/,
    );
    expect(line.querySelector('[data-mark="median"]')).toBeNull();
    expect(screen.queryByText(/Median guess/)).toBeNull();
  });

  it("pins a guess beyond the line's end to it, with an arrow", () => {
    const far: RoundReveal = {
      ...(reveal(120) as Extract<RoundReveal, { family: "encore" }>),
      guess: 9000,
      error: { kind: "relative", value: 6.2, display: "620% off" },
      band: null,
    };
    renderWithUser(<EncoreRound {...resultProps(far, true)} />);
    const guess = document.querySelector('[data-mark="guess"]');
    expect(guess).toHaveAttribute("data-edge", "high");
    expect(guess?.querySelector("svg")).not.toBeNull();
    expect(document.querySelector("[data-band-chip]")).toBeNull();
  });

  it("shows the withdrawn card for a voided Encore", async () => {
    const props = resultProps(
      { family: "withdrawn", round: "encore", points: 0, maxPoints: 0 },
      true,
    );
    const { user } = renderWithUser(<EncoreRound {...props} />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "The Encore was withdrawn, so ties fall to time.",
      }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "See your results" }));
    expect(props.onContinue).toHaveBeenCalledOnce();
  });
});

describe("EncoreRound, connection and errors", () => {
  function base(
    overrides: Partial<RoundComponentProps> = {},
  ): RoundComponentProps {
    return {
      meta: encoreMeta(),
      open: {
        family: "encore",
        index: 3,
        question: "How many steps?",
        unit: "steps",
        unitShort: "steps",
        unitLabel: "steps",
        valueKind: "quantity",
        decimals: 0,
        issuedAt: 0,
      },
      client: null,
      status: "idle",
      reveal: null,
      error: null,
      onIntent: vi.fn(),
      onContinue: vi.fn(),
      continueLabel: "See your results",
      context: {
        mode: "daily",
        sealed: true,
        list: null,
        itemRef: "daily:42:4",
        settings: TEST_SETTINGS,
      },
      ...overrides,
    };
  }

  it("keeps the field read-only and Lock in busy while judging", async () => {
    const props = base();
    const { user, rerender } = renderWithUser(<EncoreRound {...props} />);
    await user.type(numberField(), "212");
    await user.click(lockIn());
    rerender(<EncoreRound {...props} status="judging" />);
    expect(numberField()).toHaveAttribute("readonly");
    expect(lockIn()).toHaveAttribute("aria-busy", "true");
  });

  it("offers Retry after a failed lock-in, with the same number", async () => {
    const props = base();
    const { user, rerender } = renderWithUser(<EncoreRound {...props} />);
    await user.type(numberField(), "212");
    await user.click(lockIn());
    rerender(
      <EncoreRound
        {...props}
        status="error"
        error={{ code: "internal", retryable: false }}
      />,
    );
    expect(
      screen.getByText("We couldn't lock that in. Try again."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onIntent).toHaveBeenLastCalledWith({
      family: "encore",
      kind: "lock_in",
      value: 212,
    });
  });

  it("disables Lock in offline and says what is safe", () => {
    renderWithUser(<EncoreRound {...base({ status: "offline" })} />);
    expect(numberField()).toHaveAttribute("aria-disabled", "true");
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");
    expect(
      within(document.body).getByText(
        "You're offline. Your progress is saved, and we'll pick up where you left off.",
      ),
    ).toBeInTheDocument();
  });
});

describe("the Encore's copy", () => {
  it("words the announcement as DESIGN §1.4 does", () => {
    const result = (error: string, band: "bullseye" | "close" | null) =>
      encoreAnnouncementText({
        kind: "encore_result",
        guess: "1,100 km",
        answer: "1,250 km",
        error,
        band,
      });
    expect(result("14% off", "close")).toBe(
      "Close. 14% off. You said 1,100 km. The answer was 1,250 km.",
    );
    expect(result("39% off", null)).toBe(
      "39% off. You said 1,100 km. The answer was 1,250 km.",
    );
    expect(result("under 1% off", "bullseye")).toBe(
      "Bullseye. Under 1% off. You said 1,100 km. The answer was 1,250 km.",
    );
    expect(result("Spot on", "bullseye")).toBe(
      "Spot on. The answer was 1,250 km.",
    );
    expect(
      encoreAnnouncementText({
        kind: "encore_result",
        guess: "",
        answer: "",
        error: "",
        band: null,
      }),
    ).toBe(ENCORE_COPY.withdrawn);
    expect(encoreAnnouncementText({ kind: "correct", answer: "x" })).toBeNull();
  });

  it("names every parse failure", () => {
    expect(parseErrorText("too_many_decimals", 2)).toBe(
      "Up to 2 decimal places, please.",
    );
    expect(parseErrorText("not_number", 0)).toBe("Numbers only, please.");
    expect(bandWords(0.05, "quantity")).toBe("5%");
    expect(bandWords(0.025, "quantity")).toBe("2.5%");
    expect(bandWords(1, "year")).toBe("1 year");
  });

  it("uses the same default bands as src/config/shared.json, which SQL reads", () => {
    expect(DEFAULT_ENCORE_BANDS).toEqual(SHARED.encoreBands);
  });
});
