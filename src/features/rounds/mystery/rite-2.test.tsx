/**
 * The Mystery after RITE round 2 (docs/playtests/rite-2.md §5, §6; the
 * decisions memo §22): each test title starts with the finding it
 * reproduces. The real layout of R2-17 is measured in a browser, in
 * e2e/daily/mystery-rite-2.spec.ts.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { clearAnnouncements, LIVE_REGION_IDS } from "@/ui/announce";
import { renderWithUser } from "@/test/render";

import { answerListHandleOf, type MysteryAnswerList } from "../answer-list";
import type { RoundComponentProps } from "../contracts";
import { MysteryRound } from ".";
import { MYSTERY_COPY } from "./copy";
import { TYPING_MS } from "./options";
import { MysteryHarness, TEST_SETTINGS, mysteryMeta } from "./testing";

let people: MysteryAnswerList;
let peopleLookup: EntityLookup;
let odile: MysteryContent;
let countries: MysteryAnswerList;
let countryLookup: EntityLookup;
let valdoria: MysteryContent;

function fixtureMystery(id: string): MysteryContent {
  const parsed = parseItemId(id);
  const found = parsed === null ? undefined : FIXTURE_MYSTERIES.get(parsed);
  if (found === undefined) throw new Error(`no fixture mystery ${id}`);
  return found;
}

beforeAll(async () => {
  const person = await loadFixtureList("person");
  const country = await loadFixtureList("country");
  if (person === null || country === null) throw new Error("no fixture list");
  people = answerListHandleOf(person.list);
  peopleLookup = entityLookupOf(person);
  countries = answerListHandleOf(country.list);
  countryLookup = entityLookupOf(country);
  // Daily #46: Mystery 1 a person (Odile Marsh), Mystery 2 a country (Valdoria).
  odile = fixtureMystery("fx.m.hist.0101");
  valdoria = fixtureMystery("fx.m.geo.0102");
});

beforeEach(() => {
  clearAnnouncements();
});

const liveText = () =>
  document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";
const field = () => screen.getByRole("combobox", { name: "Your guess" });
const guessButton = () => screen.getByRole("button", { name: "Guess" });
const LAST_LEAD =
  "Last clue. Pick one of four. One pick: a wrong one scores 0.";
/** Clue 4's options group: labelled by the clue and described by its line (D28). */
const optionsGroup = () =>
  screen.getByRole("group", {
    name: /^Clue 4:/,
    description: (text: string) => text.startsWith(LAST_LEAD),
  });
const LEGEND = "Keys A to D choose. Enter locks in.";

