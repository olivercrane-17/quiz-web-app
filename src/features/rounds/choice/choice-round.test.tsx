import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRng } from "@/engine/rng";
import { choicePlugin, type ChoiceContent } from "@/engine/rounds/choice";
import type { RoundStatus } from "@/engine/run";
import {
  parseItemId,
  type CategoryId,
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

/** fx.p.hist.0104: a title-case name with a leading The. */
const GUILDS: ChoiceContent = {
  ...PLANETS,
  category: "hist",
  stem: "Which fixture guild built the glass bridge of Cindral?",
  options: [
    "The Glaziers' Guild",
    "The Masons' Guild",
    "The Smiths' Guild",
    "The Weavers' Guild",
  ],
  correct: 0,
  order: "fixed",
  learnMore: "Glass bridge of Cindral (fixture)",
};

/** fx.p.geo.0109: one era beside bare years, in ascending order. */
const OLD_WALL: ChoiceContent = {
  ...PLANETS,
  category: "geo",
  stem: "When was the fixture Old Wall of Gorlund begun?",
  options: ["120 BC", "300 BC", "45", "210"],
  correct: 0,
  order: "ascending",
  learnMore: "Old Wall of Gorlund (fixture)",
};

/** fx.p.geo.0103: "How many bridges cross the Corran?" (2, 4, 9, 15). */
const BRIDGES: ChoiceContent = {
  ...PLANETS,
  category: "geo",
  stem: "How many bridges cross the fixture river Corran?",
  options: ["4", "2", "9", "15"],
  correct: 0,
  order: "ascending",
  learnMore: "Corran bridges (fixture)",
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
    category: content.category,
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

/** D20's line under the options, or null while it isn't shown. */
const legend = () => document.querySelector("[data-keys-legend]");

/**
 * D20: the option keys act only on an option, so a keyboard player Tabs
 * from the stem, where each question puts focus, to option A first.
 */
async function tabToOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.tab();
  expect(document.activeElement).toHaveAttribute("data-state", "idle");
  expect(document.activeElement).toHaveAccessibleName(/^A\. /);
}

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
  it("D6 draws one key hint per option, its badge's letter, with no hiding class for a second one", () => {
    setup();
    const list = screen.getByRole("list", { name: PLANETS.stem });
    // AnswerButton draws no key cap since FIX-DS, so nothing needs hiding;
    // the keys stay in aria-keyshortcuts (the next test).
    expect(list.querySelectorAll("kbd")).toHaveLength(0);
    for (const option of within(list).getAllByRole("button")) {
      expect(option.className).not.toMatch(/\[&_kbd\]/);
    }
  });

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
    expect(names).toEqual(["A 1", "B 2", "C 3", "D 4"]);
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
      "B 2",
    );
  });

  it("R1-34 gives the stem no outline-none, so it shows the app's one ring when focused from the keyboard", () => {
    setup();
    const stem = screen.getByRole("heading", { level: 1 });
    expect(stem).toHaveAttribute("tabindex", "-1");
    expect(stem.className).not.toMatch(/\boutline-none\b/);
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

  it("keys 1 to 4 press on keydown and commit on keyup while focus is on an option", async () => {
    const { user, onIntent, option } = setup();
    await tabToOptions(user);
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

  it("ignores the keys while focus is outside the round", async () => {
    const { user, onIntent } = setup();
    screen.getByRole("button", { name: "Outside the round" }).focus();
    await user.keyboard("2");
    expect(onIntent).not.toHaveBeenCalled();
    expect(legend()).toBeNull();
  });

  it("drops a held key when focus leaves the options before it is released", async () => {
    const { user, onIntent, option } = setup();
    await tabToOptions(user);
    await user.keyboard("{2>}");
    expect(option(/Uranus/)).toHaveAttribute("data-pressed");
    act(() => {
      screen.getByRole("button", { name: "Outside the round" }).focus();
    });
    await user.keyboard("{/2}");
    expect(onIntent).not.toHaveBeenCalled();
    expect(option(/Uranus/)).not.toHaveAttribute("data-pressed");
  });

  it("ignores the keys with shortcuts switched off, and shows no hints and no legend", async () => {
    const { user, onIntent, option } = setup({
      settings: { shortcuts: false },
    });
    await tabToOptions(user);
    await user.keyboard("2");
    expect(onIntent).not.toHaveBeenCalled();
    expect(option(/Uranus/)).not.toHaveAttribute("aria-keyshortcuts");
    expect(legend()).toBeNull();
  });

  it("ignores keys beyond the options on screen and keys with modifiers", async () => {
    const { user, onIntent } = setup({ content: TRUE_FALSE });
    await tabToOptions(user);
    await user.keyboard("3");
    await user.keyboard("{Control>}1{/Control}");
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("R1-13 picks by the letters A to D, matching the badges, on keydown and keyup", async () => {
    const { user, onIntent, option } = setup();
    await tabToOptions(user);
    await user.keyboard("{c>}");
    expect(option(/Neptune/)).toHaveAttribute("data-pressed");
    expect(onIntent).not.toHaveBeenCalled();
    await user.keyboard("{/c}");
    expect(onIntent).toHaveBeenCalledExactlyOnceWith({
      family: "choice",
      kind: "answer",
      option: 2,
    });
  });

  it("R1-13 with word options, 3 and c both pick option C, and so does a capital C", async () => {
    for (const key of ["3", "c", "C"]) {
      const { user, onIntent, unmount } = setup();
      await tabToOptions(user);
      await user.keyboard(key);
      expect(onIntent).toHaveBeenCalledExactlyOnceWith({
        family: "choice",
        kind: "answer",
        option: 2,
      });
      unmount();
    }
  });

  it("R1-13 with number options, 4 picks nothing and b picks option B", async () => {
    const { user, onIntent, option } = setup({ content: BRIDGES });
    // Ascending: 2, 4, 9, 15. Four was the answer; D was 15.
    expect(option(/^D\. 15/)).toHaveAttribute("data-state", "idle");
    await tabToOptions(user);
    for (const digit of ["1", "2", "3", "4"]) await user.keyboard(digit);
    expect(onIntent).not.toHaveBeenCalled();
    for (const button of within(screen.getByRole("list")).getAllByRole(
      "button",
    )) {
      expect(button).toHaveAttribute("data-state", "idle");
    }
    await user.keyboard("b");
    expect(onIntent).toHaveBeenCalledExactlyOnceWith({
      family: "choice",
      kind: "answer",
      option: 1,
    });
  });

  it("R1-13 names one key per option on a number question: the letter on its badge", () => {
    setup({ content: BRIDGES });
    const keys = within(screen.getByRole("list"))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-keyshortcuts"));
    expect(keys).toEqual(["A", "B", "C", "D"]);
  });

  describe("D20: option keys act only on an option (RITE round 2)", () => {
    it("R2-02 with focus on the question's heading, c commits nothing", async () => {
      const { user, onIntent, option } = setup();
      const stem = screen.getByRole("heading", { level: 1 });
      expect(stem).toHaveFocus();
      // Sam's stray key: held and let go on the heading, where each
      // question puts focus. So do a digit and the other letters.
      await user.keyboard("{c>}");
      expect(option(/Neptune/)).not.toHaveAttribute("data-pressed");
      await user.keyboard("{/c}");
      for (const key of ["a", "B", "3", "d"]) await user.keyboard(key);
      wait(SHEET_AFTER_MS);
      expect(onIntent).not.toHaveBeenCalled();
      for (const button of within(screen.getByRole("list")).getAllByRole(
        "button",
      )) {
        expect(button).toHaveAttribute("data-state", "idle");
      }
      expect(screen.queryByRole("region")).toBeNull();
      expect(stem).toHaveFocus();
      // A key on the heading isn't a keyboard in the options: no legend.
      expect(legend()).toBeNull();
    });

    it("R2-02 with focus on option A, c commits C, the one answer for the one key", async () => {
      const { user, onIntent, option } = setup();
      await tabToOptions(user);
      await user.keyboard("c");
      expect(onIntent).toHaveBeenCalledExactlyOnceWith({
        family: "choice",
        kind: "answer",
        option: 2,
      });
      expect(option(/Neptune/)).toHaveAttribute("data-state", "locked");
      expect(option(/Venus/)).toHaveAttribute("data-state", "disabled");
      // A second key changes nothing: the answer is in.
      await user.keyboard("b");
      expect(onIntent).toHaveBeenCalledOnce();
    });

    it("R2-02 shows Keys A to D answer. under the options after the first key in them, until the answer locks", async () => {
      const { user, container } = setup();
      // A new question: focus on the heading, nothing typed yet.
      expect(legend()).toBeNull();
      // The first key in the options is the Tab that reaches option A.
      await tabToOptions(user);
      const line = legend();
      expect(line).toHaveTextContent(/^Keys A to D answer\.$/);
      expect(line).toBeVisible();
      // A line of its own, under the options, drawn by the round, not by
      // an option's AnswerButton.
      const list = screen.getByRole("list");
      expect(list.contains(line)).toBe(false);
      expect(list.nextElementSibling).toBe(line);
      expect(
        container.querySelector("[data-question]")?.contains(line ?? null),
      ).toBe(true);
      // It stays while focus moves between options, and goes once the
      // answer locks, when the keys have nothing left to do.
      await user.tab();
      expect(legend()).not.toBeNull();
      await user.keyboard("a");
      expect(legend()).toBeNull();
    });

    it("R2-02 shows the legend after a key on an option that reached focus another way", async () => {
      const { user, onIntent, option } = setup();
      act(() => {
        option(/Uranus/).focus();
      });
      // A key that answers nothing still says a keyboard is in use.
      await user.keyboard("x");
      expect(onIntent).not.toHaveBeenCalled();
      expect(legend()).toHaveTextContent("Keys A to D answer.");
    });

    it("R2-02 names only the letters on screen: Keys A and B answer. on true or false", async () => {
      const { user } = setup({ content: TRUE_FALSE });
      await tabToOptions(user);
      expect(legend()).toHaveTextContent(/^Keys A and B answer\.$/);
      expect(CHOICE_COPY.keysLegend(3)).toBe("Keys A to C answer.");
      expect(CHOICE_COPY.keysLegend(4)).toBe("Keys A to D answer.");
    });

    it("R2-02 a tap or a click answers without ever showing the legend", async () => {
      const { user, option } = setup();
      await user.click(option(/Venus/));
      expect(legend()).toBeNull();
      wait(SHEET_AFTER_MS);
      expect(legend()).toBeNull();
    });

    it("R2-02 D6's digits still answer from an option, and stand down on a number question", async () => {
      const words = setup();
      await tabToOptions(words.user);
      await words.user.keyboard("2");
      expect(words.onIntent).toHaveBeenCalledExactlyOnceWith({
        family: "choice",
        kind: "answer",
        option: 1,
      });
      words.unmount();

      const numbers = setup({ content: BRIDGES });
      await tabToOptions(numbers.user);
      await numbers.user.keyboard("4");
      expect(numbers.onIntent).not.toHaveBeenCalled();
      // The legend names the letters, which do answer here.
      expect(legend()).toHaveTextContent("Keys A to D answer.");
    });
  });

  it("R1-12 focuses the stem without the browser's scroll when a question opens", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    setup();
    const stem = screen.getByRole("heading", { level: 1 });
    expect(stem).toHaveFocus();
    expect(
      focus.mock.contexts.some(
        (element, i) =>
          element === stem &&
          (focus.mock.calls[i]?.[0] as FocusOptions | undefined)
            ?.preventScroll === true,
      ),
    ).toBe(true);
  });

  it("R1-12 keeps the question's top below the sticky header when a question opens scrolled under it", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        // The page is scrolled 120 px: the question starts under the header.
        if (this.tagName === "HEADER") {
          return { top: 0, bottom: 56, height: 56 } as DOMRect;
        }
        if (this.hasAttribute("data-question")) {
          return { top: -48, bottom: 552, height: 600 } as DOMRect;
        }
        return { top: 0, bottom: 0, height: 0 } as DOMRect;
      },
    );
    const header = document.createElement("header");
    header.style.position = "sticky";
    document.body.prepend(header);
    try {
      setup();
      // Up by 120 px less nothing: 56 (header) + 16 (gap) - (-48).
      expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
        top: -120,
        behavior: "instant",
      });
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    } finally {
      header.remove();
    }
  });

  it("R1-14 leaves focus where the player moved it before the sheet opened, and still says the verdict", async () => {
    const { user } = setup();
    // By key, from option A: B is Uranus, the answer.
    await tabToOptions(user);
    await user.keyboard("b");
    wait(100);
    const outside = screen.getByRole("button", { name: "Outside the round" });
    act(() => {
      outside.focus();
    });
    wait(300);
    expect(spoken()).toBe("Correct. Uranus.");
    wait(SHEET_AFTER_MS);
    expect(
      screen.getByRole("region", { name: "Right. It's Uranus." }),
    ).toBeVisible();
    expect(outside).toHaveFocus();
  });

  it("R1-14 moves focus to the sheet while it is still on the answered option", async () => {
    const { user, option } = setup();
    await user.click(option(/Venus/));
    expect(option(/Venus/)).toHaveFocus();
    wait(SHEET_AFTER_MS);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Not quite. It's Uranus.",
      }),
    ).toHaveFocus();
  });

  it("R1-14 moves focus to the sheet when focus is on the page itself, or on something hidden", async () => {
    const first = setup();
    await tabToOptions(first.user);
    await first.user.keyboard("a");
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    expect(document.activeElement).toBe(document.body);
    wait(SHEET_AFTER_MS);
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    first.unmount();

    // A route Next keeps mounted behind this one is display: none.
    const second = setup();
    const outside = screen.getByRole("button", { name: "Outside the round" });
    await tabToOptions(second.user);
    await second.user.keyboard("a");
    act(() => {
      outside.focus();
      outside.style.display = "none";
    });
    wait(SHEET_AFTER_MS);
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
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

  it("focuses the sheet's title without the browser's scroll", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
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
  });

  it("R1-21 collapses the thumb-zone spacer once the answer locks, so the sheet takes that room at the bottom", async () => {
    const { user, option, container } = setup({ judge: false });
    const question = container.querySelector<HTMLElement>("[data-question]");
    const list = screen.getByRole("list");
    // Open: the question fills the column and the options anchor at its foot.
    expect(question).not.toHaveAttribute("data-settled");
    expect(question?.className).toContain("flex-1");
    expect(list.className).toContain("mt-auto");
    await user.click(option(/Venus/));
    // Locked in: the options close up under the stem at once.
    expect(option(/Venus/)).toHaveAttribute("data-state", "locked");
    expect(question).toHaveAttribute("data-settled");
    expect(question?.className).not.toContain("flex-1");
    expect(list.className).not.toContain("mt-auto");
  });

  it("R1-21 puts the sheet at the foot of the round, where the answers were", async () => {
    const { user, option } = setup();
    await user.click(option(/Uranus/));
    wait(SHEET_AFTER_MS);
    const sheet = screen.getByRole("region", { name: "Right. It's Uranus." });
    expect(sheet.className).toContain("mt-auto");
    expect(
      sheet.closest("[data-round]")?.querySelector("[data-question]"),
    ).toHaveAttribute("data-settled");
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
    const titled = (
      label: string,
      format: ChoiceFormat = "mc",
      category: CategoryId | null = null,
    ) => CHOICE_COPY.title(label, format, category);
    expect(titled("The bell comb")).toBe("It's the bell comb.");
    expect(titled("A tide staff")).toBe("It's a tide staff.");
    expect(titled("An oxbow lake")).toBe("It's an oxbow lake.");
    expect(titled("The Gorlund bell")).toBe("It's the Gorlund bell.");
    expect(titled("The 1920s")).toBe("It's the 1920s.");
    expect(titled("The Great Gatsby", "mc", "book")).toBe(
      "It's The Great Gatsby.",
    );
    expect(titled("A Tale of Two Cities", "mc", "book")).toBe(
      "It's A Tale of Two Cities.",
    );
    expect(titled("The Hague", "mc", "geo")).toBe("It's The Hague.");
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

  it("R1-25 lowers a leading The on a name in title case: It's the Glaziers' Guild", async () => {
    expect(CHOICE_COPY.title("The Glaziers' Guild", "mc", "hist")).toBe(
      "It's the Glaziers' Guild.",
    );
    expect(CHOICE_COPY.title("The Ashen Hills", "mc", "geo")).toBe(
      "It's the Ashen Hills.",
    );
    const { user } = setup({ content: GUILDS });
    await user.click(screen.getByRole("button", { name: /Glaziers/ }));
    wait(SHEET_AFTER_MS);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Right. It's the Glaziers' Guild.",
      }),
    ).toHaveFocus();
  });

  it("R1-25 marks the era on every option once one is BC, in the options, the title and the status", async () => {
    const { user } = setup({ content: OLD_WALL });
    const buttons = within(screen.getByRole("list")).getAllByRole("button");
    // Ascending, as the item asks: 300 BC, 120 BC, then the AD years.
    for (const [i, name] of [
      "A. 300 BC",
      "B. 120 BC",
      "C. AD 45",
      "D. AD 210",
    ].entries()) {
      expect(buttons[i]).toHaveAccessibleName(name);
    }
    await user.click(screen.getByRole("button", { name: /AD 45/ }));
    wait(400);
    expect(spoken()).toBe("Not quite. You chose AD 45. The answer is 120 BC.");
    wait(SHEET_AFTER_MS);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Not quite. It's 120 BC.",
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

    it("R1-31 opens the sheet compact but whole: the explanation, Learn more and Continue, with no Read more", async () => {
      const { user, option } = setup();
      await user.click(option(/Uranus/));
      wait(SHEET_AFTER_MS);
      const sheet = screen.getByRole("region", { name: "Right. It's Uranus." });
      const explanation = within(sheet).getByText(PLANETS.explanation);
      expect(explanation.className).not.toContain("line-clamp");
      expect(
        within(sheet).queryByRole("button", { name: "Read more" }),
      ).toBeNull();
      expect(
        within(sheet).getByRole("link", { name: /^Learn more about Uranus/ }),
      ).toBeVisible();
      expect(
        within(sheet).getByRole("button", { name: "Next question" }),
      ).toBeVisible();
      // Compact still: the tighter spacing of DESIGN §6.10.
      expect(sheet.querySelector("[data-sheet-body]")?.className).toContain(
        "gap-2",
      );
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
