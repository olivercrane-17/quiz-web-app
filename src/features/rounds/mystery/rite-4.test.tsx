/**
 * The Mystery after RITE round 4 (docs/playtests/rite-4.md §6, §7 and §9;
 * the decisions memo §27, D31 and D32): each test title starts with the
 * finding it reproduces. What needs a real browser (a touch phone's taps,
 * a reload, the legend's line holding its place, a button's own Space) is
 * also measured in e2e/daily/mystery-rite-4.spec.ts.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Activity } from "react";
import type { UserEvent } from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  entityLookupOf,
  loadFixtureList,
} from "@/content/loaders/fixtures/lists";
import { FIXTURE_MYSTERIES } from "@/content/loaders/fixtures/sealed";
import type { EntityLookup } from "@/engine/rounds/types";
import {
  parseItemId,
  type MysteryContent,
  type RoundIntent,
} from "@/engine/types";
import { LIVE_REGION_IDS, clearAnnouncements } from "@/ui/announce";
import { KEYBOARD_LIKELY_QUERY, useKeyLegend } from "@/ui/key-legend";
import { renderWithUser } from "@/test/render";

import { answerListHandleOf, type MysteryAnswerList } from "../answer-list";
import type { RoundComponentProps } from "../contracts";
import { MysteryRound } from ".";
import { MYSTERY_COPY } from "./copy";
import { DOUBLE_TAP_MS, TYPING_MS } from "./options";
import {
  MysteryHarness,
  TEST_SETTINGS,
  mysteryMeta,
  setPointer,
} from "./testing";

let people: MysteryAnswerList;
let peopleLookup: EntityLookup;
let odile: MysteryContent;
let films: MysteryAnswerList;
let filmLookup: EntityLookup;
let film: MysteryContent;

function fixtureMystery(id: string): MysteryContent {
  const parsed = parseItemId(id);
  const found = parsed === null ? undefined : FIXTURE_MYSTERIES.get(parsed);
  if (found === undefined) throw new Error(`no fixture mystery ${id}`);
  return found;
}

beforeAll(async () => {
  const person = await loadFixtureList("person");
  const filmList = await loadFixtureList("film");
  if (person === null || filmList === null) throw new Error("no fixture list");
  people = answerListHandleOf(person.list);
  peopleLookup = entityLookupOf(person);
  odile = fixtureMystery("fx.m.hist.0101");
  films = answerListHandleOf(filmList.list);
  filmLookup = entityLookupOf(filmList);
  film = fixtureMystery("fx.m.film.0101");
});

beforeEach(() => {
  clearAnnouncements();
  // A phone: touch only, and no key pressed yet (D32).
  setPointer("touch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const LAST_LEAD =
  "Last clue. Pick one of four. One pick: a wrong one scores 0.";
const KEYS = "Keys A to D choose. Enter on your choice locks in.";
const TAP = "Tap one, then Lock in.";
const TYPED_LEGEND = "Typing chooses nothing. Press Esc, then A to D.";
const NAMES = ["Odile Marsh", "Liesl Varo", "Ennis Ward", "Mira Tolland"];

const liveText = () =>
  document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";
const optionsGroup = () => screen.getByRole("group", { name: /^Clue 4:/ });
/** The four options, in order. */
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
function atClue4(
  overrides: Partial<RoundComponentProps> = {},
): RoundComponentProps {
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
      itemRef: "daily:46:0",
      settings: TEST_SETTINGS,
    },
    ...overrides,
  };
}

/** Odile Marsh's Mystery, played through the real plugin. */
function play(props: Partial<Parameters<typeof MysteryHarness>[0]> = {}) {
  const onIntent = vi.fn<(intent: RoundIntent) => void>();
  const onContinue = vi.fn();
  const view = renderWithUser(
    <MysteryHarness
      content={odile}
      entities={peopleLookup}
      list={people}
      meta={mysteryMeta({ ordinal: 1, difficulty: "easy" })}
      onIntent={onIntent}
      onContinue={onContinue}
      {...props}
    />,
  );
  return { ...view, onIntent, onContinue };
}

/** Next clue three times by touch: clue 4 opens, and no key has been pressed. */
async function tapToClue4(user: UserEvent) {
  for (let i = 0; i < 3; i += 1) {
    await user.click(screen.getByRole("button", { name: /^(Next|Last) clue/ }));
  }
}

/** Moves `performance.now` on, as a pause between keys would. */
function pausable() {
  const real = performance.now.bind(performance);
  let offset = 0;
  vi.spyOn(performance, "now").mockImplementation(() => real() + offset);
  return (ms = TYPING_MS + 200) => {
    offset += ms;
  };
}