/** A Mystery on clue `clue` with the four options showing, rendered from props. */
function withOptions(
  overrides: Partial<RoundComponentProps> & { clue?: 3 | 4 | 2 } = {},
): RoundComponentProps {
  const { clue = 4, ...rest } = overrides;
  return {
    meta: mysteryMeta({ ordinal: 1 }),
    open: {
      family: "mystery",
      index: 0,
      clue,
      clues: odile.clues.slice(0, clue),
      wrongGuesses: [],
      options: ["Odile Marsh", "Liesl Varo", "Ennis Ward", "Mira Tolland"].map(
        (label, index) => ({ index, label, alreadyGuessed: false }),
      ),
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
    ...rest,
  };
}

const optionButtons = () => within(optionsGroup()).getAllByRole("button");
const option = (position: number) => {
  const button = optionButtons()[position];
  if (button === undefined) throw new Error(`no option ${String(position)}`);
  return button;
};
const chosenItem = () => document.querySelector("[data-chosen]");
/** Moves focus as a script would, letting the round's focus handlers settle. */
function focus(element: HTMLElement) {
  act(() => {
    element.focus();
  });
}
const legend = () => document.querySelector("[data-keys-legend]");

/** A visual viewport the tests can shrink, as an on-screen keyboard does. */
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

/** Focuses the guess field, then opens a keyboard over all but 340 px. */
async function withKeyboardOpen(user: UserEvent) {
  const viewport = new FakeViewport();
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("scrollBy", vi.fn());
  await user.click(field());
  act(() => {
    viewport.height = 340;
    viewport.dispatchEvent(new Event("resize"));
  });
  await waitFor(() => {
    expect(document.querySelector('[data-round="mystery"]')).toHaveAttribute(
      "data-keyboard",
      "open",
    );
  });
}

function picks(onIntent: RoundComponentProps["onIntent"]) {
  return vi
    .mocked(onIntent)
    .mock.calls.map(([intent]) => intent)
    .filter((intent) => intent.family === "mystery" && intent.kind === "pick");
}

describe("the clue-4 keys (D20, R2-02)", () => {
  it("R2-02 a key on the heading or the page sends no pick and chooses nothing", async () => {
    const props = withOptions();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    // The round arrives on its heading, where Sam's "c" spent a question.
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    await user.keyboard("c");
    // The clue's own heading, where focus lands as the options arrive.
    focus(screen.getByRole("heading", { level: 2 }));
    await user.keyboard("c{Enter}3");
    // The page.
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    expect(document.body).toHaveFocus();
    await user.keyboard("c{Enter}");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(chosenItem()).toBeNull();
    for (const button of optionButtons()) {
      expect(button).toHaveAttribute("data-state", "idle");
      expect(button).not.toHaveFocus();
    }
  });

  it("R2-02 Dee's repro: typing a name once the options show sends nothing", async () => {
    // Guess wrong until the options show: focus lands on the last clue.
    const onIntent = vi.fn<(intent: RoundIntent) => void>();
    const { user } = renderWithUser(
      <MysteryHarness
        content={odile}
        entities={peopleLookup}
        list={people}
        meta={mysteryMeta({ ordinal: 1 })}
        onIntent={onIntent}
      />,
    );
    for (const [typed, name] of [
      ["Corin", "Corin Ashby"],
      ["Thea", "Thea Morrow"],
      ["Bram", "Bram Quill"],
    ] as const) {
      await user.clear(field());
      await user.type(field(), typed);
      await user.click(screen.getByRole("option", { name: new RegExp(name) }));
      await user.click(guessButton());
    }
    expect(optionsGroup()).toBeVisible();
    // Focus is on the options group (D28), where a typed name still commits nothing.
    expect(optionsGroup()).toHaveFocus();
    onIntent.mockClear();
    // "Cartographer": its "c" locked in option C on the first letter.
    await user.keyboard("Cartographer");
    expect(onIntent).not.toHaveBeenCalled();
    expect(document.querySelector("[data-reveal]")).toBeNull();
    expect(
      screen.getByRole("img", { name: "Worth 1 point now" }),
    ).toBeInTheDocument();
  });

  it("R2-02 from option A, c moves focus to C and marks it, sending nothing; Enter then sends one pick, for C", async () => {
    const props = withOptions();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    focus(option(0));
    await user.keyboard("c");
    const c = option(2);
    expect(c).toHaveFocus();
    // Marked: its item, the pressed look, and a description read with the focus.
    expect(chosenItem()).toHaveAttribute("data-option", "2");
    expect(c).toHaveAttribute("data-pressed");
    expect(c).toHaveAccessibleDescription("Chosen. Enter locks it in.");
    expect(c.className).toMatch(/kn-answer-badge/);
    expect(option(0)).not.toHaveAttribute("data-pressed");
    expect(props.onIntent).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 2 },
    ]);
    // Only one pick is ever sent while it is out: Enter again, the same key
    // again, another key and a click all wait for the round to answer.
    await user.keyboard("{Enter}cca{Enter}");
    await user.click(option(3));
    expect(picks(props.onIntent)).toHaveLength(1);
  });

  it("R2-02 the same key again locks in, and a held key never does", async () => {
    const props = withOptions();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    focus(option(0));
    // Held: the first press chooses, and its repeats choose nothing more.
    await user.keyboard("{c>5/}");
    expect(option(2)).toHaveFocus();
    expect(chosenItem()).toHaveAttribute("data-option", "2");
    fireEvent.keyDown(option(2), { key: "c", repeat: true });
    expect(props.onIntent).not.toHaveBeenCalled();
    // A second press of the same key locks it in.
    await user.keyboard("c");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 2 },
    ]);
  });

  it("R2-02 a key for the option that has focus marks it and says so, and a key for another moves the mark", async () => {
    const props = withOptions();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    focus(option(1));
    await user.keyboard("b");
    expect(option(1)).toHaveFocus();
    expect(chosenItem()).toHaveAttribute("data-option", "1");
    // Focus didn't move, so nothing new would be read: the status says it.
    expect(liveText()).toBe("Liesl Varo chosen. Enter locks it in.");
    await user.keyboard("d");
    expect(option(3)).toHaveFocus();
    expect(chosenItem()).toHaveAttribute("data-option", "3");
    expect(option(1)).not.toHaveAttribute("data-pressed");
    expect(props.onIntent).not.toHaveBeenCalled();
    // Digits choose too while no option is a number (D6).
    await user.keyboard("1");
    expect(option(0)).toHaveFocus();
    expect(chosenItem()).toHaveAttribute("data-option", "0");
    expect(props.onIntent).not.toHaveBeenCalled();
  });

  it("R2-02 Escape, or focus moving to another option, clears the mark, so Enter locks in what has focus", async () => {
    const props = withOptions();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    focus(option(0));
    await user.keyboard("c");
    await user.keyboard("{Escape}");
    expect(chosenItem()).toBeNull();
    expect(option(2)).toHaveFocus();
    // Chosen again, then Tab: D has focus, and nothing is marked.
    await user.keyboard("c");
    await user.tab();
    expect(option(3)).toHaveFocus();
    expect(chosenItem()).toBeNull();
    // "c" now chooses C again rather than lock it in.
    await user.keyboard("c");
    expect(option(2)).toHaveFocus();
    expect(props.onIntent).not.toHaveBeenCalled();
    // Focus leaving the options clears it too.
    focus(screen.getByRole("heading", { level: 2 }));
    expect(chosenItem()).toBeNull();
    // Tab and Enter, with no key, lock in the focused option, as any button.
    focus(option(1));
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  it("R2-02 typing a name from an option sends nothing", async () => {
    const props = withOptions();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    // c chooses C, a chooses A, r-t-o-g-r type, and the second a was "the
    // same key again", eight letters later.
    focus(option(0));
    await user.keyboard("Cartographer");
    expect(props.onIntent).not.toHaveBeenCalled();
    expect(chosenItem()).toBeNull();
    // Dee's flow, then Tab: "Odile Marsh", whose d chose D and whose space
    // pressed it.
    focus(option(0));
    await user.keyboard("Odile Marsh");
    expect(props.onIntent).not.toHaveBeenCalled();
    // A doubled letter after the mark moved: a, b, then b again.
    focus(option(0));
    await user.keyboard("Abby");
    expect(props.onIntent).not.toHaveBeenCalled();
    // An initial, then a space: b chose B, and the space is the name's.
    focus(option(0));
    await user.keyboard("B Smith");
    expect(props.onIntent).not.toHaveBeenCalled();
    for (const button of optionButtons()) {
      expect(button).toHaveAttribute("data-state", "idle");
    }
  });

  it("R2-02 after typing, a pause, then a key and the same key again lock in", async () => {
    const props = withOptions();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    try {
      focus(option(0));
      await user.keyboard("xb");
      // Inside a typed name, b only moves focus (R3-05 after review): no
      // mark, and neither b again nor Enter commits.
      expect(option(1)).toHaveFocus();
      await user.keyboard("b{Enter}");
      expect(chosenItem()).toBeNull();
      expect(props.onIntent).not.toHaveBeenCalled();
      now.mockReturnValue(1000 + TYPING_MS + 1);
      await user.keyboard("b");
      expect(chosenItem()).toHaveAttribute("data-option", "1");
      expect(props.onIntent).not.toHaveBeenCalled();
      await user.keyboard("b");
      expect(picks(props.onIntent)).toEqual([
        { family: "mystery", kind: "pick", option: 1 },
      ]);
    } finally {
      now.mockRestore();
    }
  });

  it("R2-02 Space chooses the focused option, and locks it in only once it is chosen", async () => {
    const props = withOptions();
    const { user } = renderWithUser(<MysteryRound {...props} />);
    focus(option(1));
    await user.keyboard(" ");
    expect(option(1)).toHaveFocus();
    expect(chosenItem()).toHaveAttribute("data-option", "1");
    expect(liveText()).toBe("Liesl Varo chosen. Enter locks it in.");
    expect(props.onIntent).not.toHaveBeenCalled();
    await user.keyboard(" ");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 1 },
    ]);
  });

  it("R2-02 shows the legend above the options, and the group's description says the same", () => {
    // D28 (amending D20): the legend shows from the moment the options do.
    renderWithUser(<MysteryRound {...withOptions()} />);
    const group = optionsGroup();
    expect(group).toHaveAccessibleDescription(`${LAST_LEAD} ${LEGEND}`);
    expect(MYSTERY_COPY.options.legend).toBe(LEGEND);
    const line = legend();
    expect(line).toHaveTextContent(LEGEND);
    expect(line).toHaveAttribute("data-keys-legend", "shown");
    expect(line?.className).not.toMatch(/(^| )hidden( |$)/);
    // Drawn in the round's own markup, under the lead and above the
    // options (on screen at 200% text on a phone), never in an option.
    const list = group.querySelector("ol");
    expect(list?.contains(line ?? null)).toBe(false);
    expect(
      list !== null && line !== null
        ? Boolean(
            list.compareDocumentPosition(line) &
            Node.DOCUMENT_POSITION_PRECEDING,
          )
        : false,
    ).toBe(true);
    // Its words are the description's: screen readers hear them once.
    expect(line).toHaveAttribute("aria-hidden", "true");
  });

  it("R2-02 sends one pick until the round answers, and another after an error", async () => {
    const props = withOptions();
    const { user, rerender } = renderWithUser(<MysteryRound {...props} />);
    focus(option(0));
    await user.keyboard("bb");
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toHaveLength(1);
    // The round is judging: every option waits, B locked.
    rerender(<MysteryRound {...props} status="judging" />);
    expect(option(1)).toHaveAttribute("data-state", "locked");
    await user.keyboard("b{Enter}");
    expect(picks(props.onIntent)).toHaveLength(1);
    // It failed: the options are back, and a new pick goes out.
    rerender(
      <MysteryRound
        {...props}
        status="error"
        error={{ code: "unreachable", retryable: true }}
      />,
    );
    expect(option(1)).toHaveAttribute("data-state", "idle");
    focus(option(1));
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toHaveLength(2);
  });

  it("R2-02 leaves keys and legend out with shortcuts off; Enter on an option still locks it in", async () => {
    const props = withOptions({
      context: {
        ...withOptions().context,
        settings: { ...TEST_SETTINGS, shortcuts: false },
      },
    });
    const { user } = renderWithUser(<MysteryRound {...props} />);
    focus(option(0));
    await user.keyboard("cc");
    expect(option(0)).toHaveFocus();
    expect(chosenItem()).toBeNull();
    expect(legend()).toBeNull();
    // Only the lead describes the group: no keys to name.
    expect(optionsGroup()).toHaveAccessibleDescription(LAST_LEAD);
    await user.keyboard("{Enter}");
    expect(picks(props.onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: 0 },
    ]);
  });
});

