/**
 * The Mystery's clue 4 after RITE round 5 (docs/playtests/rite-5.md §6;
 * the decisions memo §28, D38): each test title starts with the finding it
 * reproduces. R5-03 is the legend's wording (Sam: A, Tab, Enter), R5-04
 * the typed-word rule's pause (Dee: three slow changes of mind) and where
 * focus rests when a word trips it. What needs a real browser is also
 * measured in e2e/daily/rite-5.spec.ts.
 */
import { act, screen, within } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { loadFixtureList } from "@/content/loaders/fixtures/lists";
import { FIXTURE_MYSTERIES } from "@/content/loaders/fixtures/sealed";
import {
  parseItemId,
  type MysteryContent,
  type RoundIntent,
} from "@/engine/types";
import { renderWithUser } from "@/test/render";
import { LIVE_REGION_IDS, clearAnnouncements } from "@/ui/announce";

import { answerListHandleOf, type MysteryAnswerList } from "../answer-list";
import type { RoundComponentProps } from "../contracts";
import { MysteryRound } from ".";
import { MYSTERY_COPY } from "./copy";
import { WORD_PAUSE_MS } from "./options";
import { TEST_SETTINGS, mysteryMeta, setPointer } from "./testing";

let people: MysteryAnswerList;
let odile: MysteryContent;

beforeAll(async () => {
  const person = await loadFixtureList("person");
  if (person === null) throw new Error("no fixture list");
  people = answerListHandleOf(person.list);
  const id = parseItemId("fx.m.hist.0101");
  const found = id === null ? undefined : FIXTURE_MYSTERIES.get(id);
  if (found === undefined) throw new Error("no fixture mystery");
  odile = found;
});

