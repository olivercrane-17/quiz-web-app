import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRng } from "@/engine/rng";
import { choicePlugin, type ChoiceContent } from "@/engine/rounds/choice";
import type { RoundStatus } from "@/engine/run";
import {
  parseItemId,
  type ChoiceFormat,
  type RoundIntent,
  type RoundMeta,
  type RoundReveal,
} from "@/engine/types";

import type { PlaySettings } from "../contracts";
import { CHOICE_COPY } from "./copy";
import {
  ChoiceRound,
  SHEET_AFTER_MS,
  SHORT_SCREEN_QUERY,
  verdictText,
} from "./index";

const ITEM_ID = parseItemId("p.sci.0042");
if (ITEM_ID === null) throw new Error("bad id");

/** A fixed order, so B (Uranus) is the key on screen. */
const PLANETS: ChoiceContent = {
  id: ITEM_ID,
  category: "sci",
  tags: [],
  region: "global",
  volatility: "evergreen",
  reviewBy: null,
  seededDifficulty: 3,
  explanation:
    "Uranus is tipped over by about 98 degrees, so it rolls around the Sun on its side.",
  learnMore: "Uranus",
  format: "mc",
  stem: "Which planet rolls around the Sun on its side?",
  options: ["Venus", "Uranus", "Neptune", "Saturn"],
  correct: 1,
  order: "fixed",
  valueDisplay: null,
};

const COMPARISON: ChoiceContent = {
  ...PLANETS,
  format: "comparison",
  stem: "Which came first?",
  options: ["The Cindral charter", "The Gorlund Games"],
  correct: 0,
  order: "shuffle",
  valueDisplay: ["1204", "1388"],
};

const TRUE_FALSE: ChoiceContent = {
  ...PLANETS,
  format: "tf",
  stem: "Venus spins backwards.",
  options: ["True", "False"],
  correct: 0,
  order: "fixed",
};

const SETTINGS: PlaySettings = {
  shortcuts: true,
  reducedMotion: false,
  sound: false,
  haptics: false,
  readAloud: false,
  autoAdvance: false,
  highContrast: false,
  timerAnnouncements: false,
};

function meta(content: ChoiceContent, index = 3): RoundMeta {
  return {
    index,
    type: content.format,
    difficulty: "medium",
    category: "sci",
    answerType: null,
    ordinal: index + 1,
    ofType: 10,
    maxPoints: 1,
    voided: false,
  };
}

interface HarnessProps {
  content?: ChoiceContent;
  settings?: Partial<PlaySettings>;
  /** Judge at once, as practice does; false leaves the answer judging. */
  judge?: boolean;
  status?: RoundStatus;
  onIntent?: (intent: RoundIntent) => void;
  onContinue?: () => void;
}

/** The round as a local controller drives it: open, then judge on the device. */
function Harness({
  content = PLANETS,
  settings = {},
  judge = true,
  status: forcedStatus,
  onIntent = () => {},
  onContinue = () => {},
}: HarnessProps) {
  const [round] = useState(() =>
    choicePlugin.open(content, meta(content), {
      at: 0,
      rng: createRng("component"),
      shuffle: content.format === "comparison" ? [1, 0] : null,
      optionsFromClue: 4,
      entities: null,
    }),
  );
  const [reveal, setReveal] = useState<RoundReveal | null>(null);
  const [status, setStatus] = useState<RoundStatus>("idle");
  return (
    <>
      <button type="button">Outside the round</button>
      <ChoiceRound
        meta={meta(content)}
        open={round.open}
        client={null}
        status={forcedStatus ?? status}
        reveal={reveal}
        error={null}
        onIntent={(intent) => {
          onIntent(intent);
          if (!judge || intent.family !== "choice") {
            setStatus("judging");
            return;
          }
          const result = choicePlugin.judge(content, round.judge, intent, {
            at: 0,
            rng: createRng("judge"),
            shuffle: null,
            optionsFromClue: 4,
            entities: null,
          });
          if (result.ok && result.verdict.kind === "resolved") {
            setReveal(result.verdict.reveal);
            setStatus("revealed");
          }
        }}
        onContinue={onContinue}
        continueLabel="Next question"
        context={{
          mode: "practice",
          sealed: false,
          list: null,
          itemRef: "p.sci.0042",
          settings: { ...SETTINGS, ...settings },
        }}
      />
    </>
  );
}