describe("clue 4's line (D24, R2-16)", () => {
  it("R2-16 says on clue 4 there is one pick and a wrong one scores 0, and names the options with it", async () => {
    const { user } = renderWithUser(
      <MysteryHarness
        content={odile}
        entities={peopleLookup}
        list={people}
        meta={mysteryMeta({ ordinal: 1 })}
      />,
    );
    for (let i = 0; i < 3; i += 1) {
      await user.click(
        screen.getByRole("button", { name: /^(Next|Last) clue/ }),
      );
    }
    const line = document.querySelector("[data-options-lead]");
    expect(line).toHaveTextContent(LAST_LEAD);
    expect(line).toBeVisible();
    expect(optionsGroup()).toBeInTheDocument();
    // The rule is read as clue 4 arrives, as the description of the group
    // focus lands on (D28); the status region names only the new worth.
    expect(optionsGroup()).toHaveFocus();
    expect(optionsGroup()).toHaveAccessibleDescription(
      expect.stringContaining(LAST_LEAD),
    );
    expect(liveText()).toBe("Last clue, now worth 1 point.");
  });

  it("R2-16 with options from clue 3, clue 3's line is only Pick one of four", () => {
    renderWithUser(<MysteryRound {...withOptions({ clue: 3 })} />);
    expect(document.querySelector("[data-options-lead]")).toHaveTextContent(
      /^Pick one of four$/,
    );
    expect(
      screen.getByRole("group", {
        name: /^Clue 3:/,
        description: `Pick one of four ${LEGEND}`,
      }),
    ).toBeInTheDocument();
  });
});

