import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SHARED } from "@/config/shared";
import { numberLineGeometry } from "@/engine/encore";
import { DEFAULT_ENCORE_BANDS } from "@/engine/scoring/encore";
import {
  parseItemId,
  type EncoreContent,
  type RoundIntent,
  type RoundReveal,
} from "@/engine/types";
import {
  clearAnnouncements,
  ensureLiveRegions,
  LIVE_REGION_IDS,
} from "@/ui/announce";
import { renderWithUser } from "@/test/render";

import type { RoundComponentProps } from "../contracts";
import { EncoreHarness, TEST_SETTINGS, encoreMeta } from "../mystery/testing";
import { EncoreRound } from ".";
import {
  ENCORE_COPY,
  PREVIEW_ANNOUNCE_DELAY_MS,
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

beforeEach(() => {
  clearAnnouncements();
});

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
      screen.getByText("Encore · one number, no points"),
    ).toBeInTheDocument();
    expect(numberField()).toHaveAttribute("inputmode", "numeric");
    // Focusing the field reads the question with it, then the unit.
    expect(numberField()).toHaveAccessibleDescription(
      "How long is the fixture Coast Road, in kilometres? km",
    );
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Within 5% is a bullseye")).toBeInTheDocument();
    expect(screen.getByText("Within 15% is close")).toBeInTheDocument();
  });

  it("takes the field on a desktop pointer, and the field reads the question", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query === "(pointer: fine)",
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    play();
    expect(numberField()).toHaveFocus();
    expect(numberField()).toHaveAccessibleDescription(
      "How long is the fixture Coast Road, in kilometres? km",
    );
  });

  it("names the Encore's own bands in the hints", () => {
    play(encore({ bands: { bullseye: 0.02, close: 0.1 } }));
    expect(screen.getByText("Within 2% is a bullseye")).toBeInTheDocument();
    expect(screen.getByText("Within 10% is close")).toBeInTheDocument();
    expect(screen.queryByText("Within 5% is a bullseye")).toBeNull();
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
    // The status region speaks it (R1-34); the line itself is no live region.
    expect(preview.closest("[aria-live]")).toBeNull();
    await waitFor(() => {
      expect(liveText()).toBe("You're answering 1,250 km");
    });
    expect(numberField()).toHaveValue("1250");
    expect(lockIn()).not.toHaveAttribute("aria-disabled");
    expect(numberField()).toHaveAccessibleDescription(
      "How long is the fixture Coast Road, in kilometres? km You're answering 1,250 km",
    );
  });

  it("shows a parse error in place of the preview, on the same line, and speaks it", async () => {
    const { user } = play();
    await user.type(numberField(), "1,25");
    const line = screen
      .getByText("You're answering", { exact: false })
      .closest("[data-encore-line]");
    expect(line).toHaveTextContent("You're answering 125 km");
    await user.type(numberField(), "x");
    // The error replaced the preview on the one line.
    expect(line).toHaveTextContent("Numbers only, please.");
    expect(line).not.toHaveTextContent("You're answering");
    expect(numberField()).toHaveAttribute("aria-invalid", "true");
    expect(numberField()).toHaveAccessibleDescription(
      "How long is the fixture Coast Road, in kilometres? km Numbers only, please.",
    );
    await waitFor(() => {
      expect(liveText()).toBe("Numbers only, please.");
    });
  });

  it("R1-34 speaks the preview once typing settles, never on every keystroke", () => {
    // Synchronous events under a fake clock: user-event's async wrapper
    // waits on a real setTimeout, which a fake clock never fires.
    vi.useFakeTimers();
    const said: string[] = [];
    const collect = (records: MutationRecord[]) => {
      for (const record of records) {
        for (const node of record.addedNodes) said.push(node.textContent ?? "");
      }
    };
    const observer = new MutationObserver(collect);
    try {
      ensureLiveRegions();
      const region = document.getElementById(LIVE_REGION_IDS.polite);
      if (region === null) throw new Error("no polite region");
      // Each announcement puts a new node in the region.
      observer.observe(region, { childList: true });
      const spoken = () => {
        collect(observer.takeRecords());
        return said;
      };
      const flush = (ms: number) => {
        act(() => {
          vi.advanceTimersByTime(ms);
        });
      };
      const typeOut = (text: string) => {
        for (let end = 1; end <= text.length; end += 1) {
          fireEvent.change(numberField(), {
            target: { value: text.slice(0, end) },
          });
          // A keystroke every 120 ms: quicker than the wait, as typing is.
          flush(120);
        }
      };
      render(<EncoreHarness content={encore()} onIntent={vi.fn()} />);
      typeOut("1250");
      // Sam heard "You're answering 1 km", "12 km", "125 km", "1,250 km".
      flush(PREVIEW_ANNOUNCE_DELAY_MS - 200);
      expect(spoken()).toEqual([]);
      flush(200);
      expect(spoken()).toEqual(["You're answering 1,250 km"]);
      // A pause, then one more digit: one more message, for the new number.
      fireEvent.change(numberField(), { target: { value: "12500" } });
      flush(PREVIEW_ANNOUNCE_DELAY_MS);
      expect(spoken()).toEqual([
        "You're answering 1,250 km",
        "You're answering 12,500 km",
      ]);
      // Locking in inside the wait drops the pending preview: the verdict follows alone.
      fireEvent.change(numberField(), { target: { value: "1250" } });
      fireEvent.keyDown(numberField(), { key: "Enter" });
      flush(PREVIEW_ANNOUNCE_DELAY_MS + 50);
      expect(spoken()).toEqual([
        "You're answering 1,250 km",
        "You're answering 12,500 km",
        "Spot on. The answer was 1,250 km.",
      ]);
    } finally {
      observer.disconnect();
      vi.useRealTimers();
    }
  });

  it("R1-07 says what the Encore decides for a solo player: no points, and ties go to the closer guess", () => {
    play();
    const round = document.querySelector('[data-round="encore"]');
    if (!(round instanceof HTMLElement)) throw new Error("no Encore");
    expect(
      within(round).getByText("Encore · one number, no points"),
    ).toBeInTheDocument();
    expect(
      within(round).getByText(
        /^If you tie on points, the closer guess ranks higher\./,
      ),
    ).toBeInTheDocument();
    expect(round).toHaveTextContent(/no points/);
    expect(round).toHaveTextContent(/tie/);
    // The old words asked "a tiebreak against whom?".
    expect(round).not.toHaveTextContent(/the tiebreak|wins the tiebreak/);
  });

  it("R1-10 previews 1,200 as twelve hundred on an Encore that allows a decimal, and locks it in", async () => {
    const { user, onIntent } = play(
      encore({ decimals: 1, answer: 86.4, unitShort: "m", unitLabel: "m" }),
    );
    await user.type(numberField(), "1,200");
    expect(screen.queryByText("Up to 1 decimal place, please.")).toBeNull();
    expect(
      screen.getByText("You're answering", { exact: false }),
    ).toHaveTextContent("You're answering 1,200 m");
    expect(lockIn()).not.toHaveAttribute("aria-disabled");
    await user.keyboard("{Enter}");
    expect(onIntent).toHaveBeenCalledWith({
      family: "encore",
      kind: "lock_in",
      value: 1200,
    });
  });

  it.each([
    ["abc", 0, "Numbers only, please."],
    ["-5", 0, "Positive numbers only."],
    ["0", 0, "Positive numbers only."],
    ["1,2345", 1, "Up to 1 decimal place, please."],
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
  it("replaces the play hints with the result line, the band, the number line and its legend, and moves focus there", async () => {
    const { user, onContinue } = play();
    await user.type(numberField(), "1200");
    await user.click(lockIn());

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Your guess 1,200 km · Answer 1,250 km · 4% off",
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("data-focus-target", "reveal_heading");
    // One set of band lines: the result card's legend (D16), not the hints.
    expect(screen.getAllByText("Within 5% is a bullseye")).toHaveLength(1);
    expect(document.querySelector('[data-band-hints="hints"]')).toBeNull();
    const card = document.querySelector("[data-encore-result]");
    if (!(card instanceof HTMLElement)) throw new Error("no result card");
    expect(
      within(card).getByRole("group", { name: "How the Encore is judged" }),
    ).toHaveAttribute("data-band-hints", "legend");
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

  it("continues on Enter from the result line (PRD §3.0.3), not from its links", async () => {
    const { user, onContinue } = play();
    await user.type(numberField(), "1200{Enter}");
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("data-focus-target", "reveal_heading");
    fireEvent.keyDown(screen.getByRole("link", { name: /^Learn more/ }), {
      key: "Enter",
    });
    expect(onContinue).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("AC-DLY-35 judges, draws and words an Encore's own bands", async () => {
    const bands = { bullseye: 0.02, close: 0.1 };
    const { user } = play(encore({ answer: 100, bands }));
    expect(screen.getByText("Within 2% is a bullseye")).toBeInTheDocument();
    // 3% off: outside the own bullseye, inside the own close band.
    await user.type(numberField(), "103{Enter}");
    expect(document.querySelector("[data-band-chip]")).toHaveTextContent(
      "Close guess",
    );
    // The legend names the own bands too.
    expect(screen.getByText("Within 10% is close")).toBeInTheDocument();
    const line = screen.getByRole("img", {
      name: "Your guess 103 km. Answer 100 km. Bullseye means within 2%, close within 10%.",
    });
    // The shaded spans are the own bands, not the defaults.
    const geometry = numberLineGeometry({
      valueKind: "quantity",
      guess: 103,
      answer: 100,
      median: null,
      bands,
    });
    const width = (from: number, to: number) =>
      `${((to - from) * 100).toFixed(3)}%`;
    expect(line.querySelector('[data-band="bullseye"]')).toHaveStyle({
      width: width(geometry.bullseye.from, geometry.bullseye.to),
    });
    expect(line.querySelector('[data-band="close"]')).toHaveStyle({
      width: width(geometry.close.from, geometry.close.to),
    });
    // The guess sits outside the bullseye band and inside the close band.
    expect(geometry.guess.at).toBeGreaterThan(geometry.bullseye.to);
    expect(geometry.guess.at).toBeLessThan(geometry.close.to);
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

  /** Daily #45's Encore: Lake Ostry, 86.4 m deep, one decimal. */
  function ostry(guess: number, band: "bullseye" | "close" | null) {
    const result: RoundReveal = {
      family: "encore",
      guess,
      answer: 86.4,
      unit: "metres",
      unitShort: "m",
      error: { kind: "relative", value: 0, display: "x% off" },
      band,
      explanation: "A survey boat lowered a weighted line through winter ice.",
      learnMore: "Lake Ostry (fixture)",
      sourceLabels: [],
      crowd: null,
    };
    const props = resultProps(result, true);
    return {
      ...props,
      open: {
        ...(props.open as Extract<
          RoundComponentProps["open"],
          { family: "encore" }
        >),
        unitShort: "m",
        unitLabel: "in metres",
        decimals: 1 as const,
      },
    };
  }
  const label = (name: "guess" | "answer" | "low" | "high") =>
    document.querySelector(`[data-label="${name}"]`)?.textContent ?? null;

  it("R1-26 labels a guess off the line's end with its value, and both marks", () => {
    // Priya's 300 m and Marcus's 240 m sat at the 172.8 m end with no value.
    const { unmount } = renderWithUser(<EncoreRound {...ostry(300, null)} />);
    expect(label("guess")).toBe("You 300 m →");
    expect(label("answer")).toBe("Answer 86.4 m");
    expect(label("low")).toBe("43.2 m");
    expect(label("high")).toBe("172.8 m");
    // It holds the line's right end, in the line's own width, and wraps
    // between words if it must: a long value never runs off the card.
    const high = document.querySelector('[data-label="guess"]');
    expect(high).toHaveAttribute("data-edge", "high");
    expect(high?.className).toMatch(/(^|\s)text-right(\s|$)/);
    expect(high?.className).toMatch(/(^|\s)max-w-full(\s|$)/);
    expect(high?.className).not.toMatch(/whitespace-nowrap|translate-x/);
    // The pinned dot's arrow is drawn in ink on the card, not in the dot's
    // on-accent colour, which left it white on white.
    expect(
      document.querySelector("[data-edge-arrow]")?.getAttribute("class"),
    ).toContain("--kn-ink");
    unmount();

    renderWithUser(<EncoreRound {...ostry(20, null)} />);
    expect(label("guess")).toBe("← You 20 m");
    expect(document.querySelector('[data-mark="guess"]')).toHaveAttribute(
      "data-edge",
      "low",
    );
    expect(document.querySelector('[data-label="guess"]')?.className).toMatch(
      /(^|\s)text-left(\s|$)/,
    );
  });

  it("never breaks a value inside itself, and stacks the ends over the answer when the labels' row is narrow", () => {
    // 320 by 568 at 200% text: the side columns shrank to nothing and
    // "43.2 m" and "172.8 m" stood one character to a line.
    renderWithUser(<EncoreRound {...ostry(100, "close")} />);
    const narrow = "@max-[20em]/ends:";
    const ends = document.querySelector("[data-ends]");
    expect(ends?.parentElement?.className).toMatch(
      /(^|\s)@container\/ends(\s|$)/,
    );
    for (const name of ["low", "high"] as const) {
      const classes = document.querySelector(
        `[data-label="${name}"]`,
      )?.className;
      expect(classes).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
      expect(classes).not.toMatch(/break-words/);
    }
    // Narrow: the ends share a line, each at its end, and the answer's
    // label takes a centred line of its own under them.
    for (const layout of ["flex", "flex-wrap", "justify-between"]) {
      expect(ends?.className.split(/\s+/)).toContain(`${narrow}${layout}`);
    }
    const answer = document.querySelector('[data-label="answer"]');
    for (const placement of ["order-last", "basis-full"]) {
      expect(answer?.className.split(/\s+/)).toContain(`${narrow}${placement}`);
    }
    expect(
      document.querySelector('[data-label="high"]')?.className.split(/\s+/),
    ).toContain(`${narrow}ml-auto`);
    expect(answer?.querySelector(".whitespace-nowrap")).toHaveTextContent(
      /^86\.4 m$/,
    );
  });

  it("R1-03 moves the unit under the number when the field is narrow in em, so what you type stays in sight", () => {
    // 360 by 640 at 200% text: "in metres" kept its 164 px beside a 44 px
    // input, and "86.4" showed as "4".
    renderWithUser(<EncoreRound {...ostry(100, null)} />);
    const narrow = "@max-[20em]/encore:";
    const fieldBox = document.querySelector("[data-encore-field]");
    expect(fieldBox?.parentElement?.className).toMatch(
      /(^|\s)@container\/encore(\s|$)/,
    );
    const classes = fieldBox?.className.split(/\s+/) ?? [];
    expect(classes).toContain(`${narrow}flex-wrap`);
    // The height follows the text (DESIGN §10.5).
    expect(classes).toContain("min-h-[5.25rem]");
    expect(classes).not.toContain("h-[5.25rem]");
    const unit = document.querySelector("[data-encore-unit]");
    expect(unit).toHaveTextContent("in metres");
    expect(unit?.className.split(/\s+/)).toContain(`${narrow}basis-full`);
  });

  it("R1-03 steps the number's font down until a long number fits the field, and back up as it shortens", async () => {
    // jsdom has no layout: a 228 px field (360 by 640 at 200% text) whose
    // full size is 88 px, and characters 0.6 em wide.
    const sheet = document.createElement("style");
    sheet.textContent = "input { font-size: 88px; }";
    document.head.append(sheet);
    vi.spyOn(HTMLInputElement.prototype, "clientWidth", "get").mockReturnValue(
      228,
    );
    vi.spyOn(
      HTMLInputElement.prototype,
      "scrollWidth",
      "get",
    ).mockImplementation(function (this: HTMLInputElement) {
      const size = Number.parseFloat(getComputedStyle(this).fontSize);
      return Math.ceil(this.value.length * size * 0.6);
    });
    try {
      const { user } = play(encore({ decimals: 1, answer: 1250.5 }));
      await user.type(numberField(), "86.4");
      // Short numbers keep the field's full size.
      expect(numberField().style.fontSize).toBe("");
      await user.clear(numberField());
      await user.type(numberField(), "1,234.5");
      const size = Number.parseFloat(numberField().style.fontSize);
      expect(size).toBeLessThan(88);
      expect(size).toBeGreaterThanOrEqual(20);
      expect(numberField().scrollWidth).toBeLessThanOrEqual(228);
      // Shorter again: back to the full size.
      await user.clear(numberField());
      await user.type(numberField(), "12");
      expect(numberField().style.fontSize).toBe("");
    } finally {
      sheet.remove();
    }
  });

  it("R1-26 marks a guess on the line as You, over its mark", () => {
    renderWithUser(<EncoreRound {...ostry(100, "close")} />);
    expect(label("guess")).toBe("You");
    const mark = document.querySelector<HTMLElement>('[data-mark="guess"]');
    const text = document.querySelector<HTMLElement>('[data-label="guess"]');
    expect(text?.style.left).toBe(mark?.style.left);
    expect(text?.className).toMatch(/-translate-x-1\/2/);
  });

  it("R1-26 D16 the close chip reads Close guess, and a guess outside both bands still shows where they were", () => {
    const { unmount } = renderWithUser(<EncoreRound {...ostry(80, "close")} />);
    const chip = document.querySelector("[data-band-chip]");
    expect(chip).toHaveTextContent(/^Close guess$/);
    expect(chip).not.toHaveTextContent(/^Close$/);
    unmount();

    renderWithUser(<EncoreRound {...ostry(300, null)} />);
    expect(document.querySelector("[data-band-chip]")).toBeNull();
    const legend = screen.getByRole("group", {
      name: "How the Encore is judged",
    });
    expect(legend).toHaveAttribute("data-band-hints", "legend");
    expect(within(legend).getByText("Within 5% is a bullseye")).toBeVisible();
    expect(within(legend).getByText("Within 15% is close")).toBeVisible();
    expect(legend.querySelector('[data-swatch="bullseye"]')).not.toBeNull();
    expect(legend.querySelector('[data-swatch="close"]')).not.toBeNull();
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
    const round = document.querySelector('[data-round="encore"]');
    expect(
      within(round as HTMLElement).getByText(
        "We couldn't lock that in. Try again.",
      ),
    ).toBeInTheDocument();
    // Spoken as it appears (DESIGN §6.9).
    expect(liveText()).toBe("We couldn't lock that in. Try again.");
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
    // Unavailable means unavailable: no typing either.
    expect(numberField()).toHaveAttribute("readonly");
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");
    expect(
      within(document.body).getByText(
        "You're offline. Your progress is saved, and we'll pick up where you left off.",
      ),
    ).toBeInTheDocument();
    // The controller announces the lost connection; the round adds nothing.
    expect(liveText()).toBe("");
  });

  it("puts Lock in right under the field while the keypad is up, and keeps the keypad up through the press", async () => {
    class FakeViewport extends EventTarget {
      height = 768;
      width = 1024;
      offsetTop = 0;
      offsetLeft = 0;
      pageTop = 0;
      pageLeft = 0;
      scale = 1;
      onresize = null;
      onscroll = null;
      onscrollend = null;
    }
    const viewport = new FakeViewport();
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("scrollBy", vi.fn());
    const props = base();
    const { user } = renderWithUser(<EncoreRound {...props} />);
    await user.click(numberField());
    await user.type(numberField(), "212");
    act(() => {
      viewport.height = 340;
      viewport.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => {
      expect(document.querySelector('[data-round="encore"]')).toHaveAttribute(
        "data-keyboard",
        "open",
      );
    });
    // The hints wait under Lock in.
    const hints = screen.getByRole("group", {
      name: "How the Encore is judged",
    });
    expect(
      lockIn().compareDocumentPosition(hints) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The press keeps focus in the field, so the keypad can't close under the finger.
    expect(fireEvent.mouseDown(lockIn())).toBe(false);
    expect(numberField()).toHaveFocus();
    await user.click(lockIn());
    expect(props.onIntent).toHaveBeenCalledWith({
      family: "encore",
      kind: "lock_in",
      value: 212,
    });
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

describe("EncoreRound after RITE round 2", () => {
  it("R2-04 D21 says both tiebreaks in their order: the closer guess, then time", () => {
    // All five asked whether the Encore or time breaks a tie first.
    play();
    const round = document.querySelector('[data-round="encore"]');
    if (!(round instanceof HTMLElement)) throw new Error("no Encore");
    expect(
      within(round).getByText(
        "If you tie on points, the closer guess ranks higher. Time only counts after that.",
      ),
    ).toBeVisible();
    expect(ENCORE_COPY.tiebreak).toBe(
      "If you tie on points, the closer guess ranks higher. Time only counts after that.",
    );
  });

  it("R2-12 docks See your results at the bottom after Lock in, as the stop screen docks Done for today", async () => {
    // Priya and Marcus at 390 by 844: the button sat below the fold.
    const { user, onContinue } = play();
    expect(document.querySelector("[data-encore-dock]")).toBeNull();
    await user.type(numberField(), "1200{Enter}");
    const dock = document.querySelector<HTMLElement>("[data-encore-dock]");
    if (dock === null) throw new Error("no dock");
    const results = within(dock).getByRole("button", {
      name: "See your results",
    });
    // Sticky at the bottom, bled over the column's gutters, toasts above it,
    // and its height the page's bottom scroll inset.
    expect(dock.className).toMatch(/(^| )sticky( |$)/);
    expect(dock.className).toMatch(/(^| )bottom-0( |$)/);
    expect(dock.className).toMatch(/(^| )-mx-4( |$)/);
    expect(dock).toHaveAttribute("data-toast-anchor");
    expect(
      dock.querySelector('[data-scroll-inset="bottom"]'),
    ).toBeInTheDocument();
    // After the result card, in reading and focus order.
    const card = document.querySelector("[data-encore-result]");
    expect(
      card !== null &&
        Boolean(
          card.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
    ).toBe(true);
    // The result line still takes focus (AC-DLY-18), and the dock continues.
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    await user.click(results);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  describe("scrolling the result into view", () => {
    /** Lays the result card and the dock out at these boxes, in a window this tall. */
    function layOut(
      card: { top: number; height: number },
      dockHeight: number,
      windowHeight: number,
    ) {
      vi.stubGlobal("innerHeight", windowHeight);
      const scrollBy = vi.fn();
      vi.stubGlobal("scrollBy", scrollBy);
      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      ).mockImplementation(function (this: HTMLElement) {
        if (this.hasAttribute("data-encore-result")) {
          return DOMRect.fromRect({ x: 16, y: card.top, width: 358, ...card });
        }
        if (this.hasAttribute("data-encore-dock")) {
          return DOMRect.fromRect({
            x: 0,
            y: windowHeight - dockHeight,
            width: 390,
            height: dockHeight,
          });
        }
        return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
      });
      return scrollBy;
    }

    it("R2-12 scrolls the least distance that shows the whole result card above the dock", async () => {
      // 390 by 844: the card's 450 px start at 560, so it ends at 1010; the
      // dock takes the bottom 80 px, so the card must end by 756 (8 px gap).
      const scrollBy = layOut({ top: 560, height: 450 }, 80, 844);
      const { user } = play();
      await user.type(numberField(), "1200{Enter}");
      expect(scrollBy).toHaveBeenCalledOnce();
      expect(scrollBy).toHaveBeenCalledWith({ top: 254, behavior: "instant" });
      expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    });

    it("R2-12 keeps a card taller than the room with its top in view, under the top edge", async () => {
      // A 1,000 px card at 400 can't fit: its top goes to the edge's 8 px gap.
      const scrollBy = layOut({ top: 400, height: 1000 }, 80, 844);
      const { user } = play();
      await user.type(numberField(), "1200{Enter}");
      expect(scrollBy).toHaveBeenCalledWith({ top: 392, behavior: "instant" });
    });

    it("R2-12 leaves a card that already shows above the dock where it is", async () => {
      const scrollBy = layOut({ top: 200, height: 400 }, 80, 844);
      const { user } = play();
      await user.type(numberField(), "1200{Enter}");
      expect(scrollBy).not.toHaveBeenCalled();
    });
  });
});