describe("one way to lock in at clue 4 (D31, R4-01)", () => {
  it("R4-01 a tap only chooses: tap A, then B, then Lock in sends one pick, for B", async () => {
    const { user, onIntent } = play();
    await tapToClue4(user);
    // Before a choice the button is there, named plainly, and can't send.
    expect(lockIn()).toHaveAccessibleName("Lock in");
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");
    await user.click(lockIn());
    expect(picks(onIntent)).toEqual([]);

    await user.click(option(0));
    // Still open: nothing sent, no reveal, the stake still on 1.
    expect(picks(onIntent)).toEqual([]);
    expect(document.querySelector("[data-reveal]")).toBeNull();
    expect(
      screen.getByRole("img", { name: "Worth 1 point now" }),
    ).toBeInTheDocument();
    expect(pressed()).toEqual([0]);
    expect(option(0)).toHaveAttribute("data-pressed");
    expect(lockIn()).toHaveAccessibleName("Lock in Odile Marsh");
    expect(lockIn()).not.toHaveAttribute("aria-disabled");
    expect(liveText()).toBe("Odile Marsh chosen.");

    await user.click(option(1));
    expect(pressed()).toEqual([1]);
    expect(option(0)).not.toHaveAttribute("data-pressed");
    expect(picks(onIntent)).toEqual([]);
    expect(lockIn()).toHaveAccessibleName("Lock in Liesl Varo");
    expect(liveText()).toBe("Liesl Varo chosen.");

    await user.click(lockIn());
    expect(picks(onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
    // The reveal is for B, a wrong pick here.
    const reveal = document.querySelector<HTMLElement>("[data-reveal]");
    expect(reveal).not.toBeNull();
    expect(
      within(reveal as HTMLElement).getByText("You picked Liesl Varo"),
    ).toBeInTheDocument();
  });

  it("R4-01 two taps on the same option inside 300 ms send nothing: the one pick comes from the button", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    // A double tap, with no time between its clicks.
    await user.dblClick(option(2));
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([2]);
    await user.click(lockIn());
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 2 },
    ]);
    // And one only, however often the button is pressed while it is out.
    await user.dblClick(lockIn());
    expect(picks(props.onIntent)).toHaveLength(1);
  });

  it("R4-01 a second tap on the spot that chose, landing on the Lock in button inside DOUBLE_TAP_MS, sends nothing; a tap elsewhere, or later, does", async () => {
    const pause = pausable();
    const props = atClue4();
    render(<MysteryRound {...props} />);
    const at = { detail: 1, clientX: 180, clientY: 535 };
    // The first tap chooses; the bar is under the finger for the second.
    fireEvent.click(option(1), at);
    expect(pressed()).toEqual([1]);
    fireEvent.click(lockIn(), at);
    fireEvent.click(lockIn(), { ...at, clientY: 545 });
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([1]);
    // The same spot once a double tap is over is a press of the button.
    pause(DOUBLE_TAP_MS + 1);
    fireEvent.click(lockIn(), at);
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  it("R4-01 a tap on an option, then one on the button a thumb's move away, locks in at once; so does Enter or Space on the button", async () => {
    for (const press of [
      () =>
        fireEvent.click(lockIn(), { detail: 1, clientX: 180, clientY: 600 }),
      () =>
        fireEvent.click(lockIn(), { detail: 0, clientX: 180, clientY: 535 }),
    ]) {
      const props = atClue4();
      const view = render(<MysteryRound {...props} />);
      fireEvent.click(option(1), { detail: 1, clientX: 180, clientY: 535 });
      press();
      expect(picks(props.onIntent)).toHaveLength(1);
      view.unmount();
    }
  });

  it("R4-01 the Lock in label keeps to one line, cut short if need be, and the whole name is still the button's", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    const label = () => lockIn().querySelector("span");
    expect(label()).toHaveClass("truncate", "min-w-0");
    await user.click(option(0));
    expect(label()).toHaveClass("truncate", "min-w-0");
    expect(label()).toHaveTextContent("Lock in Odile Marsh");
    expect(lockIn()).toHaveAccessibleName("Lock in Odile Marsh");
  });

  it("R4-01 the options and the bar share a box of their own, after the lead line and the legend", () => {
    render(<MysteryRound {...atClue4()} />);
    const box = document.querySelector("[data-options-box]");
    expect(box).not.toBeNull();
    expect(box).toContainElement(option(0));
    expect(box).toContainElement(lockIn());
    expect(box).not.toContainElement(
      document.querySelector<HTMLElement>("[data-options-lead]"),
    );
    expect(box).not.toContainElement(legend() as HTMLElement);
  });

  it("a click chooses and is told the choice alone, with a keyboard in use too: only a key's choice hears Enter locks it in", async () => {
    setPointer("mouse");
    const props = atClue4();
    render(<MysteryRound {...props} />);
    expect(legend()).toHaveTextContent(new RegExp(`^${KEYS}$`));
    // A bare click, as a screen reader sends for Enter: no keydown.
    fireEvent.click(option(1));
    expect(liveText()).toBe("Liesl Varo chosen.");
    fireEvent.click(option(1));
    expect(liveText()).toBe("Liesl Varo chosen.");
    expect(props.onIntent).not.toHaveBeenCalled();
    fireEvent.keyDown(option(1), { key: "Enter" });
    expect(picks(props.onIntent)).toHaveLength(1);
  });

  it("R4-01 Lena's path: the c key, then a tap on A; A is pressed, C isn't, nothing is sent, and Lock in sends A", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    expect(optionsGroup()).toHaveFocus();
    await user.keyboard("c");
    expect(pressed()).toEqual([2]);
    await user.click(option(0));
    expect(pressed()).toEqual([0]);
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(document.querySelector("[data-reveal]")).toBeNull();
    // The tap took focus with it, so a keyboard's Enter is for A too.
    expect(option(0)).toHaveFocus();
    await user.click(lockIn());
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });

  it("R4-01 Sam's path: a, Tab, Enter doesn't send the option Tab reached; it becomes the chosen one, and Enter again sends it", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("a");
    expect(pressed()).toEqual([0]);
    await user.tab();
    // Tab moves focus and leaves the mark where it is.
    expect(option(1)).toHaveFocus();
    expect(pressed()).toEqual([0]);
    expect(lockIn()).toHaveAccessibleName("Lock in Odile Marsh");
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([1]);
    expect(liveText()).toBe("Liesl Varo chosen. Enter locks it in.");
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  it("R4-01 a, Tab back to A's own button, Enter: the Tab-focused option is the chosen one, so Enter sends it", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("b");
    await user.tab();
    await user.tab({ shift: true });
    expect(option(1)).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  it("R4-01 the Lock in button comes after the options for Tab and a screen reader, inside their group, and Enter on it sends the choice", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    const all = within(optionsGroup()).getAllByRole("button");
    expect(all).toHaveLength(5);
    expect(all[4]).toBe(lockIn());
    // Disabled, it still takes focus, so it can be found and read.
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(lockIn()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    // The option keys are the options' own: on the button they do nothing.
    await user.keyboard("c");
    expect(pressed()).toEqual([]);
    await user.click(option(3));
    lockIn().focus();
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 3 },
    ]);
  });

  it("R4-01 Space and a click choose and never send; an already-guessed option can't be chosen", async () => {
    const props = atClue4();
    props.open = {
      ...(props.open as Extract<RoundComponentProps["open"], { clue: number }>),
      options: NAMES.map((label, index) => ({
        index,
        label,
        alreadyGuessed: index === 1,
      })),
    };
    const { user } = renderWithUser(<MysteryRound {...props} />);
    option(0).focus();
    await user.keyboard(" ");
    expect(pressed()).toEqual([0]);
    await user.keyboard(" ");
    expect(pressed()).toEqual([0]);
    expect(props.onIntent).not.toHaveBeenCalled();
    // B was guessed already: a tap, Enter, Space and its letter leave A chosen.
    await user.click(option(1));
    option(1).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(pressed()).toEqual([0]);
    expect(lockIn()).toHaveAccessibleName("Lock in Odile Marsh");
    expect(props.onIntent).not.toHaveBeenCalled();
  });

  it("R4-01 while the pick is judged the options wait and the button is busy; offline, it can't send", async () => {
    const props = atClue4();
    const { user, rerender } = renderWithUser(<MysteryRound {...props} />);
    await user.click(option(2));
    await user.click(lockIn());
    rerender(<MysteryRound {...props} status="judging" />);
    expect(option(2)).toHaveAttribute("data-state", "locked");
    expect(lockIn()).toHaveAttribute("aria-busy", "true");
    expect(lockIn()).toHaveAccessibleName(/^Lock in Ennis Ward/);
    rerender(<MysteryRound {...props} status="offline" />);
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");
    await user.click(lockIn());
    expect(picks(props.onIntent)).toHaveLength(1);
  });
});