describe("Guess takes the one match (D23, R2-13)", () => {
  function play(onIntent = vi.fn<(intent: RoundIntent) => void>()) {
    const view = renderWithUser(
      <MysteryHarness
        content={odile}
        entities={peopleLookup}
        list={people}
        onIntent={onIntent}
      />,
    );
    return { ...view, onIntent };
  }

  const hint = () => document.querySelector('[data-hint="shown"]');

  it("R2-13 Guess submits the one highlighted match, and Pick a name from the list never shows", async () => {
    // Priya and Marcus: one match left, and Guess still said to pick it.
    const { user, onIntent } = play();
    await user.type(field(), "odile");
    const row = screen.getByRole("option", { name: /^Odile Marsh/ });
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(guessButton()).not.toHaveAttribute("aria-disabled");
    await user.click(guessButton());
    expect(onIntent).toHaveBeenCalledOnce();
    expect(onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "guess",
      entityId: odile.answer,
    });
    expect(hint()).toBeNull();
    expect(liveText()).not.toMatch(/Pick a name from the list/);
  });

  it("R2-13 a wrong one match goes in from Guess too, and the field clears for the next", async () => {
    const { user, onIntent } = play();
    await user.type(field(), "thea");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(
      screen.getByRole("option", { name: /^Thea Morrow/ }),
    ).toHaveAttribute("aria-selected", "true");
    await user.click(guessButton());
    expect(onIntent).toHaveBeenCalledOnce();
    expect(onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "guess",
      entityId: "fx.x.person.thea-morrow",
    });
    expect(
      document.querySelector('[data-stamp="fx.x.person.thea-morrow"]'),
    ).toBeInTheDocument();
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
    expect(hint()).toBeNull();
  });

  it("R2-13 Enter keeps the pick, then submits", async () => {
    const { user, onIntent } = play();
    await user.type(field(), "odile");
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue("Odile Marsh");
    expect(onIntent).not.toHaveBeenCalled();
    expect(liveText()).toBe("Odile Marsh selected.");
    await user.keyboard("{Enter}");
    expect(onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "guess",
      entityId: odile.answer,
    });
  });

  it("R2-13 with more than one match, or arrowed off the one, Guess still asks for a pick", async () => {
    const { user, onIntent } = play();
    await user.type(field(), "co");
    expect(screen.getAllByRole("option").length).toBeGreaterThan(1);
    expect(guessButton()).toHaveAttribute("aria-disabled", "true");
    await user.click(guessButton());
    expect(onIntent).not.toHaveBeenCalled();
    expect(hint()).toHaveTextContent("Pick a name from the list, then Guess.");
  });

  describe("on a phone, with the on-screen keyboard up", () => {
    it("R2-13 Go guesses the one highlighted match at once", async () => {
      const { user, onIntent } = play();
      await withKeyboardOpen(user);
      await user.type(field(), "odile");
      expect(
        screen.getByRole("option", { name: /^Odile Marsh/ }),
      ).toHaveAttribute("aria-selected", "true");
      // The on-screen keyboard's Go key is Enter.
      await user.keyboard("{Enter}");
      expect(onIntent).toHaveBeenCalledOnce();
      expect(onIntent).toHaveBeenCalledWith({
        family: "mystery",
        kind: "guess",
        entityId: odile.answer,
      });
      expect(hint()).toBeNull();
    });
  });
});

