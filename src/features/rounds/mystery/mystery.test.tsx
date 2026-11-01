import { act, screen, waitFor, within } from "@testing-library/react";
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
import { MysteryHarness, TEST_SETTINGS, mysteryMeta } from "./testing";
import { keyboardStateOf } from "./use-keyboard";

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
    expect(
      screen.getByText("No matches. Try another spelling, or tap Next clue."),
    ).toBeVisible();
    await waitFor(() => {
      expect(liveText()).toBe(
        "No matches. Try another spelling, or tap Next clue.",
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
    renderWithUser(<MysteryRound {...props} />);
    expect(
      screen.getByText("You've tried that one already. Pick another."),
    ).toBeInTheDocument();
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
  it("replaces the clue screen: Knew it., the clue, the points, all four clues and the actions", async () => {
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
    expect(within(card).getByText("Knew it.")).toBeInTheDocument();
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
    expect(
      screen.getByText("We couldn't check that guess. Try again."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onIntent).toHaveBeenLastCalledWith({
      family: "mystery",
      kind: "next_clue",
    });
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
    const props = base({ context: { ...base().context, list: failed } });
    const { user } = renderWithUser(<MysteryRound {...props} />);
    expect(
      screen.getByText(
        "We couldn't load the suggestions. You can still use Next clue and pick from four options at the end.",
      ),
    ).toBeInTheDocument();
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

  it("collapses older clues and moves Next clue beside the field", async () => {
    const viewport = new FakeViewport();
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("scrollBy", vi.fn());
    const { user } = play();
    await guess(user, "Corin", "Corin Ashby");
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
    expect(
      within(combobox).getByRole("button", { name: /^Next clue/ }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-rung="past"] p')?.className).toMatch(
      /line-clamp-1/,
    );
  });
});
