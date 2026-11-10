/**
 * The Mystery after RITE round 4 (docs/playtests/rite-4.md §6, §7 and §9;
 * the decisions memo §27, D31 and D32): each test title starts with the
 * finding it reproduces. What needs a real browser (a touch phone's taps,
 * a reload, the legend's line holding its place, a button's own Space) is
 * also measured in e2e/daily/mystery-rite-4.spec.ts.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
const KEYS = "Keys A to D choose. Enter locks in.";
const TAP = "Tap one, then Lock in.";
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

  it("R4-01 after a keydown anywhere in the round the line reads Keys A to D choose. Enter locks in., in the same line, which held room for it", async () => {
    const { user } = play();
    await tapToClue4(user);
    const line = legend()?.parentElement;
    expect(line).not.toBeNull();
    // The line's one cell holds room for the other wording, drawn by CSS
    // from an attribute and so in no text, and is as tall as either.
    const reserve = () => line?.querySelector('[aria-hidden="true"]');
    expect(reserve()).toHaveAttribute("data-reserve", KEYS);
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
    // A key on its own, a beat after that, chooses again, and Enter locks it in.
    pause();
    await user.keyboard("a");
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

  it("R4-11 a third press of the letter inside TYPING_MS is a typed word: the mark clears and Enter sends nothing; after a pause the letter chooses again", async () => {
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
    // Three presses with a pause between them are three choices, not a word.
    pause();
    await user.keyboard("c");
    pause();
    await user.keyboard("c");
    pause();
    await user.keyboard("c");
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
    expect(liveText()).toBe("");
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
    const arrival = document.querySelectorAll(
      '[data-focus-target="round_heading"]',
    );
    expect(arrival).toHaveLength(1);
    expect(arrival[0]).toBe(group);
    expect(
      document.querySelector('[data-focus-target="clue_heading"]'),
    ).toBeNull();
    await user.keyboard("a");
    expect(pressed()).toEqual([0]);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });

  it("R4-11 a round that reaches clue 4 in play keeps its heading as the arrival target and the group as the clue's", async () => {
    const { user } = play();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    await tapToClue4(user);
    expect(optionsGroup()).toHaveFocus();
    expect(document.querySelector('[data-focus-target="round_heading"]')).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
    expect(document.querySelector('[data-focus-target="clue_heading"]')).toBe(
      optionsGroup(),
    );
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