describe("the match count (D26, R2-21)", () => {
  it("R2-21 with seven matches, says 7 countries match and that 6 show, lists six, and shows Showing 6 under the list", async () => {
    // Sam heard "7 countries match", found six, and went looking for the seventh.
    expect(countries.search("a", new Set()).total).toBe(7);
    const { user } = renderWithUser(
      <MysteryHarness
        content={valdoria}
        entities={countryLookup}
        list={countries}
        meta={mysteryMeta({ answerType: "country", category: "geo" })}
      />,
    );
    await user.type(field(), "a");
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(6);
    const spoken = "7 countries match. Showing 6, so keep typing.";
    await waitFor(() => {
      expect(liveText()).toBe(spoken);
    });
    expect(field()).toHaveAccessibleDescription(
      `Pick a name from the list, then Guess. ${spoken}`,
    );
    // Under the list, for the eyes; the count above says it to screen readers.
    const shown = document.querySelector("[data-showing]");
    expect(shown).toHaveTextContent("Showing 6, so keep typing.");
    expect(shown).toBeVisible();
    expect(shown).toHaveAttribute("aria-hidden", "true");
    expect(
      Boolean(
        listbox.compareDocumentPosition(shown as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);

    // When every match shows, the count is the plain one, and the line goes.
    await user.type(field(), "r");
    const total = countries.search("ar", new Set()).total;
    expect(total).toBeLessThanOrEqual(6);
    await waitFor(() => {
      expect(liveText()).toBe(MYSTERY_COPY.guess.count("country", total));
    });
    expect(document.querySelector("[data-showing]")).toBeNull();
  });
});

describe("the clue ladder on a narrow column (R2-17)", () => {
  it("R2-17 sets clue text with manual hyphens, and stacks each number over its clue when the column is narrow in em", () => {
    renderWithUser(<MysteryRound {...withOptions({ clue: 2 })} />);
    const ladder = screen.getByRole("list", { name: "Clues" });
    // A container query on the ladder: it follows the text size and the width.
    expect(ladder.className).toContain("@container/ladder");
    const rungs = ladder.querySelectorAll("[data-rung]");
    expect(rungs).toHaveLength(2);
    for (const rung of rungs) {
      expect(rung.className).toContain(
        "@max-[18em]/ladder:grid-cols-[minmax(0,1fr)]",
      );
      expect(rung.querySelector("[data-rail]")?.className).toContain(
        "@max-[18em]/ladder:hidden",
      );
    }
    // No automatic hyphenation on any clue: "This fix- / ture coun- / try".
    const clueText = [
      screen.getByRole("heading", { level: 2 }),
      ...ladder.querySelectorAll('[data-rung="past"] p'),
    ];
    for (const element of clueText) {
      expect(element.className).toContain("hyphens-manual");
      expect(element.className).not.toContain("hyphens-auto");
    }
  });

  it("R2-17 keeps each number beside its clue while the keyboard is up, so older clues stay one line each", async () => {
    const { user } = renderWithUser(
      <MysteryHarness
        content={odile}
        entities={peopleLookup}
        list={people}
        meta={mysteryMeta({ ordinal: 1 })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^Next clue/ }));
    await withKeyboardOpen(user);
    const rungs = document.querySelectorAll("[data-rung]");
    expect(rungs).toHaveLength(2);
    for (const rung of rungs) {
      expect(rung.className).not.toContain("@max-[18em]/ladder:");
      expect(rung.querySelector("[data-rail]")?.className).not.toContain(
        "@max-[18em]/ladder:hidden",
      );
    }
    expect(document.querySelector('[data-rung="past"] p')?.className).toMatch(
      /line-clamp-1/,
    );
  });
});