describe("the line above the options says what is true for the device (D32, R4-01, R4-03)", () => {
  it("R4-01 on a touch phone with no key pressed the line reads Tap one, then Lock in., with no Keys in sight", async () => {
    const { user } = play();
    await tapToClue4(user);
    expect(legend()).toHaveTextContent(new RegExp(`^${TAP}$`));
    expect(legend()).toHaveAttribute("data-keys-legend", "tap");
    expect(optionsGroup()).toHaveAccessibleDescription(`${LAST_LEAD} ${TAP}`);
    // What shows: every text node outside the line's unseen reserve.
    const shown = [...optionsGroup().querySelectorAll("p, span, button")]
      .filter(
        (node) =>
          node.children.length === 0 &&
          node.closest('[aria-hidden="true"], .invisible') === null,
      )
      .map((node) => node.textContent)
      .join(" ");
    expect(shown).not.toMatch(/Keys/);
    expect(MYSTERY_COPY.options.tapLegend).toBe(TAP);
    // A tap chooses, and what is said doesn't speak of Enter.
    await user.click(option(0));
    expect(liveText()).toBe("Odile Marsh chosen.");
    expect(legend()).toHaveTextContent(new RegExp(`^${TAP}$`));
  });

  it("R4-01 after a keydown anywhere in the round the line reads Keys A to D choose. Enter on your choice locks in., in the same line", async () => {
    const { user } = play();
    await tapToClue4(user);
    const line = legend()?.parentElement;
    expect(line).not.toBeNull();
    // The line's one cell holds room for another wording, drawn by CSS
    // from an attribute and so in no text. On a phone with no keyboard in
    // sight that is the typed-word line's only: the keys' legend, the
    // longest, would leave a blank line at 200% text (R5-05, after review).
    const reserve = () => line?.querySelector('[aria-hidden="true"]');
    expect(reserve()).toHaveAttribute(
      "data-reserve",
      MYSTERY_COPY.options.typedLegend,
    );
    expect(reserve()).toBeEmptyDOMElement();
    expect(reserve()).toHaveClass(
      "invisible",
      "after:content-[attr(data-reserve)]",
    );
    expect(document.body.textContent).not.toContain(KEYS);
    for (const part of [legend(), reserve()]) {
      expect(part).toHaveClass("col-start-1", "row-start-1");
    }
    // A key on the round's heading: it does nothing there but count.
    const heading = screen.getByRole("heading", { level: 1 });
    act(() => {
      heading.focus();
    });
    await user.keyboard("{Shift}");
    expect(legend()).toHaveTextContent(new RegExp(`^${KEYS}$`));
    expect(legend()).toHaveAttribute("data-keys-legend", "keys");
    expect(legend()?.parentElement).toBe(line);
    expect(reserve()).toHaveAttribute("data-reserve", TAP);
    expect(document.body.textContent).not.toContain(TAP);
    expect(optionsGroup()).toHaveAccessibleDescription(`${LAST_LEAD} ${KEYS}`);
    expect(pressed()).toEqual([]);
  });

  it("R4-03 a key typed into the guess field is an on-screen keyboard's too, so it doesn't count; a mouse does, from the start", async () => {
    const first = play();
    await first.user.click(
      screen.getByRole("combobox", { name: "Your guess" }),
    );
    await first.user.keyboard("zz");
    await tapToClue4(first.user);
    expect(legend()).toHaveTextContent(new RegExp(`^${TAP}$`));
    first.unmount();

    setPointer("mouse");
    const second = play();
    await tapToClue4(second.user);
    expect(legend()).toHaveTextContent(new RegExp(`^${KEYS}$`));
  });

  it("R4-03 the legend is in the page once: the line the group is described by", async () => {
    setPointer("mouse");
    const { user } = play();
    await tapToClue4(user);
    const holders = [...document.querySelectorAll("p, span")].filter(
      (node) => node.children.length === 0 && node.textContent === KEYS,
    );
    expect(holders).toEqual([legend()]);
    expect(optionsGroup().getAttribute("aria-describedby")).toContain(
      legend()?.parentElement?.id ?? "no id",
    );
  });

  it("R4-01 the first key of all, a letter on the group, is told how a keyboard locks in", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    expect(legend()).toHaveTextContent(new RegExp(`^${TAP}$`));
    await user.keyboard("d");
    expect(liveText()).toBe("Mira Tolland chosen. Enter locks it in.");
    expect(legend()).toHaveTextContent(new RegExp(`^${KEYS}$`));
  });
});

