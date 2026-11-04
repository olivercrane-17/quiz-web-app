import {
  act,
  fireEvent,
  render,
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
import { mysteryPlugin, type MysteryClient } from "@/engine/rounds/mystery";
import type { EntityLookup } from "@/engine/rounds/types";
import {
  parseEntityId,
  parseItemId,
  type MysteryContent,
  type RoundIntent,
  type RoundReveal,
} from "@/engine/types";
import { clearAnnouncements, LIVE_REGION_IDS } from "@/ui/announce";
import { renderWithUser } from "@/test/render";

import { answerListHandleOf, type MysteryAnswerList } from "../answer-list";
import type { RoundComponentProps } from "../contracts";
import { MysteryRound } from ".";
import { NARROW_FIELD_EM } from "./combobox";
import { MysteryHarness, TEST_SETTINGS, mysteryMeta } from "./testing";
import { keyboardStateOf, layoutHeightOf } from "./use-keyboard";

let lookup: EntityLookup;
let people: MysteryAnswerList;
let mystery: MysteryContent;

beforeAll(async () => {
  const decoded = await loadFixtureList("person");
  if (decoded === null) throw new Error("no fixture person list");
  lookup = entityLookupOf(decoded);
  people = answerListHandleOf(decoded.list);
  const id = parseItemId("fx.m.hist.0101");
  const found = id === null ? undefined : FIXTURE_MYSTERIES.get(id);
  if (found === undefined) throw new Error("no fixture mystery fx.m.hist.0101");
  mystery = found;
});

beforeEach(() => {
  clearAnnouncements();
});

const liveText = () =>
  document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";
const field = () => screen.getByRole("combobox", { name: "Your guess" });
const guessButton = () => screen.getByRole("button", { name: "Guess" });
const nextClue = () =>
  screen.getByRole("button", { name: /^(Next|Last) clue/ });
const stake = (name: string) => screen.getByRole("img", { name });
const reveal = () => {
  const card = document.querySelector<HTMLElement>("[data-reveal]");
  if (card === null) throw new Error("no reveal card");
  return card;
};
/** The text a sighted player sees: everything but the `.sr-only` parts. */
function visibleText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll(".sr-only")) hidden.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}
/** True when `a` comes before `b` in the document, which is reading and focus order. */
const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

function play(props: Partial<Parameters<typeof MysteryHarness>[0]> = {}) {
  const onIntent = vi.fn<(intent: RoundIntent) => void>();
  const onContinue = vi.fn();
  const clients: MysteryClient[] = [];
  const view = renderWithUser(
    <MysteryHarness
      content={mystery}
      entities={lookup}
      list={people}
      onIntent={onIntent}
      onContinue={onContinue}
      onClient={(client) => clients.push(client)}
      {...props}
    />,
  );
  return { ...view, onIntent, onContinue, clients };
}

async function guess(user: UserEvent, typed: string, display: string) {
  await user.clear(field());
  await user.type(field(), typed);
  await user.click(
    screen.getByRole("option", { name: new RegExp(`^${display}`) }),
  );
  await user.click(guessButton());
}