beforeEach(() => {
  clearAnnouncements();
  // A laptop: the keys' legend shows from the start (D32).
  setPointer("mouse");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const LAST_LEAD =
  "Last clue. Pick one of four. One pick: a wrong one scores 0.";
const KEYS = "Keys A to D choose. Enter on your choice locks in.";
const TAP = "Tap one, then Lock in.";
const TYPED = "Typing chooses nothing. Press Esc, then A to D.";
const NAMES = ["Odile Marsh", "Liesl Varo", "Ennis Ward", "Mira Tolland"];

const liveText = () =>
  document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";
const optionsGroup = () => screen.getByRole("group", { name: /^Clue 4:/ });
const options = () => within(optionsGroup()).getAllByRole("button").slice(0, 4);
const option = (position: number) => {
  const button = options()[position];
  if (button === undefined) throw new Error(`no option ${String(position)}`);
  return button;
};
const lockIn = () =>
  within(optionsGroup()).getByRole("button", { name: /^Lock in/ });
const legend = () => document.querySelector("[data-keys-legend]");
/** The positions of the options that read as pressed. */
const pressed = () =>
  options().flatMap((button, position) =>
    button.getAttribute("aria-pressed") === "true" ? [position] : [],
  );

function picks(onIntent: RoundComponentProps["onIntent"]) {
  return vi
    .mocked(onIntent)
    .mock.calls.map(([intent]) => intent)
    .filter((intent) => intent.family === "mystery" && intent.kind === "pick");
}

/** A Mystery on clue 4 with the four options showing, as a reload brings it back. */
function atClue4(): RoundComponentProps {
  return {
    meta: mysteryMeta({ ordinal: 1 }),
    open: {
      family: "mystery",
      index: 0,
      clue: 4,
      clues: [...odile.clues],
      wrongGuesses: [],
      options: NAMES.map((label, index) => ({
        index,
        label,
        alreadyGuessed: false,
      })),
      issuedAt: 0,
    },
    client: null,
    status: "idle",
    reveal: null,
    error: null,
    onIntent: vi.fn<(intent: RoundIntent) => void>(),
    onContinue: vi.fn(),
    continueLabel: "Next mystery",
    context: {
      mode: "daily",
      sealed: true,
      list: people,
      itemRef: "daily:51:0",
      settings: TEST_SETTINGS,
    },
  };
}

/** Moves `performance.now` on, as a pause between keys would. */
function pausable() {
  const real = performance.now.bind(performance);
  let offset = 0;
  vi.spyOn(performance, "now").mockImplementation(() => real() + offset);
  return (ms: number) => {
    offset += ms;
  };
}

describe("clue 4's legend says where Enter locks in (R5-03, D38)", () => {
  it("R5-03 the keyboard legend reads Keys A to D choose. Enter on your choice locks in., and is the group's description", () => {
    render();
    expect(MYSTERY_COPY.options.legend).toBe(KEYS);
    expect(legend()).toHaveAttribute("data-keys-legend", "keys");
    expect(legend()).toHaveTextContent(KEYS);
    expect(optionsGroup()).toHaveAccessibleDescription(`${LAST_LEAD} ${KEYS}`);
  });

  it("R5-03 Sam's path: a, Tab, Enter sends nothing; Enter chose the option it was pressed on, B, as the legend now says it would", async () => {
    const { props, user } = render();
    await user.keyboard("a");
    expect(pressed()).toEqual([0]);
    await user.tab();
    expect(option(1)).toHaveFocus();
    // The mark stays on A while focus is on B.
    expect(pressed()).toEqual([0]);
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([1]);
    expect(lockIn()).toHaveAccessibleName("Lock in Liesl Varo");
    // Now B is his choice, and Enter on it locks in.
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  it("R5-03 the line holds room for its other two wordings, so the longer legend moves nothing", () => {
    render();
    expect(
      [...document.querySelectorAll("[data-reserve]")].map((node) =>
        node.getAttribute("data-reserve"),
      ),
    ).toEqual([TAP, TYPED]);
  });

  it("R5-05 on a touch phone the line holds no room for the keys' legend until a key is pressed, so no third line stays blank at 200% text", async () => {
    setPointer("touch");
    const { user } = render();
    const reserves = () =>
      [...document.querySelectorAll("[data-reserve]")].map((node) =>
        node.getAttribute("data-reserve"),
      );
    expect(legend()).toHaveTextContent(TAP);
    expect(reserves()).toEqual([TYPED]);
    await user.keyboard("{Shift}");
    expect(legend()).toHaveTextContent(KEYS);
    expect(reserves()).toEqual([TAP, TYPED]);
  });

  it("R5-11 on a touch load the options group is focused with the quiet mark and a class that draws no outline; a first key takes the mark away", async () => {
    setPointer("touch");
    // The last input was a finger's: the tap on Next clue.
    window.dispatchEvent(
      Object.assign(new Event("pointerdown"), { pointerType: "touch" }),
    );
    const { user } = render();
    expect(optionsGroup()).toHaveFocus();
    expect(optionsGroup()).toHaveAttribute("data-focus-quiet");
    expect(optionsGroup()).toHaveClass("data-[focus-quiet]:outline-none");
    await user.keyboard("{Shift}");
    expect(optionsGroup()).not.toHaveAttribute("data-focus-quiet");
  });

  it("R5-11 on a laptop the options group wears no quiet mark", () => {
    // The last input was a mouse's, not the key of the test before.
    window.dispatchEvent(new Event("pointerdown"));
    render();
    expect(optionsGroup()).toHaveFocus();
    expect(optionsGroup()).not.toHaveAttribute("data-focus-quiet");
  });

  it("R5-12 a touch after a key brings Tap one, then Lock in. back to clue 4's line, and the next key the keys' legend", async () => {
    setPointer("touch");
    const { user } = render();
    expect(legend()).toHaveTextContent(TAP);
    await user.keyboard("{Shift}");
    expect(legend()).toHaveTextContent(KEYS);
    act(() => {
      document.body.dispatchEvent(
        Object.assign(new Event("pointerdown", { bubbles: true }), {
          pointerType: "touch",
        }),
      );
    });
    expect(legend()).toHaveTextContent(TAP);
    await user.keyboard("{Shift}");
    expect(legend()).toHaveTextContent(KEYS);
  });
});

describe("the typed-word rule eases after a pause (R5-04, D38)", () => {
  it("R5-04 the pause that starts the count again is 1.5 s", () => {
    expect(WORD_PAUSE_MS).toBe(1500);
  });

  it("R5-04 Dee's path: a, 2.5 s, b, 2.5 s, d leaves D chosen and the bar reading Lock in Mira Tolland; Enter sends one pick, for D", async () => {
    const pause = pausable();
    const { props, user } = render();
    expect(optionsGroup()).toHaveFocus();
    await user.keyboard("a");
    expect(pressed()).toEqual([0]);
    pause(2_500);
    await user.keyboard("b");
    expect(pressed()).toEqual([1]);
    pause(2_500);
    await user.keyboard("d");
    expect(option(3)).toHaveAttribute("aria-pressed", "true");
    expect(pressed()).toEqual([3]);
    expect(option(3)).toHaveFocus();
    expect(lockIn()).toHaveAccessibleName("Lock in Mira Tolland");
    expect(legend()).toHaveTextContent(KEYS);
    expect(liveText()).toBe("Mira Tolland chosen. Enter locks it in.");
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 3 },
    ]);
  });

  it("R5-04 four slow changes of mind work too: a, b, c, d at 1.5 s a key, then Enter after a pause, locks D", async () => {
    const pause = pausable();
    const { props, user } = render();
    for (const [at, key] of [..."abcd"].entries()) {
      await user.keyboard(key);
      expect(pressed()).toEqual([at]);
      pause(WORD_PAUSE_MS);
    }
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 3 },
    ]);
  });

  for (const word of ["dad", "cab", "abba"]) {
    for (const ms of [80, 250, 600, 900]) {
      it(`R5-04 ${word} at ${String(ms)} ms a key, then Enter, locks nothing: no option is pressed and focus is back on the options group`, async () => {
        const pause = pausable();
        const { props, user } = render();
        for (const key of word) {
          await user.keyboard(key);
          pause(ms);
        }
        await user.keyboard("{Enter}");
        expect(props.onIntent).not.toHaveBeenCalled();
        expect(pressed()).toEqual([]);
        expect(document.querySelector("[data-chosen]")).toBeNull();
        expect(document.activeElement).toBe(optionsGroup());
        expect(lockIn()).toHaveAccessibleName("Lock in");
        expect(legend()).toHaveTextContent(TYPED);
        expect(liveText()).toBe(TYPED);
      });
    }
  }

  it("R5-04 a pause just short of 1.5 s is still typing: a, b, then d 1.4 s later is a word", async () => {
    const pause = pausable();
    const { props, user } = render();
    await user.keyboard("a");
    pause(WORD_PAUSE_MS - 100);
    await user.keyboard("b");
    pause(WORD_PAUSE_MS - 100);
    await user.keyboard("d");
    expect(pressed()).toEqual([]);
    expect(optionsGroup()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
  });

  it("R5-04 the pause restarts the count, it doesn't end a word already typed: Abba, 2.5 s, a, Enter locks nothing until Escape", async () => {
    const pause = pausable();
    const { props, user } = render();
    await user.keyboard("Abba");
    pause(2_500);
    await user.keyboard("a{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([]);
    expect(legend()).toHaveTextContent(TYPED);
    await user.keyboard("{Escape}");
    expect(legend()).toHaveTextContent(KEYS);
    await user.keyboard("a");
    expect(pressed()).toEqual([0]);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });

  for (const [first, last, name] of [
    ["De", "b", "Deb"],
    ["mi", "a", "Mia"],
  ] as const) {
    it(`R5-04 ${first}, 1.6 s, ${last}, Enter locks nothing: one hesitation inside ${name} is still typing, after a letter that names no option`, async () => {
      const pause = pausable();
      const { props, user } = render();
      await user.keyboard(first);
      pause(WORD_PAUSE_MS + 100);
      await user.keyboard(last);
      expect(pressed()).toEqual([]);
      expect(legend()).toHaveTextContent(TYPED);
      expect(optionsGroup()).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(props.onIntent).not.toHaveBeenCalled();
    });
  }

  it("R5-04 x, 1.6 s, x, 1.6 s, a, Enter locks nothing: pauses between letters that name no option restart nothing", async () => {
    const pause = pausable();
    const { props, user } = render();
    await user.keyboard("x");
    pause(WORD_PAUSE_MS + 100);
    await user.keyboard("x");
    pause(WORD_PAUSE_MS + 100);
    await user.keyboard("a");
    expect(pressed()).toEqual([]);
    expect(legend()).toHaveTextContent(TYPED);
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
  });

  it("R5-04 the cost D38 accepts, pinned: ab, 1.6 s, ba, Enter locks A, since every key chose an option and the pause started the count again", async () => {
    const pause = pausable();
    const { props, user } = render();
    await user.keyboard("ab");
    pause(WORD_PAUSE_MS + 100);
    await user.keyboard("ba");
    expect(pressed()).toEqual([0]);
    expect(legend()).toHaveTextContent(KEYS);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });

  it("R5-04 a slow start doesn't excuse a word: a, 2.5 s, then dad at 250 ms a key trips the rule", async () => {
    const pause = pausable();
    const { props, user } = render();
    await user.keyboard("a");
    pause(2_500);
    for (const key of "dad") {
      await user.keyboard(key);
      pause(250);
    }
    expect(pressed()).toEqual([]);
    expect(legend()).toHaveTextContent(TYPED);
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
  });

  it("R5-04 when a word trips the rule the line says the keys are off, the mark and the bar's name go, and no option keeps the focus ring", async () => {
    const { user } = render();
    await user.keyboard("da");
    expect(option(0)).toHaveFocus();
    expect(pressed()).toEqual([0]);
    await user.keyboard("d");
    expect(MYSTERY_COPY.options.typedLegend).toBe(TYPED);
    expect(legend()).toHaveAttribute("data-keys-legend", "typed");
    expect(legend()).toHaveTextContent(TYPED);
    expect(optionsGroup()).toHaveAccessibleDescription(`${LAST_LEAD} ${TYPED}`);
    for (const button of options()) expect(button).not.toHaveFocus();
    expect(optionsGroup()).toHaveFocus();
    // What was lost shows where it was.
    expect(pressed()).toEqual([]);
    expect(lockIn()).toHaveAccessibleName("Lock in");
    // Later letters of the word leave focus where it is.
    await user.keyboard("bc");
    expect(optionsGroup()).toHaveFocus();
    expect(pressed()).toEqual([]);
  });

  it("R5-04 from the group, Tab reaches option A and ends the word: a key chooses again", async () => {
    const { props, user } = render();
    await user.keyboard("cab");
    expect(optionsGroup()).toHaveFocus();
    await user.tab();
    expect(option(0)).toHaveFocus();
    expect(legend()).toHaveTextContent(KEYS);
    await user.keyboard("c");
    expect(pressed()).toEqual([2]);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 2 },
    ]);
  });
});

function render() {
  const props = atClue4();
  const view = renderWithUser(<MysteryRound {...props} />);
  return { props, ...view };
}