/** What the practice round's legend reads (`@/ui/key-legend`). */
function PracticeLegend() {
  return <p data-testid="practice-legend">{String(useKeyLegend())}</p>;
}

describe("one signal for every key legend (D32)", () => {
  it("D32 clue 4's legend and the practice legend's rule turn together: not for a shortcut, then for a first key", async () => {
    const { user } = renderWithUser(
      <>
        <MysteryRound {...atClue4()} />
        <PracticeLegend />
      </>,
    );
    const practice = () => screen.getByTestId("practice-legend").textContent;
    expect(practice()).toBe("false");
    expect(legend()).toHaveAttribute("data-keys-legend", "tap");
    // A browser shortcut is not a keyboard answering: neither legend turns.
    act(() => {
      optionsGroup().focus();
    });
    await user.keyboard("{Control>}l{/Control}");
    expect(practice()).toBe("false");
    expect(legend()).toHaveAttribute("data-keys-legend", "tap");
    await user.keyboard("{Shift}");
    expect(practice()).toBe("true");
    expect(legend()).toHaveAttribute("data-keys-legend", "keys");
  });

  it("D32 a mouse or a trackpad is asked for in one place, with the rule's own query", async () => {
    const asked: string[] = [];
    setPointer("mouse");
    const answer = window.matchMedia;
    window.matchMedia = ((query: string) => {
      asked.push(query);
      return answer(query);
    }) as typeof window.matchMedia;
    render(<MysteryRound {...atClue4()} />);
    expect(legend()).toHaveAttribute("data-keys-legend", "keys");
    expect(asked.filter((query) => query.includes("hover"))).not.toEqual([]);
    expect(
      asked
        .filter((query) => query.includes("hover"))
        .every((query) => query === KEYBOARD_LIKELY_QUERY),
    ).toBe(true);
  });
});