describe("MysteryRound, guessing", () => {
  it("opens on the answer type as the screen's heading, with its category and clue 1", () => {
    play();
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "The answer is A person",
    });
    expect(heading).toHaveFocus();
    // The Daily's round area finds its focus targets by this attribute.
    expect(heading).toHaveAttribute("data-focus-target", "round_heading");
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Mystery 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: `Clue 1: ${mystery.clues[0]}`,
      }),
    ).toBeInTheDocument();
    expect(field()).toHaveAttribute("placeholder", "Start typing a person");
    expect(guessButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("AC-DLY-29 the stake indicator marks the worth by name, the status region repeats it, and Next clue names the next worth", async () => {
    const { user } = play();
    expect(stake("Worth 4 points now")).toHaveAttribute("data-stake", "4");
    expect(stake("Worth 4 points now")).toHaveAccessibleDescription(
      "Each clue costs a point: 4, 3, 2, 1.",
    );
    expect(nextClue()).toHaveAccessibleName("Next clue · then worth 3");

    await guess(user, "Corin", "Corin Ashby");
    expect(stake("Worth 3 points now")).toHaveAttribute("data-stake", "3");
    expect(liveText()).toBe(
      `Not Corin Ashby. Clue 2 is in. Now worth 3. ${mystery.clues[1]}`,
    );
    expect(nextClue()).toHaveAccessibleName("Next clue · then worth 2");

    await user.click(nextClue());
    expect(stake("Worth 2 points now")).toBeInTheDocument();
    expect(liveText()).toBe("Clue 3 is in. Now worth 2.");
    expect(nextClue()).toHaveAccessibleName(
      "Last clue and options · then worth 1",
    );

    await user.click(nextClue());
    expect(stake("Worth 1 point now")).toHaveAttribute("data-stake", "1");
    expect(liveText()).toBe("Last clue, now worth 1 point. Pick one of four.");
    expect(
      screen.queryByRole("button", { name: /^(Next|Last) clue/ }),
    ).toBeNull();
    // The spent values are struck, the current one carries the marker.
    const values = [...document.querySelectorAll("[data-stake] [data-value]")];
    expect(values.map((v) => v.getAttribute("data-state"))).toEqual([
      "spent",
      "spent",
      "spent",
      "now",
    ]);
  });

  it("stamps a wrong guess onto the clue it was tried on, readable and not struck through", async () => {
    const { user } = play();
    await guess(user, "Corin", "Corin Ashby");
    const firstRung = document.querySelector('[data-rung="past"]');
    expect(firstRung).not.toBeNull();
    const stamp = within(firstRung as HTMLElement).getByText("Not Corin Ashby");
    expect(stamp.closest("[data-stamp]")?.className).not.toMatch(
      /line-through/,
    );
    expect(stamp.closest("[data-stamp]")?.className).toMatch(/rotate/);
  });

  it("keeps focus in the field after a wrong guess, and moves it to the new clue after Next clue", async () => {
    const { user } = play();
    await guess(user, "Corin", "Corin Ashby");
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue("");
    expect(field()).toHaveAttribute("data-focus-target", "clue_heading");

    await user.click(nextClue());
    const clue3 = screen.getByRole("heading", { level: 2 });
    expect(clue3).toHaveAccessibleName(`Clue 3: ${mystery.clues[2]}`);
    expect(clue3).toHaveFocus();
    expect(clue3).toHaveAttribute("data-focus-target", "clue_heading");
  });

  it("follows the ARIA 1.2 combobox pattern with the keyboard", async () => {
    const { user } = play();
    await user.type(field(), "co");
    expect(field()).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "People matching co" });
    expect(field()).toHaveAttribute("aria-controls", listbox.id);
    const options = within(listbox).getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    expect(field()).not.toHaveAttribute("aria-activedescendant");

    await user.keyboard("{ArrowDown}");
    expect(field()).toHaveAttribute("aria-activedescendant", options[0]?.id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(field()).toHaveAttribute("aria-activedescendant", options[1]?.id);
    await user.keyboard("{ArrowUp}");
    expect(field()).toHaveAttribute("aria-activedescendant", options[0]?.id);

    const chosen = options[0]?.getAttribute("data-entity");
    const display = people
      .suggest("co", new Set())
      .find((row) => row.entityId === chosen)?.display;
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue(display);
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(guessButton()).not.toHaveAttribute("aria-disabled");
    expect(liveText()).toBe(`${display ?? ""} selected.`);

    // Editing the text clears the selection.
    await user.type(field(), "x");
    expect(guessButton()).toHaveAttribute("aria-disabled", "true");

    // Escape closes the list, then clears the field.
    await user.clear(field());
    await user.type(field(), "co");
    await user.keyboard("{Escape}");
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(field()).toHaveValue("co");
    await user.keyboard("{Escape}");
    expect(field()).toHaveValue("");
  });

  it("submits the selection with Enter, and judges it", async () => {
    const { user, onIntent } = play();
    await user.type(field(), "Mira");
    await user.keyboard("{ArrowDown}{Enter}");
    await user.keyboard("{Enter}");
    expect(onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "guess",
      entityId: parseEntityId("fx.x.person.mira-tolland"),
    });
    expect(stake("Worth 3 points now")).toBeInTheDocument();
  });

  it("announces the count as typing settles, and says when nothing matches", async () => {
    const { user } = play();
    await user.type(field(), "ada");
    const expected = people.search("ada", new Set()).total;
    expect(expected).toBe(2);
    await waitFor(() => {
      expect(liveText()).toBe("2 people match");
    });
    expect(field()).toHaveAccessibleDescription(
      "Pick a name from the list, then Guess. 2 people match",
    );

    await user.clear(field());
    await user.type(field(), "zzzz");
    // D17: "use", since a keyboard may be all the player has.
    expect(
      screen.getByText("No matches. Try another spelling, or use Next clue."),
    ).toBeVisible();
    await waitFor(() => {
      expect(liveText()).toBe(
        "No matches. Try another spelling, or use Next clue.",
      );
    });
  });

  it("bolds the typed letters and shows the disambiguation at the right", async () => {
    const { user } = play();
    await user.type(field(), "ada mor");
    const rows = screen.getAllByRole("option");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName("Ada Morrow, cartographer");
    expect(rows[0]?.querySelector("mark")?.textContent).toBe("Ada Mor");
  });

  it("AC-SUG-05 Enter with nothing highlighted selects only an exact, unique name or alias (component)", async () => {
    const { user } = play();
    await user.type(field(), "ada morrow");
    await user.keyboard("{Enter}");
    // Two namesakes: nothing is selected and the list stays open.
    expect(guessButton()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("listbox")).toBeVisible();
    expect(field()).toHaveValue("ada morrow");

    await user.clear(field());
    await user.type(field(), "odile marsh-vane");
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue("Odile Marsh");
    expect(guessButton()).not.toHaveAttribute("aria-disabled");

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { level: 1, name: "Odile Marsh" }),
    ).toHaveFocus();
    expect(within(reveal()).getByText("Knew it.")).toBeInTheDocument();
  });

  it("AC-SUG-05 Enter on listed text that names no entity exactly selects nothing and keeps the list open", async () => {
    const { user } = play();
    // "cor" is a prefix of several rows (so none is highlighted by itself,
    // D5) and no entity's name or alias.
    await user.type(field(), "cor");
    expect(screen.getAllByRole("option").length).toBeGreaterThan(1);
    expect(field()).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Enter}");
    expect(guessButton()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("listbox")).toBeVisible();
    expect(field()).toHaveValue("cor");
    // And it says how to pick (D5, R1-29).
    expect(document.querySelector('[data-hint="shown"]')).toHaveTextContent(
      "Pick a name from the list, then Guess.",
    );
  });

  it("tells namesakes apart by the qualifier, and keeps a filled-in row while it is edited", async () => {
    const { user } = play();
    await user.type(field(), "ada morrow s");
    expect(screen.getAllByRole("option").map((row) => row.textContent)).toEqual(
      ["Ada Morrow, sculptor"],
    );
    await user.keyboard("{ArrowDown}{Enter}");
    expect(field()).toHaveValue("Ada Morrow (sculptor)");

    // One Backspace: the selection clears, the row stays, and Enter takes it back.
    await user.keyboard("{Backspace}");
    expect(field()).toHaveValue("Ada Morrow (sculptor");
    expect(guessButton()).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("option", { name: "Ada Morrow, sculptor" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No matches. Try another spelling, or tap Next clue."),
    ).toBeNull();
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue("Ada Morrow (sculptor)");
    expect(guessButton()).not.toHaveAttribute("aria-disabled");
  });

  it("lists already-guessed entities disabled, and never selects them", async () => {
    const { user } = play();
    await guess(user, "Corin", "Corin Ashby");
    await user.type(field(), "corin");
    const row = screen.getByRole("option", {
      name: "Corin Ashby, Already guessed",
    });
    expect(row).toHaveAttribute("aria-disabled", "true");
    await user.click(row);
    expect(field()).toHaveValue("corin");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(field()).toHaveValue("corin");
    expect(guessButton()).toHaveAttribute("aria-disabled", "true");
    // Enter on the exact name of an already-guessed entity selects nothing either.
    await user.clear(field());
    await user.type(field(), "corin ashby");
    await user.keyboard("{Enter}");
    expect(guessButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("refuses a repeat on the device, with words under the field", async () => {
    const onIntent = vi.fn();
    const props: RoundComponentProps = {
      meta: mysteryMeta(),
      open: {
        family: "mystery",
        index: 1,
        clue: 2,
        clues: [mystery.clues[0], mystery.clues[1]],
        wrongGuesses: [],
        options: null,
        issuedAt: 0,
      },
      client: null,
      status: "idle",
      reveal: null,
      error: { code: "already_guessed", retryable: false },
      onIntent,
      onContinue: vi.fn(),
      continueLabel: "Next mystery",
      context: {
        mode: "daily",
        sealed: true,
        list: people,
        itemRef: "daily:42:1",
        settings: TEST_SETTINGS,
      },
    };
    const { container } = renderWithUser(<MysteryRound {...props} />);
    expect(
      within(container).getByText(
        "You've tried that one already. Pick another.",
      ),
    ).toBeInTheDocument();
    // Spoken as it appears (DESIGN §6.9).
    expect(liveText()).toBe("You've tried that one already. Pick another.");
  });
});

describe("MysteryRound, the options", () => {
  it("replaces typing with four options on clue 4, with Already guessed and keys 1 to 4", async () => {
    const { user, onIntent } = play();
    // Liesl Varo is a distractor: guessed by typing, it comes back disabled.
    await guess(user, "Liesl", "Liesl Varo");
    await user.click(nextClue());
    await user.click(nextClue());

    expect(screen.queryByRole("combobox")).toBeNull();
    const group = screen.getByRole("group", { name: "Pick one of four" });
    const options = within(group).getAllByRole("button");
    expect(options[0]).toHaveAccessibleName("A. Odile Marsh");
    expect(options[1]).toHaveAccessibleName("B. Liesl Varo Already guessed");
    expect(options[2]).toHaveAccessibleName("C. Ennis Ward");
    expect(options[3]).toHaveAccessibleName("D. Mira Tolland");
    expect(options[1]).toHaveAttribute("data-state", "already-guessed");
    expect(options[1]).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      mystery.clues[3],
    );

    onIntent.mockClear();
    await user.keyboard("2");
    expect(onIntent).not.toHaveBeenCalled();
    await user.keyboard("3");
    expect(onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "pick",
      option: 2,
    });
    // A wrong pick on clue 4 misses.
    expect(
      within(reveal()).getByText("This one got away."),
    ).toBeInTheDocument();
    expect(
      within(reveal()).getByText("You picked Ennis Ward"),
    ).toBeInTheDocument();
  });

  it("solves on a right pick, stamped Got it.", async () => {
    const { user } = play();
    for (let i = 0; i < 3; i += 1) await user.click(nextClue());
    await user.click(screen.getByRole("button", { name: "A. Odile Marsh" }));
    const card = reveal();
    expect(within(card).getByText("Got it.")).toBeInTheDocument();
    expect(
      within(card).getByText("Solved on clue 4", { exact: false }),
    ).toBeInTheDocument();
    expect(within(card).getByText("1 point")).toHaveClass("sr-only");
  });

  it("locks the pick while it is judged and waits the others", () => {
    const props: RoundComponentProps = {
      meta: mysteryMeta(),
      open: {
        family: "mystery",
        index: 1,
        clue: 4,
        clues: [...mystery.clues],
        wrongGuesses: [],
        options: [
          { index: 0, label: "Odile Marsh", alreadyGuessed: false },
          { index: 1, label: "Liesl Varo", alreadyGuessed: true },
          { index: 2, label: "Ennis Ward", alreadyGuessed: false },
          { index: 3, label: "Mira Tolland", alreadyGuessed: false },
        ],
        issuedAt: 0,
      },
      client: null,
      status: "idle",
      reveal: null,
      error: null,
      onIntent: vi.fn(),
      onContinue: vi.fn(),
      continueLabel: "Next mystery",
      context: {
        mode: "daily",
        sealed: true,
        list: people,
        itemRef: "daily:42:1",
        settings: TEST_SETTINGS,
      },
    };
    const { rerender } = renderWithUser(<MysteryRound {...props} />);
    screen.getByRole("button", { name: "C. Ennis Ward" }).click();
    rerender(<MysteryRound {...props} status="judging" />);
    const states = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("data-state"))
      .map((b) => b.getAttribute("data-state"));
    expect(states).toEqual([
      "disabled",
      "already-guessed",
      "locked",
      "disabled",
    ]);
  });
});