function setup(props: HarnessProps = {}) {
  const onIntent = vi.fn<(intent: RoundIntent) => void>();
  const onContinue = vi.fn<() => void>();
  const user = userEvent.setup({
    advanceTimers: (ms) => vi.advanceTimersByTime(ms),
  });
  const view = render(
    <Harness onIntent={onIntent} onContinue={onContinue} {...props} />,
  );
  const option = (name: RegExp) => screen.getByRole("button", { name });
  return { user, onIntent, onContinue, option, ...view };
}

const spoken = () =>
  document.getElementById("qz-live-polite")?.textContent ?? "";

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
  });
  // Testing Library drains each user-event call with a setTimeout(0) that it
  // only fast-forwards through a global `jest`; Vitest's fake timers need it
  // pointed at `vi`, or every interaction waits forever.
  vi.stubGlobal("jest", {
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.getElementById("qz-live-polite")?.remove();
  document.getElementById("qz-live-assertive")?.remove();
});

describe("ChoiceRound", () => {
  it("shows the kicker, the stem as the page heading and the options by letter", () => {
    setup();
    expect(screen.getByText(/Question 4 of 10/)).toHaveTextContent(
      "Question 4 of 10 · ●●○ Medium",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      PLANETS.stem,
    );
    const list = screen.getByRole("list", { name: PLANETS.stem });
    const names = within(list)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-keyshortcuts"));
    expect(names).toEqual(["1", "2", "3", "4"]);
    for (const [i, name] of [
      "A. Venus",
      "B. Uranus",
      "C. Neptune",
      "D. Saturn",
    ].entries()) {
      expect(within(list).getAllByRole("button")[i]).toHaveAccessibleName(name);
    }
    expect(screen.getByRole("button", { name: "B. Uranus" })).toHaveAttribute(
      "aria-keyshortcuts",
      "2",
    );
  });

  it("moves focus to the question's heading when the round opens", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("commits on release: the press shows on pointerdown and the answer waits for the click", async () => {
    const { user, onIntent, option } = setup();
    const uranus = option(/Uranus/);
    await user.pointer({ keys: "[MouseLeft>]", target: uranus });
    expect(uranus).toHaveAttribute("data-pressed");
    expect(onIntent).not.toHaveBeenCalled();
    await user.pointer({ keys: "[/MouseLeft]", target: uranus });
    expect(onIntent).toHaveBeenCalledExactlyOnceWith({
      family: "choice",
      kind: "answer",
      option: 1,
    });
  });

  it("cancels an answer when the pointer slides off before release", async () => {
    const { user, onIntent, option } = setup();
    const outside = screen.getByRole("button", { name: "Outside the round" });
    await user.pointer([
      { keys: "[MouseLeft>]", target: option(/Venus/) },
      { target: outside },
      { keys: "[/MouseLeft]", target: outside },
    ]);
    expect(onIntent).not.toHaveBeenCalled();
    expect(option(/Venus/)).toHaveAttribute("data-state", "idle");
  });

  it("keys 1 to 4 press on keydown and commit on keyup while focus is in the question", async () => {
    const { user, onIntent, option } = setup();
    await user.keyboard("{3>}");
    expect(option(/Neptune/)).toHaveAttribute("data-pressed");
    expect(onIntent).not.toHaveBeenCalled();
    await user.keyboard("{/3}");
    expect(onIntent).toHaveBeenCalledExactlyOnceWith({
      family: "choice",
      kind: "answer",
      option: 2,
    });
  });

  it("ignores the keys while focus is outside the question", async () => {
    const { user, onIntent } = setup();
    screen.getByRole("button", { name: "Outside the round" }).focus();
    await user.keyboard("2");
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("drops a held key when focus leaves the question before it is released", async () => {
    const { user, onIntent, option } = setup();
    await user.keyboard("{2>}");
    expect(option(/Uranus/)).toHaveAttribute("data-pressed");
    act(() => {
      screen.getByRole("button", { name: "Outside the round" }).focus();
    });
    await user.keyboard("{/2}");
    expect(onIntent).not.toHaveBeenCalled();
    expect(option(/Uranus/)).not.toHaveAttribute("data-pressed");
  });

  it("ignores the keys with shortcuts switched off, and shows no hints", async () => {
    const { user, onIntent, option } = setup({
      settings: { shortcuts: false },
    });
    await user.keyboard("2");
    expect(onIntent).not.toHaveBeenCalled();
    expect(option(/Uranus/)).not.toHaveAttribute("aria-keyshortcuts");
  });

  it("ignores keys beyond the options on screen and keys with modifiers", async () => {
    const { user, onIntent } = setup({ content: TRUE_FALSE });
    await user.keyboard("3");
    await user.keyboard("{Control>}1{/Control}");
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("locks the pick at once and reveals at 400 ms, then opens the sheet at 1.2 s", async () => {
    const { user, option } = setup();
    await user.click(option(/Venus/));
    expect(option(/Venus/)).toHaveAttribute("data-state", "locked");
    expect(option(/Uranus/)).toHaveAttribute("data-state", "disabled");
    wait(399);
    expect(option(/Venus/)).toHaveAttribute("data-state", "locked");
    expect(spoken()).toBe("");
    wait(1);
    expect(option(/Venus/)).toHaveAttribute("data-state", "your-answer");
    expect(option(/Uranus/)).toHaveAttribute("data-state", "correct");
    expect(option(/Neptune/)).toHaveAttribute("data-state", "dimmed");
    expect(spoken()).toBe("Not quite. You chose Venus. The answer is Uranus.");
    expect(screen.queryByRole("region")).toBeNull();
    wait(SHEET_AFTER_MS - 400);
    const sheet = screen.getByRole("region", {
      name: "Not quite. It's Uranus.",
    });
    expect(within(sheet).getByText("Not quite")).toBeInTheDocument();
    expect(within(sheet).getByText(PLANETS.explanation)).toBeInTheDocument();
    expect(
      within(sheet).getByRole("link", { name: /^Learn more about Uranus/ }),
    ).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/w/index.php?search=Uranus",
    );
    expect(
      within(sheet).getByRole("heading", { name: "Not quite. It's Uranus." }),
    ).toHaveFocus();
    expect(
      within(sheet).getByRole("button", { name: "Next question" }),
    ).toBeVisible();
  });

  it("speaks a right answer as Correct and the answer", async () => {
    const { user, option } = setup();
    await user.click(option(/Uranus/));
    wait(400);
    expect(spoken()).toBe("Correct. Uranus.");
    wait(800);
    expect(
      screen.getByRole("region", { name: "Right. It's Uranus." }),
    ).toBeVisible();
  });

  it("puts the verdict first in the sheet's heading, the one that takes focus", async () => {
    const { user, option } = setup();
    await user.click(option(/Venus/));
    wait(SHEET_AFTER_MS);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAccessibleName("Not quite. It's Uranus.");
    expect(heading.textContent).toMatch(/^Not quite/);
  });

  it("completes the automatic part at once on a tap, and lets the focused heading tell the verdict", async () => {
    const { user, option } = setup();
    await user.click(option(/Venus/));
    wait(100);
    await user.pointer({
      keys: "[MouseLeft]",
      target: screen.getByRole("heading", { level: 1 }),
    });
    const sheet = screen.getByRole("region", {
      name: "Not quite. It's Uranus.",
    });
    expect(sheet).toBeVisible();
    expect(within(sheet).getByRole("heading")).toHaveFocus();
    // Words sent now would be cut off by the focus move: the heading says it.
    expect(spoken()).toBe("");
    expect(option(/Venus/)).toHaveAttribute("data-state", "your-answer");
    // The beat's own timer, still running, adds nothing.
    wait(SHEET_AFTER_MS);
    expect(spoken()).toBe("");
  });

  it("shows a verdict that lands as the beat ends in the same commit, as the practice controller delivers it", () => {
    const opened = choicePlugin.open(PLANETS, meta(PLANETS), {
      at: 0,
      rng: createRng("held"),
      shuffle: null,
      optionsFromClue: 4,
      entities: null,
    });
    function Held() {
      const [reveal, setReveal] = useState<RoundReveal | null>(null);
      const [status, setStatus] = useState<RoundStatus>("idle");
      return (
        <ChoiceRound
          meta={meta(PLANETS)}
          open={opened.open}
          client={null}
          status={status}
          reveal={reveal}
          error={null}
          onIntent={(intent) => {
            if (intent.family !== "choice") return;
            setStatus("judging");
            const result = choicePlugin.judge(PLANETS, opened.judge, intent, {
              at: 0,
              rng: createRng("held"),
              shuffle: null,
              optionsFromClue: 4,
              entities: null,
            });
            // The controller holds the verdict for the beat, then delivers it.
            setTimeout(() => {
              if (result.ok && result.verdict.kind === "resolved") {
                setReveal(result.verdict.reveal);
                setStatus("revealed");
              }
            }, 400);
          }}
          onContinue={() => {}}
          continueLabel="Next question"
          context={{
            mode: "practice",
            sealed: false,
            list: null,
            itemRef: "p.sci.0042",
            settings: SETTINGS,
          }}
        />
      );
    }
    render(<Held />);
    act(() => {
      screen.getByRole("button", { name: /Venus/ }).click();
    });
    wait(399);
    expect(screen.getByRole("button", { name: /Venus/ })).toHaveAttribute(
      "data-state",
      "locked",
    );
    // Only the controller's timer runs: the options change with it, in its
    // commit, not in a timer of their own a task later.
    act(() => {
      vi.advanceTimersToNextTimer();
    });
    expect(screen.getByRole("button", { name: /Venus/ })).toHaveAttribute(
      "data-state",
      "your-answer",
    );
    expect(spoken()).toBe("Not quite. You chose Venus. The answer is Uranus.");
  });

  it("only a fresh Enter completes the reveal or continues: a held key's repeats do nothing", async () => {
    const { option, onContinue } = setup();
    const venus = option(/Venus/);
    venus.focus();
    // Enter on an option commits through the browser's click.
    act(() => {
      fireEvent.keyDown(venus, { key: "Enter" });
      venus.click();
    });
    wait(450);
    // The repeats of the held key: none completes the reveal.
    act(() => {
      fireEvent.keyDown(venus, { key: "Enter", repeat: true });
    });
    expect(screen.queryByRole("region")).toBeNull();
    wait(SHEET_AFTER_MS);
    const title = screen.getByRole("heading", { level: 2 });
    expect(title).toHaveFocus();
    act(() => {
      fireEvent.keyDown(title, { key: "Enter", repeat: true });
    });
    expect(onContinue).not.toHaveBeenCalled();
    // A fresh press on the title continues.
    act(() => {
      fireEvent.keyDown(title, { key: "Enter" });
    });
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("focuses the sheet's title without the browser's scroll and brings all of Continue on screen", async () => {
    const scrolls: unknown[] = [];
    // jsdom has no scrollIntoView of its own.
    Element.prototype.scrollIntoView = function (
      this: Element,
      arg?: boolean | ScrollIntoViewOptions,
    ) {
      scrolls.push([this.textContent, arg]);
    };
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      const { user, option } = setup();
      await user.click(option(/Uranus/));
      wait(SHEET_AFTER_MS);
      const title = screen.getByRole("heading", { level: 2 });
      expect(title).toHaveFocus();
      expect(
        focus.mock.contexts.some(
          (element, i) =>
            element === title &&
            (focus.mock.calls[i]?.[0] as FocusOptions | undefined)
              ?.preventScroll === true,
        ),
      ).toBe(true);
      expect(scrolls).toEqual([["Next question", { block: "nearest" }]]);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it("keeps the question's height as the sheet joins it, so the options above it stay put", async () => {
    const heights = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 612 } as DOMRect);
    const { user, option, container } = setup();
    await user.click(option(/Uranus/));
    wait(SHEET_AFTER_MS);
    const question = container.querySelector<HTMLElement>("[data-question]");
    expect(question?.style.minHeight).toBe("612px");
    heights.mockRestore();
  });

  it("continues from the sheet with Continue or with Enter", async () => {
    const { user, option, onContinue } = setup();
    await user.click(option(/Uranus/));
    wait(SHEET_AFTER_MS);
    await user.keyboard("{Enter}");
    expect(onContinue).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Next question" }));
    expect(onContinue).toHaveBeenCalledTimes(2);
  });

  it("keeps the verdict back while a sealed verdict is on its way, with Checking… past 1.5 s", () => {
    setup({ judge: false, status: "checking" });
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    for (const button of within(screen.getByRole("list")).getAllByRole(
      "button",
    )) {
      expect(button).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("shows the sheet at once, with no speech, for a round that opens already answered", () => {
    const opened = choicePlugin.open(PLANETS, meta(PLANETS), {
      at: 0,
      rng: createRng("x"),
      shuffle: null,
      optionsFromClue: 4,
      entities: null,
    });
    const result = choicePlugin.judge(
      PLANETS,
      opened.judge,
      { family: "choice", kind: "answer", option: 0 },
      {
        at: 0,
        rng: createRng("x"),
        shuffle: null,
        optionsFromClue: 4,
        entities: null,
      },
    );
    if (!result.ok || result.verdict.kind !== "resolved")
      throw new Error("no reveal");
    render(
      <ChoiceRound
        meta={meta(PLANETS)}
        open={opened.open}
        client={null}
        status="revealed"
        reveal={result.verdict.reveal}
        error={null}
        onIntent={() => {}}
        onContinue={() => {}}
        continueLabel="See your results"
        context={{
          mode: "practice",
          sealed: false,
          list: null,
          itemRef: "p.sci.0042",
          settings: SETTINGS,
        }}
      />,
    );
    const sheet = screen.getByRole("region", {
      name: "Not quite. It's Uranus.",
    });
    expect(within(sheet).getByRole("heading")).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "A. Venus Your answer" }),
    ).toHaveAttribute("data-state", "your-answer");
    expect(spoken()).toBe("");
    expect(
      screen.getByRole("button", { name: "See your results" }),
    ).toBeVisible();
  });

  it("shows both checked values of a comparison after the reveal, in display order", async () => {
    const { user } = setup({ content: COMPARISON });
    const buttons = within(screen.getByRole("list")).getAllByRole("button");
    // The stored order puts the Games first.
    expect(buttons[0]).toHaveAccessibleName("A. The Gorlund Games");
    expect(buttons[1]).toHaveAccessibleName("B. The Cindral charter");
    expect(screen.queryByText("1204")).toBeNull();
    await user.click(buttons[0] as HTMLElement);
    wait(400);
    expect(screen.getByText("1388")).toBeInTheDocument();
    expect(screen.getByText("1204")).toBeInTheDocument();
    expect(spoken()).toBe(
      "Not quite. You chose The Gorlund Games. The answer is The Cindral charter.",
    );
  });

  it("reads True and False for a true/false round, and titles its sheet in words", async () => {
    const { user, option } = setup({ content: TRUE_FALSE });
    expect(option(/True/)).toHaveAccessibleName("A. True");
    expect(option(/False/)).toHaveAccessibleName("B. False");
    await user.click(option(/True/));
    wait(SHEET_AFTER_MS);
    expect(
      screen.getByRole("region", { name: "Right. It's true." }),
    ).toBeVisible();
  });

  it("titles the sheet mid-sentence: a leading article in lower case, a title or a name as written", async () => {
    const titled = (label: string, format: ChoiceFormat = "mc") =>
      CHOICE_COPY.title(label, format);
    expect(titled("The bell comb")).toBe("It's the bell comb.");
    expect(titled("A tide staff")).toBe("It's a tide staff.");
    expect(titled("An oxbow lake")).toBe("It's an oxbow lake.");
    expect(titled("The Gorlund bell")).toBe("It's the Gorlund bell.");
    expect(titled("The 1920s")).toBe("It's the 1920s.");
    expect(titled("The Great Gatsby")).toBe("It's The Great Gatsby.");
    expect(titled("A Tale of Two Cities")).toBe("It's A Tale of Two Cities.");
    expect(titled("The Hague")).toBe("It's The Hague.");
    expect(titled("Uranus")).toBe("It's Uranus.");
    expect(titled("Theodore Roosevelt")).toBe("It's Theodore Roosevelt.");
    expect(titled("True", "tf")).toBe("It's true.");

    const { user } = setup({
      content: {
        ...COMPARISON,
        options: ["The Cindral bell", "The Gorlund bell"],
        correct: 1,
      },
    });
    const buttons = within(screen.getByRole("list")).getAllByRole("button");
    await user.click(buttons[0] as HTMLElement);
    wait(SHEET_AFTER_MS);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /It's the Gorlund bell\.$/,
      }),
    ).toBeVisible();
  });

  describe("on a short screen, under 740 px tall", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "matchMedia",
        (query: string) =>
          ({
            matches: query === SHORT_SCREEN_QUERY,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      );
    });

    it("opens the sheet compact: the explanation's first line, Read more, and Continue", async () => {
      const { user, option } = setup();
      await user.click(option(/Uranus/));
      wait(SHEET_AFTER_MS);
      const sheet = screen.getByRole("region", { name: "Right. It's Uranus." });
      const explanation = within(sheet).getByText(PLANETS.explanation);
      expect(explanation).toHaveAttribute("data-clamped");
      expect(explanation.className).toContain("line-clamp-1");
      // The ghost actions wait for Read more; Continue doesn't.
      expect(
        within(sheet).queryByRole("link", { name: /Learn more/ }),
      ).toBeNull();
      expect(
        within(sheet).getByRole("button", { name: "Next question" }),
      ).toBeVisible();

      const more = within(sheet).getByRole("button", { name: "Read more" });
      expect(more).toHaveAttribute("aria-expanded", "false");
      expect(more).toHaveAttribute("aria-controls", explanation.id);
      await user.click(more);
      expect(explanation).not.toHaveAttribute("data-clamped");
      expect(explanation).toHaveFocus();
      expect(
        within(sheet).queryByRole("button", { name: "Read more" }),
      ).toBeNull();
      expect(
        within(sheet).getByRole("link", { name: /^Learn more about Uranus/ }),
      ).toBeVisible();
    });
  });

  it("moves on by itself with auto-advance after 2 s plus 0.25 s a word, unless a tap stops it", async () => {
    const words = PLANETS.explanation.split(/\s+/).length;
    const first = setup({ settings: { autoAdvance: true } });
    await first.user.click(first.option(/Uranus/));
    wait(SHEET_AFTER_MS);
    wait(2000 + 250 * words - 1);
    expect(first.onContinue).not.toHaveBeenCalled();
    wait(1);
    expect(first.onContinue).toHaveBeenCalledOnce();
    first.unmount();

    const second = setup({ settings: { autoAdvance: true } });
    await second.user.click(second.option(/Uranus/));
    wait(SHEET_AFTER_MS);
    await second.user.pointer({
      keys: "[MouseLeft]",
      target: screen.getByText(PLANETS.explanation),
    });
    wait(60_000);
    expect(second.onContinue).not.toHaveBeenCalled();
  });

  it("words its verdicts for the status region", () => {
    const open = choicePlugin.open(PLANETS, meta(PLANETS), {
      at: 0,
      rng: createRng("v"),
      shuffle: null,
      optionsFromClue: 4,
      entities: null,
    }).open;
    const reveal = (chosenIndex: number | null) => ({
      family: "choice" as const,
      correctIndex: 1,
      chosenIndex,
      correct: chosenIndex === 1,
      points: chosenIndex === 1 ? 1 : 0,
      valueDisplay: null,
      explanation: "",
      learnMore: "",
      crowd: null,
    });
    expect(verdictText(open, reveal(1))).toBe("Correct. Uranus.");
    expect(verdictText(open, reveal(3))).toBe(
      "Not quite. You chose Saturn. The answer is Uranus.",
    );
    expect(verdictText(open, reveal(null))).toBe(
      "Not quite. The answer is Uranus.",
    );
  });
});