describe("clue 4's keyboard edges (R4-11)", () => {
  for (const word of [
    "abba",
    "dada",
    "Abba",
    "Dada",
    "cab",
    "bad",
    "abcd",
    // A doubled letter is two keys of the word (D31).
    "add",
    "Add",
    "baa",
    "abb",
    "aab",
    "ccd",
    "aaa",
  ]) {
    it(`R4-11 ${word} then Enter, a word made of option letters alone, locks nothing and leaves no option pressed`, async () => {
      const props = atClue4();
      const { user } = renderWithUser(<MysteryRound {...props} />);
      expect(optionsGroup()).toHaveFocus();
      await user.keyboard(`${word}{Enter}`);
      expect(props.onIntent).not.toHaveBeenCalled();
      expect(pressed()).toEqual([]);
      expect(document.querySelector("[data-chosen]")).toBeNull();
      expect(lockIn()).toHaveAccessibleName("Lock in");
      // No stale "chosen" line stays behind in the status region.
      expect(liveText()).not.toMatch(/chosen/);
    });
  }

  it("R4-11 abba at 80 ms a key, then Enter, locks nothing", async () => {
    const pause = pausable();
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    for (const key of "abba") {
      await user.keyboard(key);
      pause(80);
    }
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([]);
  });

  it("R4-11 Abba, a 2 s pause, then Enter still locks nothing: Enter after a typed word is the word's end", async () => {
    const pause = pausable();
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("Abba");
    pause(2_000);
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([]);
    // A key a beat after that is the word's too. Escape ends the word:
    // then a key chooses again, and Enter locks it in.
    pause();
    await user.keyboard("a{Enter}");
    expect(pressed()).toEqual([]);
    expect(props.onIntent).not.toHaveBeenCalled();
    await user.keyboard("{Escape}a");
    expect(pressed()).toEqual([0]);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });

  it("R4-11 a, a 1 s wait, b, Enter is a change of mind: one pick, for B", async () => {
    const pause = pausable();
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("a");
    pause(1_000);
    await user.keyboard("b{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  // Integration 9: the verifier's desk runs. A word is a word at any ordinary
  // pace (D38 restarts the count only after 1.5 s without a key).
  for (const word of [
    "abba",
    "Abba",
    "Add",
    "Mira Tolland",
    "Arvenna",
    "Ada",
  ]) {
    it(`R4-11 ${word} at 900 ms a key, then Enter, locks nothing and never says an option is chosen for Enter to lock`, async () => {
      const pause = pausable();
      const props = atClue4();
      const { user } = renderWithUser(<MysteryRound {...props} />);
      expect(optionsGroup()).toHaveFocus();
      const keys = [...word];
      for (const [at, key] of keys.entries()) {
        pause(900);
        await user.keyboard(key === " " ? "[Space]" : key);
        // From the third key on, nothing is marked and nothing says
        // "Enter locks it in".
        if (at >= 2) {
          expect(pressed()).toEqual([]);
          expect(liveText()).not.toMatch(/chosen/);
        }
      }
      pause(900);
      await user.keyboard("{Enter}");
      expect(props.onIntent).not.toHaveBeenCalled();
      expect(pressed()).toEqual([]);
      expect(lockIn()).toHaveAccessibleName("Lock in");
      expect(liveText()).toBe(TYPED_LEGEND);
    });
  }

  for (const word of ["arvenna", "Arvenna", "Ada", "Abba", "Mira Tolland"]) {
    it(`R4-11 ${word} at 120 ms a key with a 1 s pause before the last letter, then Enter, locks nothing`, async () => {
      const pause = pausable();
      const props = atClue4();
      const { user } = renderWithUser(<MysteryRound {...props} />);
      const keys = [...word];
      for (const [at, key] of keys.entries()) {
        pause(at === keys.length - 1 ? 1_000 : 120);
        await user.keyboard(key === " " ? "[Space]" : key);
      }
      expect(pressed()).toEqual([]);
      expect(liveText()).not.toMatch(/chosen/);
      pause(120);
      await user.keyboard("{Enter}");
      expect(props.onIntent).not.toHaveBeenCalled();
      expect(pressed()).toEqual([]);
    });
  }

  it("R4-11 after a typed word the legend says the keys are off and how to get them back; Escape, Tab and a pointer each do", async () => {
    setPointer("mouse");
    const pause = pausable();
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    expect(legend()).toHaveTextContent(KEYS);
    await user.keyboard("ab");
    expect(legend()).toHaveTextContent(KEYS);
    await user.keyboard("c");
    expect(legend()).toHaveAttribute("data-keys-legend", "typed");
    expect(legend()).toHaveTextContent(TYPED_LEGEND);
    expect(optionsGroup()).toHaveAccessibleDescription(
      `${LAST_LEAD} ${TYPED_LEGEND}`,
    );
    expect(liveText()).toBe(TYPED_LEGEND);
    // The line holds room for every wording, so nothing moves under it.
    expect(
      [...document.querySelectorAll("[data-reserve]")].map((node) =>
        node.getAttribute("data-reserve"),
      ),
    ).toEqual([TAP, KEYS]);
    // Escape: the keys choose again, and the hint is taken back.
    await user.keyboard("{Escape}");
    expect(legend()).toHaveTextContent(KEYS);
    expect(liveText()).toBe("");
    pause();
    await user.keyboard("d");
    expect(pressed()).toEqual([3]);
    // Tab to another option ends a word too, and leaves the mark (D31).
    await user.keyboard("{Escape}");
    await user.keyboard("abc");
    expect(legend()).toHaveTextContent(TYPED_LEGEND);
    await user.tab();
    expect(legend()).toHaveTextContent(KEYS);
    await user.keyboard("a");
    expect(pressed()).toEqual([0]);
    // And a click on an option chooses it, wherever focus already was.
    await user.keyboard("bc");
    expect(legend()).toHaveTextContent(TYPED_LEGEND);
    // Focus is back on the group (D38, R5-04), not on the last letter's option.
    expect(optionsGroup()).toHaveFocus();
    await user.click(option(2));
    expect(legend()).toHaveTextContent(KEYS);
    expect(pressed()).toEqual([2]);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 2 },
    ]);
  });

  it("R4-11 one stray key is no word: x, a pause, b, Enter locks B", async () => {
    const pause = pausable();
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("x");
    pause();
    await user.keyboard("b{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  it("R4-11 a then b straight on, then Enter, is a change of mind too: two keys are not a word", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("ab{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  it("R4-11 the same letter twice no longer locks in; it stays chosen, and Enter then locks it in", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("aa");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([0]);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });

  it("R4-11 a third press of the letter is a typed word, at once or after a pause: the mark clears and Enter sends nothing; after Escape the letter chooses again", async () => {
    const pause = pausable();
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("cc");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([2]);
    await user.keyboard("c");
    expect(pressed()).toEqual([]);
    expect(liveText()).not.toMatch(/chosen/);
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    // A pause doesn't end the word.
    pause();
    await user.keyboard("c");
    expect(pressed()).toEqual([]);
    // After Escape, three presses with a pause between them are a word
    // again: a slow typist's "ccc" is the same keys (integration 9).
    await user.keyboard("{Escape}c");
    expect(pressed()).toEqual([2]);
    pause();
    await user.keyboard("c");
    expect(pressed()).toEqual([2]);
    pause();
    await user.keyboard("c");
    expect(pressed()).toEqual([]);
    await user.keyboard("{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    await user.keyboard("{Escape}c");
    expect(pressed()).toEqual([2]);
    // A held key is one press.
    fireEvent.keyDown(option(2), { key: "c", repeat: true });
    fireEvent.keyDown(option(2), { key: "Enter", repeat: true });
    expect(props.onIntent).not.toHaveBeenCalled();
  });

  it("R4-11 a letter key announces the choice, as Space does, whether or not focus moves", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    // From the group: focus moves to C.
    await user.keyboard("c");
    expect(option(2)).toHaveFocus();
    expect(liveText()).toBe("Ennis Ward chosen. Enter locks it in.");
    // On C itself: focus stays.
    clearAnnouncements();
    await user.keyboard("{Escape}");
    await user.keyboard("c");
    expect(liveText()).toBe("Ennis Ward chosen. Enter locks it in.");
  });

  it("R4-11 after aldessa then Enter, a rejected burst, the status region holds no chosen line", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.keyboard("a");
    expect(liveText()).toBe("Odile Marsh chosen. Enter locks it in.");
    await user.keyboard("ldessa{Enter}");
    // The word's own line took its place.
    expect(liveText()).toBe(TYPED_LEGEND);
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(pressed()).toEqual([]);
  });

  it("R4-11 a round a reload brings back at clue 4 focuses the options group, not the heading, and A then Enter works with no Tab", async () => {
    const props = atClue4();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    const group = optionsGroup();
    expect(document.activeElement).toBe(group);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
    // The run's arrival focus ("round_heading") lands on the group too, so
    // the screen that runs the round can't move it back to the heading.
    for (const target of ["round_heading", "clue_heading"]) {
      const found = document.querySelectorAll(
        `[data-focus-target~="${target}"]`,
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(group);
    }
    await user.keyboard("a");
    expect(pressed()).toEqual([0]);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });

  it("R4-11 a round that reaches clue 4 in play hands the arrival target from its heading to the group, which is the clue's too (Leave, then Continue)", async () => {
    const { user } = play();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveFocus();
    expect(document.querySelector('[data-focus-target~="round_heading"]')).toBe(
      heading,
    );
    await tapToClue4(user);
    expect(optionsGroup()).toHaveFocus();
    for (const target of ["round_heading", "clue_heading"]) {
      const found = document.querySelectorAll(
        `[data-focus-target~="${target}"]`,
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(optionsGroup());
    }
  });
});

describe("clue 4 after Leave, then Continue (R4-11, integration 9)", () => {
  /** The round inside the route Next keeps while another shows. */
  function Kept({
    shown,
    props,
  }: {
    shown: boolean;
    props: RoundComponentProps;
  }) {
    return (
      <Activity mode={shown ? "visible" : "hidden"}>
        <MysteryRound {...props} />
      </Activity>
    );
  }

  it("R4-11 a round shown again with its options drawn focuses the group, not the heading, and A then Enter with no Tab locks A", async () => {
    // Reached in play, so the round mounted on clue 1 with its heading
    // focused: the case a reload doesn't cover.
    const onIntent = vi.fn<(intent: RoundIntent) => void>();
    const harness = (shown: boolean) => (
      <Activity mode={shown ? "visible" : "hidden"}>
        <MysteryHarness
          content={odile}
          entities={peopleLookup}
          list={people}
          meta={mysteryMeta({ ordinal: 1, difficulty: "easy" })}
          onIntent={onIntent}
          onContinue={vi.fn()}
        />
      </Activity>
    );
    const { user, rerender } = renderWithUser(harness(true));
    await tapToClue4(user);
    rerender(harness(false));
    act(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    rerender(harness(true));
    expect(optionsGroup()).toHaveFocus();
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
    await user.keyboard("a");
    expect(pressed()).toEqual([0]);
    await user.keyboard("{Enter}");
    expect(picks(onIntent)).toHaveLength(1);
  });

  it("R4-11 an option chosen before leaving is not chosen on return, as after a reload: Lock in is plain and disabled, and Enter sends nothing", async () => {
    const props = atClue4();
    const { user, rerender } = renderWithUser(<Kept shown props={props} />);
    await user.keyboard("b");
    expect(pressed()).toEqual([1]);
    expect(lockIn()).toHaveAccessibleName("Lock in Liesl Varo");
    rerender(<Kept shown={false} props={props} />);
    // The chosen line doesn't outlive the screen it was said on.
    expect(liveText()).toBe("");
    rerender(<Kept shown props={props} />);
    expect(optionsGroup()).toHaveFocus();
    expect(pressed()).toEqual([]);
    expect(document.querySelector("[data-chosen]")).toBeNull();
    expect(lockIn()).toHaveAccessibleName("Lock in");
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter}");
    await user.click(lockIn());
    expect(props.onIntent).not.toHaveBeenCalled();
  });

  it("R4-11 a typed word doesn't outlive the visit either: the legend is the keys' again and A then Enter locks A", async () => {
    setPointer("mouse");
    const props = atClue4();
    const { user, rerender } = renderWithUser(<Kept shown props={props} />);
    await user.keyboard("abc");
    expect(legend()).toHaveTextContent(TYPED_LEGEND);
    rerender(<Kept shown={false} props={props} />);
    rerender(<Kept shown props={props} />);
    expect(legend()).toHaveTextContent(KEYS);
    await user.keyboard("a{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });
});

describe("Enter on a reveal (R4-14)", () => {
  /** Solves on clue 1, so the reveal shows. */
  async function solve(user: UserEvent) {
    await user.type(
      screen.getByRole("combobox", { name: "Your guess" }),
      "Odile",
    );
    await user.click(screen.getByRole("option", { name: /^Odile Marsh/ }));
    await user.click(screen.getByRole("button", { name: "Guess" }));
  }

  it("R4-14 with a keyboard in use the reveal shows Enter continues. under its button, and the answer heading says so", async () => {
    setPointer("mouse");
    const { user, onContinue } = play();
    await solve(user);
    const heading = screen.getByRole("heading", { level: 1 });
    // Focus stays on the answer (AC-DLY-18), which now tells what Enter does.
    expect(heading).toHaveFocus();
    expect(heading).toHaveAccessibleDescription("Enter continues.");
    const hint = document.querySelector("[data-enter-hint]");
    expect(hint).toHaveTextContent(/^Enter continues\.$/);
    const next = screen.getByRole("button", { name: /Next mystery/ });
    expect(
      next.compareDocumentPosition(hint as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("R4-14 on a touch phone with no key pressed the reveal shows no key hint; a first key brings it", async () => {
    const { user } = play();
    await solve(user);
    // Typing in the guess field was an on-screen keyboard's doing.
    expect(document.querySelector("[data-enter-hint]")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).not.toHaveAccessibleDescription();
    await user.keyboard("{Tab}");
    expect(document.querySelector("[data-enter-hint]")).toHaveTextContent(
      "Enter continues.",
    );
  });
});

describe("a suggestion's accessible name (R4-17)", () => {
  it("R4-17 a film row is named The Broken Lighthouse, 1972, with no space before the comma", async () => {
    const { user } = play({
      content: film,
      entities: filmLookup,
      list: films,
      meta: mysteryMeta({ answerType: "film", category: "film", ordinal: 1 }),
    });
    await user.type(
      screen.getByRole("combobox", { name: "Your guess" }),
      "broken",
    );
    const row = screen.getByRole("option", { name: /^The Broken Lighthouse/ });
    expect(row).toHaveAccessibleName("The Broken Lighthouse, 1972");
    for (const each of screen.getAllByRole("option")) {
      const name = each.getAttribute("aria-label") ?? "";
      expect(name).toMatch(/\S, \d{4}$/);
      expect(name).not.toMatch(/\s,/);
    }
  });

  it("R4-17 a guessed row and a similar spelling are named the same way: name, then what marks it", async () => {
    const { user } = play();
    const field = screen.getByRole("combobox", { name: "Your guess" });
    await user.type(field, "Corin");
    await user.click(screen.getByRole("option", { name: /^Corin Ashby/ }));
    await user.click(screen.getByRole("button", { name: "Guess" }));
    await user.type(field, "Corin");
    expect(
      screen.getByRole("option", { name: /^Corin Ashby/ }),
    ).toHaveAccessibleName("Corin Ashby, Already guessed");
    await user.clear(field);
    await user.type(field, "Odille Marsh");
    const typo = screen
      .getAllByRole("option")
      .find((row) => row.hasAttribute("data-typo"));
    expect(typo).toBeDefined();
    expect(typo?.getAttribute("aria-label")).toMatch(
      /^Odile Marsh(, [^,]+)?, Similar spelling$/,
    );
  });
});