describe("MysteryRound, the reveal", () => {
  it("replaces the clue screen: the stamp, the clue, the points, all four clues and the actions", async () => {
    const { user, onContinue } = play();
    await guess(user, "Corin", "Corin Ashby");
    await guess(user, "Odile", "Odile Marsh");

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Odile Marsh",
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("data-focus-target", "reveal_heading");
    expect(screen.queryByRole("combobox")).toBeNull();
    const card = reveal();
    // A solve after a miss (D10).
    expect(within(card).getByText("Got there.")).toBeInTheDocument();
    expect(
      within(card).getByText("Solved on clue 2", { exact: false }),
    ).toBeInTheDocument();
    expect(within(card).getByText("3 points")).toHaveClass("sr-only");

    const list = screen.getByRole("list", { name: "All four clues" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-clue-state"))).toEqual([
      "used",
      "solved",
      "spare",
      "spare",
    ]);
    expect(
      within(rows[0] as HTMLElement).getByText("You guessed Corin Ashby"),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText("Solved here"),
    ).toBeInTheDocument();
    expect(within(list).getAllByText("Not needed")).toHaveLength(2);
    expect(screen.getByText(mystery.explanation)).toBeInTheDocument();

    const learnMore = screen.getByRole("link", {
      name: "Learn more about Odile Marsh (fixture) on Wikipedia (opens in a new tab)",
    });
    expect(learnMore).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/w/index.php?search=Odile%20Marsh%20(fixture)",
    );
    expect(learnMore).toHaveAttribute("target", "_blank");
    expect(learnMore).toHaveAttribute("rel", "noopener noreferrer");

    await user.click(screen.getByRole("button", { name: "Next mystery" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("continues on Enter from the reveal heading, but not from its links and buttons", async () => {
    const { user, onContinue } = play();
    await guess(user, "Odile", "Odile Marsh");
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Odile Marsh",
    });
    expect(heading).toHaveFocus();
    // Enter on Learn more opens the link; it never continues.
    fireEvent.keyDown(screen.getByRole("link", { name: /^Learn more/ }), {
      key: "Enter",
    });
    expect(onContinue).not.toHaveBeenCalled();
    // A held Enter (a repeat) never skips the reveal either.
    fireEvent.keyDown(heading, { key: "Enter", repeat: true });
    expect(onContinue).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("says a miss plainly: This one got away., the answer, 0 points, no stamp", async () => {
    const { user, clients } = play();
    for (let i = 0; i < 3; i += 1) await user.click(nextClue());
    await user.click(screen.getByRole("button", { name: "D. Mira Tolland" }));
    const card = reveal();
    expect(within(card).getByText("This one got away.")).toBeInTheDocument();
    expect(within(card).getByText("The answer was")).toBeInTheDocument();
    expect(within(card).getByText("0 points")).toBeInTheDocument();
    expect(within(card).queryByText("Knew it.")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Odile Marsh" }),
    ).toHaveFocus();
    const client = clients.at(-1);
    expect(
      client && mysteryPlugin.outcome(client, mysteryMeta())?.cells,
    ).toEqual(["passed", "passed", "passed", "passed"]);
  });

  function revealProps(reveal: RoundReveal): RoundComponentProps {
    return {
      meta: mysteryMeta(),
      open: {
        family: "mystery",
        index: 1,
        clue: 1,
        clues: [mystery.clues[0]],
        wrongGuesses: [],
        options: null,
        issuedAt: 0,
      },
      client: null,
      status: "revealed",
      reveal,
      error: null,
      onIntent: vi.fn(),
      onContinue: vi.fn(),
      continueLabel: "On to the Encore",
      context: {
        mode: "daily",
        sealed: true,
        list: people,
        itemRef: "daily:42:1",
        settings: TEST_SETTINGS,
      },
    };
  }

  const solvedReveal = (
    crowd: Extract<RoundReveal, { family: "mystery" }>["crowd"],
  ): RoundReveal => ({
    family: "mystery",
    answer: { entityId: mystery.answer, display: "Odile Marsh" },
    clues: mystery.clues,
    solvedOn: 1,
    points: 4,
    pickedOption: null,
    explanation: mystery.explanation,
    learnMore: mystery.learnMore,
    sourceLabels: ["Fixture atlas", "Fixture archive"],
    crowd,
  });

  it("shows how everyone did once enough have finished, with a table and the top wrong guess", () => {
    renderWithUser(
      <MysteryRound
        {...revealProps(
          solvedReveal({
            solvedOn: [14, 31, 22, 18],
            missed: 15,
            topWrongGuess: {
              entityId: parseEntityId("fx.x.person.corin-ashby")!,
              display: "Corin Ashby",
            },
            eligible: 120,
          }),
        )}
      />,
    );
    const figure = screen.getByRole("figure", { name: "How everyone did" });
    const table = within(figure).getByRole("table", {
      name: "How everyone did, by the clue that solved it",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    expect(
      within(table).getByRole("rowheader", { name: "Clue 1 (you)" }),
    ).toBeInTheDocument();
    expect(
      within(figure).getByText("Most common wrong guess: Corin Ashby"),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-bar="clue-1"]')).toHaveAttribute(
      "data-you",
    );
    expect(
      screen.getByText("Sources: Fixture atlas, Fixture archive"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "On to the Encore" }),
    ).toBeInTheDocument();
  });

  it("says how many have finished before crowd stats qualify", () => {
    renderWithUser(
      <MysteryRound
        {...revealProps(
          solvedReveal({
            solvedOn: [0, 0, 0, 0],
            missed: 0,
            topWrongGuess: null,
            eligible: 23,
          }),
        )}
      />,
    );
    expect(
      screen.getByText(
        "Only 23 players have finished this one. Check back later for the numbers.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("figure")).toBeNull();
  });

  it("shows the withdrawn card for a voided Mystery", async () => {
    const props = revealProps({
      family: "withdrawn",
      round: "mystery",
      points: 4,
      maxPoints: 4,
    });
    const { user } = renderWithUser(<MysteryRound {...props} />);
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "This Mystery was withdrawn because we got it wrong.",
    });
    expect(heading).toHaveFocus();
    expect(screen.getByText("Everyone gets 4 points.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "On to the Encore" }));
    expect(props.onContinue).toHaveBeenCalledOnce();
    // Enter on the heading continues too (PRD §3.0.3).
    heading.focus();
    await user.keyboard("{Enter}");
    expect(props.onContinue).toHaveBeenCalledTimes(2);
  });
});

describe("MysteryRound, connection and errors", () => {
  function base(
    overrides: Partial<RoundComponentProps> = {},
  ): RoundComponentProps {
    return {
      meta: mysteryMeta(),
      open: {
        family: "mystery",
        index: 1,
        clue: 1,
        clues: [mystery.clues[0]],
        wrongGuesses: [],
        options: null,
        issuedAt: 0,
      },
      client: null,
      status: "idle",
      reveal: null,
      error: null,
      onIntent: vi.fn(),
      onContinue: vi.fn(),
      continueLabel: "Next mystery",
      context: {
        mode: "daily",
        sealed: true,
        list: people,
        itemRef: "daily:42:1",
        settings: TEST_SETTINGS,
      },
      ...overrides,
    };
  }

  it("disables the inputs offline and says what is safe", () => {
    renderWithUser(<MysteryRound {...base({ status: "offline" })} />);
    expect(field()).toHaveAttribute("aria-disabled", "true");
    expect(field()).toHaveAttribute("readonly");
    expect(nextClue()).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(
        "You're offline. Your progress is saved, and we'll pick up where you left off.",
      ),
    ).toBeInTheDocument();
  });

  it("offers Retry after a failed action, resending the same intent", async () => {
    const props = base();
    const { user, rerender } = renderWithUser(<MysteryRound {...props} />);
    await user.click(nextClue());
    expect(props.onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "next_clue",
    });
    rerender(<MysteryRound {...props} status="judging" />);
    expect(nextClue()).toHaveAttribute("aria-busy", "true");
    rerender(
      <MysteryRound
        {...props}
        status="error"
        error={{ code: "internal", retryable: false }}
      />,
    );
    const round = document.querySelector('[data-round="mystery"]');
    expect(
      within(round as HTMLElement).getByText(
        "We couldn't check that guess. Try again.",
      ),
    ).toBeInTheDocument();
    // Spoken as it appears (DESIGN §6.9).
    expect(liveText()).toBe("We couldn't check that guess. Try again.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onIntent).toHaveBeenLastCalledWith({
      family: "mystery",
      kind: "next_clue",
    });
  });

  it("leaves the offline line to the controller's alert, and says nothing more", () => {
    renderWithUser(<MysteryRound {...base({ status: "offline" })} />);
    expect(liveText()).toBe("");
  });

  it("shows Checking… under the field while a guess is slow, and Guess keeps its label", async () => {
    const props = base();
    const { user, rerender } = renderWithUser(<MysteryRound {...props} />);
    await user.type(field(), "Mira");
    await user.keyboard("{ArrowDown}{Enter}");
    await user.click(guessButton());
    rerender(<MysteryRound {...props} status="checking" />);
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(guessButton()).toHaveAttribute("aria-busy", "true");
  });

  it("describes the field while the list loads, and says once when it failed", async () => {
    const loading: MysteryAnswerList = {
      status: "loading",
      type: "person",
      suggest: () => [],
      search: () => ({ rows: [], total: 0 }),
      exactMatch: () => null,
      retry: vi.fn(),
    };
    const props = base({ context: { ...base().context, list: loading } });
    const { user } = renderWithUser(<MysteryRound {...props} />);
    await user.type(field(), "co");
    expect(field()).toHaveAccessibleDescription(
      "Pick a name from the list, then Guess. Loading the suggestions…",
    );
  });

  it("stays finishable when the list fails to load", async () => {
    const failed: MysteryAnswerList = {
      status: "failed",
      type: "person",
      suggest: () => [],
      search: () => ({ rows: [], total: 0 }),
      exactMatch: () => null,
      retry: vi.fn(),
    };
    const listFailed =
      "We couldn't load the suggestions. You can still use Next clue and pick from four options at the end.";
    const props = base({ context: { ...base().context, list: failed } });
    const { user, container } = renderWithUser(<MysteryRound {...props} />);
    expect(within(container).getByText(listFailed)).toBeInTheDocument();
    expect(liveText()).toBe(listFailed);
    expect(field()).toHaveAccessibleDescription(
      `Pick a name from the list, then Guess. ${listFailed}`,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(failed.retry).toHaveBeenCalledOnce();
    await user.click(nextClue());
    expect(props.onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "next_clue",
    });
  });
});

describe("MysteryRound with the keyboard open", () => {
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

  it("reads a keyboard from the visual viewport, scaling pinch-zoom out", () => {
    expect(
      keyboardStateOf({ height: 340, offsetTop: 0, scale: 1 }, 640),
    ).toEqual({
      open: true,
      bottom: 340,
    });
    expect(
      keyboardStateOf({ height: 600, offsetTop: 0, scale: 1 }, 640).open,
    ).toBe(false);
    expect(
      keyboardStateOf({ height: 320, offsetTop: 100, scale: 2 }, 640).open,
    ).toBe(false);
  });

  it("never reads a page that overflows sideways as a keyboard", () => {
    // 320 by 568 at 200% text on a phone: a 418 px wide page widened the
    // layout viewport to 418 by 742, 174 px taller than the 568 px the
    // screen showed: "a keyboard", with none there.
    const screenView = { width: 320, height: 568, offsetTop: 0, scale: 1 };
    const layout = layoutHeightOf(screenView, 742, 418);
    expect(layout).toBeCloseTo(568, 0);
    expect(keyboardStateOf(screenView, layout).open).toBe(false);
    // A real keyboard on the same page still counts: 300 px of 568 covered.
    expect(keyboardStateOf({ ...screenView, height: 268 }, layout).open).toBe(
      true,
    );
    // A page zoomed out to fit reads the same.
    expect(
      layoutHeightOf({ width: 418, scale: 320 / 418 }, 742, 418),
    ).toBeCloseTo(568, 0);
    // A page that fits is measured as before, pinch-zoom included.
    expect(layoutHeightOf({ width: 360, scale: 1 }, 640, 360)).toBe(640);
    expect(layoutHeightOf({ width: 180, scale: 2 }, 640, 360)).toBe(640);
  });

  /** A wrong guess, then the keyboard opens over a 340 px viewport. */
  async function withKeyboardOpen() {
    const viewport = new FakeViewport();
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("scrollBy", vi.fn());
    const view = play();
    await guess(view.user, "Corin", "Corin Ashby");
    expect(field()).toHaveFocus();
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
    const combobox = document.querySelector("[data-combobox]") as HTMLElement;
    return { ...view, combobox };
  }

  it("collapses older clues and moves Next clue beside the field", async () => {
    const { combobox } = await withKeyboardOpen();
    expect(
      within(combobox).getByRole("button", { name: /^Next clue/ }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-rung="past"] p')?.className).toMatch(
      /line-clamp-1/,
    );
    // The current clue's card slims: no "New" tag.
    expect(
      within(
        document.querySelector("[data-clue-card]") as HTMLElement,
      ).queryByText("New"),
    ).toBeNull();
  });

  it("gives the field the row: a short Next clue that keeps its full name and its worth, no search icon or Clear", async () => {
    const { user, combobox } = await withKeyboardOpen();
    await user.type(field(), "ada");
    const beside = within(combobox).getByRole("button", {
      name: /^Next clue/,
    });
    expect(beside).toHaveAccessibleName("Next clue · then worth 2");
    // Visible: "Next clue" over its worth (R1-33); only the dot is read alone.
    expect(visibleText(beside)).toBe("Next clue then worth 2");
    expect(
      within(combobox).queryByRole("button", { name: "Clear your guess" }),
    ).toBeNull();
    // Escape still clears.
    await user.keyboard("{Escape}{Escape}");
    expect(field()).toHaveValue("");
  });

  it("R1-33 keeps the worth on the compact last clue, showing every word of its full name in order (AC-DLY-29)", async () => {
    const { user, combobox } = await withKeyboardOpen();
    await user.click(
      within(combobox).getByRole("button", { name: /^Next clue/ }),
    );
    // Clue 3: back in the field, with the keyboard up again.
    await user.click(field());
    await waitFor(() => {
      expect(document.querySelector('[data-round="mystery"]')).toHaveAttribute(
        "data-keyboard",
        "open",
      );
    });
    const beside = within(
      document.querySelector("[data-combobox]") as HTMLElement,
    ).getByRole("button", { name: /^Last clue/ });
    expect(beside).toHaveAttribute("data-compact");
    // Marcus saw "Last clue" alone, with no word of what it cost. The
    // visible words are the name's, in its order, so a spoken "Last clue
    // and options" finds the button (WCAG 2.5.3); only the dot is unseen.
    expect(visibleText(beside)).toBe("Last clue and options then worth 1");
    expect(beside).toHaveAccessibleName("Last clue and options · then worth 1");
  });

  it("R1-03 stacks Guess and the compact Next clue on rows of their own when the field is narrow", async () => {
    const { combobox } = await withKeyboardOpen();
    const narrow = `@max-[${String(NARROW_FIELD_EM)}em]/guess:`;
    const beside = combobox.querySelector("[data-beside]");
    if (!(beside instanceof HTMLElement)) throw new Error("nothing beside");
    // Wide: beside the field. Narrow: its own full-width row, under Guess.
    expect(beside.className).toContain("col-start-3");
    for (const placement of ["row-start-5", "col-start-1", "*:flex-1"]) {
      expect(beside.className.split(/\s+/)).toContain(`${narrow}${placement}`);
    }
    expect(guessButton().className.split(/\s+/)).toContain(
      `${narrow}row-start-4`,
    );
    expect(before(guessButton(), within(beside).getByRole("button"))).toBe(
      true,
    );
  });

  it("fires Next clue from beside the field, keeping the keyboard up until the press lands", async () => {
    const { user, combobox, onIntent } = await withKeyboardOpen();
    onIntent.mockClear();
    const beside = within(combobox).getByRole("button", {
      name: /^Next clue/,
    });
    await user.click(beside);
    expect(onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "next_clue",
    });
    expect(document.querySelector('[data-round="mystery"]')).toHaveAttribute(
      "data-clue",
      "3",
    );
    const clue3 = screen.getByRole("heading", { level: 2 });
    expect(clue3).toHaveAccessibleName(`Clue 3: ${mystery.clues[2]}`);
    expect(clue3).toHaveFocus();
  });

  it("keeps focus in the field when any of the round's buttons is pressed", async () => {
    const { combobox } = await withKeyboardOpen();
    const beside = within(combobox).getByRole("button", {
      name: /^Next clue/,
    });
    // A prevented mousedown is what keeps the blur from closing the keyboard.
    expect(fireEvent.mouseDown(beside)).toBe(false);
    expect(field()).toHaveFocus();
    // A press on the clue itself still blurs, so tapping away closes the keyboard.
    expect(fireEvent.mouseDown(screen.getByRole("heading", { level: 2 }))).toBe(
      true,
    );
  });
});

/**
 * RITE round 1 (docs/playtests/rite-1.md §5, §8): each finding's
 * reproduction, under decisions D5, D6, D9, D10, D14, D15 and D17
 * (02-PRODUCT-DECISIONS §19). Layout that needs a real browser (R1-03's
 * widths, R1-11's scroll) is checked here through its contract: the
 * container query's classes, and the scroll measured from mocked boxes.
 */
describe("MysteryRound after RITE round 1", () => {
  let films: MysteryAnswerList;
  let filmLookup: EntityLookup;
  let film: MysteryContent;

  beforeAll(async () => {
    const decoded = await loadFixtureList("film");
    if (decoded === null) throw new Error("no fixture film list");
    films = answerListHandleOf(decoded.list);
    filmLookup = entityLookupOf(decoded);
    const id = parseItemId("fx.m.film.0101");
    const found = id === null ? undefined : FIXTURE_MYSTERIES.get(id);
    if (found === undefined)
      throw new Error("no fixture mystery fx.m.film.0101");
    film = found;
  });

  /** Daily #45's Mystery 1: a film, with the "…Lighthouse" decoys. */
  const playFilm = (
    props: Partial<Parameters<typeof MysteryHarness>[0]> = {},
  ) =>
    play({
      content: film,
      entities: filmLookup,
      list: films,
      meta: mysteryMeta({ answerType: "film", category: "film", ordinal: 1 }),
      ...props,
    });

  /** A Mystery on its last clue with these four options, rendered from props. */
  function lastClue(labels: readonly string[]): RoundComponentProps {
    return {
      meta: mysteryMeta(),
      open: {
        family: "mystery",
        index: 1,
        clue: 4,
        clues: [...mystery.clues],
        wrongGuesses: [],
        options: labels.map((label, index) => ({
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
      onIntent: vi.fn(),
      onContinue: vi.fn(),
      continueLabel: "Next mystery",
      context: {
        mode: "daily",
        sealed: true,
        list: people,
        itemRef: "daily:42:1",
        settings: TEST_SETTINGS,
      },
    };
  }

  it("R1-03 gives Guess its own row and drops Clear when the field is narrow in em, and wraps names with the qualifier under them", async () => {
    // Sam at 390 by 844 with 200% text: Guess and Clear kept their size
    // inside the field, and rows truncated to "The L… 1987". The real
    // layout is measured in e2e/daily/mystery-layout.spec.ts.
    const { user } = playFilm();
    await user.type(field(), "lan");
    const combobox = document.querySelector("[data-combobox]");
    if (!(combobox instanceof HTMLElement)) throw new Error("no combobox");
    // The field's own width decides, in em, so text size counts as much as the screen.
    expect(combobox.className).toMatch(/(^|\s)@container\/guess(\s|$)/);
    const narrow = `@max-[${String(NARROW_FIELD_EM)}em]/guess:`;
    const classesOf = (element: Element | null | undefined) =>
      (element?.getAttribute("class") ?? "").split(/\s+/);
    const guessClasses = classesOf(guessButton());
    for (const placement of ["row-start-4", "col-start-1", "w-full"]) {
      expect(guessClasses).toContain(`${narrow}${placement}`);
    }
    expect(
      classesOf(screen.getByRole("button", { name: "Clear your guess" })),
    ).toContain(`${narrow}hidden`);
    // The search icon and the rows' type icons give their room to the text.
    expect(classesOf(document.querySelector("[data-field] > svg"))).toContain(
      `${narrow}hidden`,
    );
    expect(
      classesOf(document.querySelector('[role="option"] > svg')),
    ).toContain(`${narrow}hidden`);
    // A row is one 48 px line, as three rows above a keyboard need
    // (AC-DLY-32); a narrow field's rows wrap their names instead, with the
    // qualifier under them, never cut.
    const names = [...document.querySelectorAll("[data-row-name]")];
    expect(names.length).toBeGreaterThan(1);
    for (const name of names) {
      const classes = classesOf(name);
      expect(classes).toContain("truncate");
      for (const wrap of ["whitespace-normal", "break-words"]) {
        expect(classes).toContain(`${narrow}${wrap}`);
      }
    }
    const aside = screen
      .getByRole("option", { name: /^The Lantern Keeper/ })
      .querySelector("[data-row-aside]");
    expect(aside).toHaveTextContent("1987");
    for (const wrap of ["basis-full", "whitespace-normal", "max-w-full"]) {
      expect(classesOf(aside)).toContain(`${narrow}${wrap}`);
    }
    // Wherever Guess sits, it follows the field in focus order.
    expect(before(field(), guessButton())).toBe(true);
  });

  it("R1-03 and D14 let a narrow field's placeholder wrap, so the type's noun is never cut", async () => {
    // At 200% text the one-line placeholder lost its noun: "Start typing
    // a fi…".
    const { user } = playFilm();
    const narrow = `@max-[${String(NARROW_FIELD_EM)}em]/guess:`;
    expect(field()).toHaveAttribute("placeholder", "Start typing a film");
    expect(field().getAttribute("class")?.split(/\s+/)).toContain(
      `${narrow}placeholder:text-transparent`,
    );
    const drawn = document.querySelector("[data-placeholder]");
    expect(drawn).toHaveTextContent("Start typing a film");
    expect(drawn).toHaveAttribute("aria-hidden", "true");
    const classes = drawn?.getAttribute("class")?.split(/\s+/) ?? [];
    // Shown only where the field is narrow, where it may take two lines.
    expect(classes).toContain("hidden");
    expect(classes).toContain(`${narrow}flex`);
    expect(classes).not.toContain("truncate");
    // The field still reads its placeholder once, from the input itself.
    expect(field()).toHaveAccessibleName("Your guess");
    // Typing takes it away.
    await user.type(field(), "l");
    expect(document.querySelector("[data-placeholder]")).toBeNull();
  });

  it("AC-DLY-32 runs the list under Next clue too while the keyboard is up, so its rows keep the row's whole width", async () => {
    const { user } = playFilm();
    await user.type(field(), "the");
    const list = screen.getByRole("listbox");
    // Every column: under Guess, and under Next clue when it sits beside
    // the field.
    expect(list.getAttribute("class")?.split(/\s+/)).toContain("col-end-[-1]");
    expect(list.getAttribute("class")).not.toMatch(/(^|\s)col-end-3(\s|$)/);
  });

  it("highlights and hovers rows in full ink, so the qualifier and the typo mark keep 4.5:1 on the tint", async () => {
    const { user } = playFilm();
    await user.type(field(), "the");
    const ink = "text-[color:var(--kn-ink,var(--foreground))]";
    const ink2 = "text-[color:var(--kn-ink-2,var(--muted-foreground))]";
    const asideOf = (index: number) =>
      (
        screen
          .getAllByRole("option")
          [index]?.querySelector("[data-row-aside]")
          ?.getAttribute("class") ?? ""
      ).split(/\s+/);
    // At rest: the secondary ink, turning to full ink under a hover.
    expect(asideOf(0)).toContain(ink2);
    expect(asideOf(0)).toContain(`group-hover/row:${ink}`);
    expect(screen.getAllByRole("option")[0]).toHaveClass("group/row");
    // Highlighted with the arrow keys: full ink.
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(asideOf(0)).toContain(ink);
    expect(asideOf(0)).not.toContain(ink2);
    expect(asideOf(1)).toContain(ink2);
  });

  it("R1-04 says what a wrong guess costs under Mystery 1's clue 1 in the player's first Daily, and nowhere else", async () => {
    const hint =
      "Get it from this clue for 4 points. A wrong guess costs the same as Next clue, so have a go.";
    const first = play({ firstDaily: true, meta: mysteryMeta({ ordinal: 1 }) });
    const note = screen.getByText(hint);
    expect(note.closest('[data-rung="current"]')).toHaveTextContent(
      mystery.clues[0],
    );
    // Read with the field, before anyone has guessed.
    expect(field()).toHaveAccessibleDescription(
      `Pick a name from the list, then Guess. ${hint}`,
    );
    // Clue 2: "this clue" is gone, and so is the hint.
    await first.user.click(nextClue());
    expect(screen.queryByText(hint)).toBeNull();
    first.unmount();

    for (const props of [
      { firstDaily: false, meta: mysteryMeta({ ordinal: 1 }) },
      { meta: mysteryMeta({ ordinal: 1 }) },
      { firstDaily: true, meta: mysteryMeta({ ordinal: 2 }) },
    ]) {
      const view = play(props);
      expect(screen.queryByText(hint)).toBeNull();
      view.unmount();
    }
  });

  it("R1-11 keeps the field and three rows in view as the list opens with no keyboard, against the visual viewport", async () => {
    // Sam at 200% zoom on 1280 by 800: a 640 by 400 viewport, no keyboard,
    // and the list opening below the fold.
    vi.stubGlobal(
      "visualViewport",
      Object.assign(new EventTarget(), {
        width: 640,
        height: 400,
        offsetTop: 0,
        offsetLeft: 0,
        pageTop: 0,
        pageLeft: 0,
        scale: 1,
      }),
    );
    vi.stubGlobal("innerHeight", 400);
    let scrolled = 0;
    const scrollBy = vi.fn((options: ScrollToOptions) => {
      scrolled += options.top ?? 0;
    });
    vi.stubGlobal("scrollBy", scrollBy);
    const at = (top: number, height: number) =>
      DOMRect.fromRect({ x: 0, y: top - scrolled, width: 600, height });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute("data-field-frame")) return at(330, 58);
        if (this.hasAttribute("data-clue-card")) return at(150, 120);
        return at(0, 0);
      },
    );
    const { user } = play();
    await user.type(field(), "co");
    expect(screen.getByRole("listbox")).toBeVisible();
    expect(
      document.querySelector('[data-round="mystery"]'),
    ).not.toHaveAttribute("data-keyboard");
    // The field's bottom (388), three 48 px rows and the list's edges (10)
    // end at 542: 150 past the bottom edge, less its 8 px gap.
    expect(scrollBy).toHaveBeenCalledWith({ top: 150, behavior: "instant" });
    const fieldBottom = 330 + 58 - scrolled;
    expect(fieldBottom + 3 * 48 + 10).toBeLessThanOrEqual(400);
    // The clue's top stays below the top edge.
    expect(150 - scrolled).toBeGreaterThanOrEqual(0);
    // The list holds the whole rows that fit: three (9rem), and its edges.
    const height = screen.getByRole("listbox").style.maxHeight;
    expect(height).toMatch(/^calc\(/);
    expect(height).toContain("9rem");
    expect(height).toContain("10px");
  });

  it("R1-03 never scrolls the field under the sticky header when it and three tall rows can't all fit", async () => {
    // 360 by 640 at 200% text: a 113 px header, a 116 px field and rows
    // about 200 px tall. Field and three rows (726 px) can't fit in 640, and
    // "the block wins" had put the field, and what was typed, above the top.
    vi.stubGlobal(
      "visualViewport",
      Object.assign(new EventTarget(), {
        width: 360,
        height: 640,
        offsetTop: 0,
        offsetLeft: 0,
        pageTop: 0,
        pageLeft: 0,
        scale: 1,
      }),
    );
    vi.stubGlobal("innerHeight", 640);
    let scrolled = 0;
    const scrollBy = vi.fn((options: ScrollToOptions) => {
      scrolled += options.top ?? 0;
    });
    vi.stubGlobal("scrollBy", scrollBy);
    const header = document.createElement("header");
    header.style.position = "sticky";
    document.body.prepend(header);
    const at = (top: number, height: number) =>
      DOMRect.fromRect({ x: 0, y: top - scrolled, width: 328, height });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        // Sticky: it stays at the top whatever the scroll.
        if (this === header)
          return DOMRect.fromRect({ width: 360, height: 113 });
        if (this.hasAttribute("data-field-frame")) return at(500, 116);
        if (this.hasAttribute("data-clue-card")) return at(300, 180);
        if (this.getAttribute("role") === "option") return at(0, 200);
        return at(0, 0);
      },
    );
    try {
      const { user } = playFilm();
      await user.type(field(), "the");
      expect(screen.getByRole("listbox")).toBeVisible();
      // The field's top stops 8 px under the header (121): 379 px down,
      // where three rows would have needed 594.
      expect(scrollBy).toHaveBeenLastCalledWith({
        top: 379,
        behavior: "instant",
      });
      expect(500 - scrolled).toBeGreaterThanOrEqual(113);
      // One whole 200 px row fits under the field (237 to 640), with the
      // list's edges.
      expect(screen.getByRole("listbox").style.maxHeight).toBe("210px");
    } finally {
      header.remove();
    }
  });

  it("D9 keeps a press on Next clue from blurring the field, so a closing list can't move it from under the pointer", async () => {
    // Desktop: with "zzzz" typed, the press blurred the field, "No matches"
    // closed, Next clue jumped up and the release landed elsewhere.
    const { user, onIntent } = playFilm();
    await user.type(field(), "zzzz");
    expect(
      screen.getByText("No matches. Try another spelling, or use Next clue."),
    ).toBeVisible();
    // A prevented mousedown keeps focus, and the layout, where they are.
    expect(fireEvent.mouseDown(nextClue())).toBe(false);
    expect(field()).toHaveFocus();
    await user.click(nextClue());
    expect(onIntent).toHaveBeenLastCalledWith({
      family: "mystery",
      kind: "next_clue",
    });
    expect(document.querySelector('[data-round="mystery"]')).toHaveAttribute(
      "data-clue",
      "2",
    );
    // Focus then moves to the new clue, as after any Next clue.
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    expect(field()).toHaveValue("zzzz");
  });

  it("R1-13 picks clue-4 options by letter, and by digit only when no option reads as a number", async () => {
    // Dee pressed 4 for "four bridges" and locked in option D, 15.
    const numbers = lastClue(["2", "4", "9", "15"]);
    const first = renderWithUser(<MysteryRound {...numbers} />);
    await first.user.keyboard("4");
    expect(numbers.onIntent).not.toHaveBeenCalled();
    await first.user.keyboard("b");
    expect(numbers.onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "pick",
      option: 1,
    });
    expect(
      screen.getByRole("group", { name: "Pick one of four" }),
    ).toHaveAccessibleDescription("Keys A to D pick.");
    first.unmount();

    const names = lastClue([
      "Odile Marsh",
      "Liesl Varo",
      "Ennis Ward",
      "Mira Tolland",
    ]);
    const second = renderWithUser(<MysteryRound {...names} />);
    await second.user.keyboard("3");
    expect(names.onIntent).toHaveBeenLastCalledWith({
      family: "mystery",
      kind: "pick",
      option: 2,
    });
    await second.user.keyboard("C");
    expect(names.onIntent).toHaveBeenCalledTimes(2);
    expect(names.onIntent).toHaveBeenLastCalledWith({
      family: "mystery",
      kind: "pick",
      option: 2,
    });
    expect(
      screen.getByRole("group", { name: "Pick one of four" }),
    ).toHaveAccessibleDescription("Keys A to D, or 1 to 4, pick.");
    // One key hint per option: the badge's letter, and no second key cap.
    const group = screen.getByRole("group", { name: "Pick one of four" });
    expect(group.querySelectorAll("kbd")).toHaveLength(0);
    for (const option of within(group).getAllByRole("button")) {
      expect(option).not.toHaveAttribute("aria-keyshortcuts");
    }
  });

  it("R1-13 leaves the keys alone with shortcuts off, and never picks an already-guessed option", async () => {
    const off = lastClue([
      "Odile Marsh",
      "Liesl Varo",
      "Ennis Ward",
      "Mira Tolland",
    ]);
    off.context = {
      ...off.context,
      settings: { ...TEST_SETTINGS, shortcuts: false },
    };
    const first = renderWithUser(<MysteryRound {...off} />);
    await first.user.keyboard("a1");
    expect(off.onIntent).not.toHaveBeenCalled();
    first.unmount();

    const guessed = lastClue([
      "Odile Marsh",
      "Liesl Varo",
      "Ennis Ward",
      "Mira Tolland",
    ]);
    if (guessed.open.family !== "mystery" || guessed.open.options === null) {
      throw new Error("no options");
    }
    guessed.open.options[1] = {
      index: 1,
      label: "Liesl Varo",
      alreadyGuessed: true,
    };
    const second = renderWithUser(<MysteryRound {...guessed} />);
    await second.user.keyboard("b2");
    expect(guessed.onIntent).not.toHaveBeenCalled();
  });

  it("R1-22 stamps Knew it. only for a solve on clue 1 or 2 with no miss, Got there. after a miss or on clue 3", async () => {
    // Next clue, then the answer on clue 2: no miss.
    let view = play();
    await view.user.click(nextClue());
    await guess(view.user, "Odile", "Odile Marsh");
    expect(within(reveal()).getByText("Knew it.")).toBeInTheDocument();
    expect(liveText()).toBe(
      "Knew it. Odile Marsh. Solved on clue 2, 3 points.",
    );
    view.unmount();

    // A wrong guess, then the answer on clue 2: "Knew it." felt unearned.
    view = play();
    await guess(view.user, "Corin", "Corin Ashby");
    await guess(view.user, "Odile", "Odile Marsh");
    expect(within(reveal()).getByText("Got there.")).toBeInTheDocument();
    expect(within(reveal()).queryByText("Knew it.")).toBeNull();
    expect(liveText()).toBe(
      "Got there. Odile Marsh. Solved on clue 2, 3 points.",
    );
    view.unmount();

    // Two Next clues, then the answer on clue 3.
    view = play();
    await view.user.click(nextClue());
    await view.user.click(nextClue());
    await guess(view.user, "Odile", "Odile Marsh");
    expect(within(reveal()).getByText("Got there.")).toBeInTheDocument();
    view.unmount();

    // The answer picked from the four options: "Got it.".
    view = play();
    for (let i = 0; i < 3; i += 1) await view.user.click(nextClue());
    await view.user.click(
      screen.getByRole("button", { name: "A. Odile Marsh" }),
    );
    expect(within(reveal()).getByText("Got it.")).toBeInTheDocument();
  });

  it("R1-23 keeps the typing and its list through Next clue, and still clears after a wrong guess", async () => {
    const { user } = play();
    await user.type(field(), "Mir");
    await user.click(nextClue());
    // Focus went to clue 2's heading; the typing waited in the field.
    expect(screen.getByRole("heading", { level: 2 })).toHaveAccessibleName(
      `Clue 2: ${mystery.clues[1]}`,
    );
    expect(field()).toHaveValue("Mir");
    // Back in the field, its list is back too.
    await user.click(field());
    const row = screen.getByRole("option", { name: /^Mira Tolland/ });
    expect(row).toBeVisible();
    // A wrong guess still clears the field, which keeps focus.
    await user.click(row);
    await user.click(guessButton());
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
  });

  it("R1-24 names the type with a short noun in the placeholder", () => {
    playFilm({
      meta: mysteryMeta({ answerType: "element", category: "sci", ordinal: 1 }),
    });
    // Priya, Marcus and Lena saw "Start typing a chemic…".
    expect(field()).toHaveAttribute("placeholder", "Start typing an element");
    // The title keeps the full words.
    expect(
      screen.getByRole("heading", { level: 1, name: /A chemical element$/ }),
    ).toBeInTheDocument();
  });

  it("R1-28 shows a chosen title in full under the field, so the word that tells the decoys apart stays in sight", async () => {
    const { user } = playFilm();
    await user.type(field(), "broken");
    await user.click(
      screen.getByRole("option", { name: /^The Broken Lighthouse/ }),
    );
    expect(field()).toHaveValue("The Broken Lighthouse (1972)");
    const pick = document.querySelector("[data-pick]");
    expect(pick).toHaveTextContent("Your pick: The Broken Lighthouse (1972)");
    // The field says it to a screen reader already; the line is for the eyes.
    expect(pick).toHaveAttribute("aria-hidden", "true");
    // Editing the name drops the pick, and the line with it.
    await user.keyboard("{Backspace}");
    expect(document.querySelector("[data-pick]")).toBeNull();
  });

  it("R1-29 highlights a lone match so Enter picks it and a second Enter guesses, and Guess with no pick says how", async () => {
    const { user, onIntent } = play();
    // Guess pressed with nothing picked: the hint shows, and is said.
    await user.type(field(), "co");
    await user.click(guessButton());
    const combobox = document.querySelector("[data-combobox]") as HTMLElement;
    const hint = within(combobox).getByText(
      "Pick a name from the list, then Guess.",
    );
    expect(hint).toHaveAttribute("data-hint", "shown");
    expect(hint).not.toHaveClass("sr-only");
    expect(liveText()).toBe("Pick a name from the list, then Guess.");
    expect(onIntent).not.toHaveBeenCalled();

    // One selectable match left: it is highlighted, so Enter picks it...
    await user.clear(field());
    await user.type(field(), "odile");
    const row = screen.getByRole("option", { name: /^Odile Marsh/ });
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(field()).toHaveAttribute("aria-activedescendant", row.id);
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue("Odile Marsh");
    expect(hint).not.toHaveAttribute("data-hint");
    // ...and a second Enter guesses.
    await user.keyboard("{Enter}");
    expect(onIntent).toHaveBeenCalledWith({
      family: "mystery",
      kind: "guess",
      entityId: mystery.answer,
    });
  });

  it("R1-29 never highlights namesakes, and counts only the rows that can still be picked", async () => {
    const { user } = play();
    await user.type(field(), "ada morrow");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(field()).not.toHaveAttribute("aria-activedescendant");

    await user.clear(field());
    await guess(user, "Corin", "Corin Ashby");
    // "corin": Corin Ashby (guessed) and, by a typo, Coren Dale: one to pick.
    await user.type(field(), "corin");
    const coren = screen.getByRole("option", { name: /^Coren Dale/ });
    expect(coren).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("option", { name: /^Corin Ashby/ }),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("R1-32 puts Next clue after the field, so the first Tab from the heading reaches the field, and / goes there too", async () => {
    const { user } = play();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    // Dee's first Tab landed on Next clue, which costs a point.
    await user.tab();
    expect(field()).toHaveFocus();
    expect(before(field(), guessButton())).toBe(true);
    expect(before(guessButton(), nextClue())).toBe(true);
    expect(nextClue().closest("[data-rung]")).toBeNull();
    // "/" from anywhere in the round reaches the field, and types nothing.
    nextClue().focus();
    await user.keyboard("/");
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue("");
  });

  it("R1-33 keeps the category chip in one place whatever the title, and never strands a kicker's dot", () => {
    play();
    const title = screen.getByRole("heading", { level: 1 });
    const chip = document.querySelector("[data-category-chip]");
    // Its own line under the title, not after it: the title's length can't move it.
    expect(chip).toHaveTextContent("History");
    expect(chip?.contains(title)).toBe(false);
    expect(title.parentElement?.contains(chip)).toBe(true);
    expect(before(title, chip as Element)).toBe(true);
    // Each dot sits in the gap before its part, inside a box that clips it
    // when the part starts a line.
    const kicker = screen.getByText("Mystery 2 of 3").parentElement;
    expect(kicker?.className).toMatch(/\boverflow-hidden\b/);
    const dot = kicker?.querySelector("[data-kicker-dot]");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot?.className).toMatch(/\babsolute\b/);
    expect(dot?.className).toMatch(/\bright-full\b/);
  });

  it("R1-33 turns a stamp about its middle with room above, and rings the clue card rather than a square inside it", async () => {
    const { user } = play();
    await guess(user, "Corin", "Corin Ashby");
    const stamp = document.querySelector("[data-stamp]");
    expect(stamp?.className).toMatch(/-rotate-\[2\.5deg\]/);
    expect(stamp?.className).not.toMatch(/origin-left/);
    expect(stamp?.className).toMatch(/\bmy-2\b/);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toMatch(/\boutline-none\b/);
    expect(heading.closest("[data-clue-card]")?.className).toContain(
      "has-[h2:focus-visible]:outline-[3px]",
    );
  });

  it("R1-33 never shows +0 while a solve's points wait to count up", async () => {
    vi.useFakeTimers();
    try {
      const props: RoundComponentProps = {
        ...lastClue([
          "Odile Marsh",
          "Liesl Varo",
          "Ennis Ward",
          "Mira Tolland",
        ]),
        status: "revealed",
        reveal: {
          family: "mystery",
          answer: { entityId: mystery.answer, display: "Odile Marsh" },
          clues: mystery.clues,
          solvedOn: 2,
          points: 3,
          pickedOption: null,
          explanation: mystery.explanation,
          learnMore: mystery.learnMore,
          sourceLabels: [],
          crowd: null,
        },
      };
      props.context = {
        ...props.context,
        settings: { ...TEST_SETTINGS, reducedMotion: false },
      };
      render(<MysteryRound {...props} />);
      const points = () =>
        document.querySelector<HTMLElement>("[data-reveal] [aria-hidden]");
      const counter = [
        ...document.querySelectorAll<HTMLElement>("[data-reveal] span"),
      ].find((span) => span.textContent?.startsWith("+"));
      if (counter === undefined) throw new Error("no points counter");
      // Waiting: the final figure holds the space, unseen. Never "+0".
      expect(counter).toHaveTextContent("+3");
      expect(counter).toHaveClass("invisible");
      expect(points()).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(450);
      });
      expect(counter.textContent).not.toBe("+0");
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(counter).toHaveTextContent("+3");
      expect(counter).not.toHaveClass("invisible");
    } finally {
      vi.useRealTimers();
    }
  });

  it("R1-33 brings the four options into view under the last clue, as far as the clue's top allows", async () => {
    // Lena at 360 by 640: options C and D sat below the fold.
    vi.stubGlobal("innerHeight", 640);
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute("data-options-area")) {
          return DOMRect.fromRect({ x: 0, y: 420, width: 330, height: 360 });
        }
        if (this.hasAttribute("data-clue-card")) {
          return DOMRect.fromRect({ x: 0, y: 260, width: 300, height: 110 });
        }
        return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
      },
    );
    const { user } = play();
    for (let i = 0; i < 3; i += 1) await user.click(nextClue());
    expect(
      screen.getByRole("group", { name: "Pick one of four" }),
    ).toBeVisible();
    // The options end at 780, 148 past the bottom edge (640 less 8); the
    // clue's top (260) can rise that far and still sit in view.
    expect(scrollBy).toHaveBeenCalledWith({ top: 148, behavior: "instant" });
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
  });

  it("R1-37 lists typo matches last, each marked Similar spelling", async () => {
    // Priya typed "light" and saw "Halvessa Nights" among the lighthouses.
    const { user } = playFilm();
    await user.type(field(), "light");
    const rows = screen.getAllByRole("option");
    const typo = rows.map((row) => row.hasAttribute("data-typo"));
    expect(typo).toContain(true);
    expect(typo).toContain(false);
    // Every real match comes before every typo match.
    expect(typo.indexOf(true)).toBeGreaterThan(typo.lastIndexOf(false));
    const halvessa = screen.getByRole("option", { name: /^Halvessa Nights/ });
    expect(halvessa).toHaveAttribute("data-typo");
    expect(halvessa).toHaveAccessibleName(
      "Halvessa Nights, 1981, Similar spelling",
    );
    for (const row of rows.filter((r) => !r.hasAttribute("data-typo"))) {
      expect(within(row).queryByText("Similar spelling")).toBeNull();
    }
  });
});
