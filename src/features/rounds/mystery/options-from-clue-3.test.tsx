/**
 * PRD Q3 moves the options to clue 3 with a config change only
 * (`options_from_clue` in src/config/shared.json, which the server reads
 * too). This file plays a Mystery with the config at 3.
 */
import { screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  entityLookupOf,
  loadFixtureList,
} from "@/content/loaders/fixtures/lists";
import { FIXTURE_MYSTERIES } from "@/content/loaders/fixtures/sealed";
import { mysteryPlugin, type MysteryClient } from "@/engine/rounds/mystery";
import type { EntityLookup } from "@/engine/rounds/types";
import { parseItemId, type MysteryContent } from "@/engine/types";
import type * as Tunables from "@/config/tunables";
import { renderWithUser } from "@/test/render";

import { answerListHandleOf, type MysteryAnswerList } from "../answer-list";
import { MysteryHarness, mysteryMeta } from "./testing";

vi.mock("@/config/tunables", async (importOriginal) => {
  const actual = await importOriginal<typeof Tunables>();
  return {
    ...actual,
    TUNABLES: {
      ...actual.TUNABLES,
      daily: { ...actual.TUNABLES.daily, optionsFromClue: 3 },
    },
  };
});

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
  if (found === undefined) throw new Error("no fixture mystery");
  mystery = found;
});

function play() {
  const clients: MysteryClient[] = [];
  const view = renderWithUser(
    <MysteryHarness
      content={mystery}
      entities={lookup}
      list={people}
      optionsFromClue={3}
      onClient={(client) => clients.push(client)}
    />,
  );
  return { ...view, clients };
}

const nextClue = () =>
  screen.getByRole("button", { name: /^(Next|Last) clue/ });
/** The button that sends the chosen option (D31). */
const lockIn = () => screen.getByRole("button", { name: /^Lock in/ });

describe("MysteryRound with options_from_clue 3", () => {
  it("AC-DLY-36 options replace typing from clue 3, a wrong pick there disables it on clue 4, and the share cells match", async () => {
    const { user, clients } = play();
    expect(nextClue()).toHaveAccessibleName("Next clue · then worth 3");
    await user.click(nextClue());
    expect(nextClue()).toHaveAccessibleName(
      "Next clue and options · then worth 2",
    );
    await user.click(nextClue());

    // Clue 3: the options replace the field, and the stake reads 2.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen.getByRole("img", { name: "Worth 2 points now" }),
    ).toBeInTheDocument();
    expect(nextClue()).toHaveAccessibleName("Last clue · then worth 1");
    const group = screen.getByRole("group", { name: /^Clue 3:/ });
    // Four options, and Lock in under them, waiting for a choice (D31).
    expect(within(group).getAllByRole("button")).toHaveLength(5);
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");

    // A wrong pick on clue 3 reveals clue 4 with that option disabled.
    await user.click(screen.getByRole("button", { name: "B. Liesl Varo" }));
    await user.click(lockIn());
    expect(
      screen.getByRole("img", { name: "Worth 1 point now" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "B. Liesl Varo Already guessed" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("button", { name: /^(Next|Last) clue/ }),
    ).toBeNull();

    // The new set starts with nothing chosen.
    expect(lockIn()).toHaveAccessibleName("Lock in");
    expect(lockIn()).toHaveAttribute("aria-disabled", "true");

    // Then the right one solves on clue 4 for 1 point.
    await user.click(screen.getByRole("button", { name: "A. Odile Marsh" }));
    await user.click(lockIn());
    const card = document.querySelector<HTMLElement>("[data-reveal]");
    expect(card).not.toBeNull();
    expect(
      within(card as HTMLElement).getByText("1 point"),
    ).toBeInTheDocument();
    const outcome = mysteryPlugin.outcome(
      clients.at(-1) as MysteryClient,
      mysteryMeta(),
    );
    expect(outcome?.cells).toEqual(["passed", "passed", "passed", "solved"]);
  });

  it("AC-DLY-36 a right pick on clue 3 scores 2 (component)", async () => {
    const { user, clients } = play();
    await user.click(nextClue());
    await user.click(nextClue());
    await user.click(screen.getByRole("button", { name: "A. Odile Marsh" }));
    await user.click(lockIn());
    const card = document.querySelector<HTMLElement>(
      "[data-reveal]",
    ) as HTMLElement;
    expect(
      within(card).getByText("Solved on clue 3", { exact: false }),
    ).toBeInTheDocument();
    expect(within(card).getByText("2 points")).toBeInTheDocument();
    // D10: "Got there." on clue 3, a pick included; "Got it." is clue 4's.
    expect(within(card).getByText("Got there.")).toBeInTheDocument();
    expect(within(card).queryByText("Got it.")).toBeNull();
    const outcome = mysteryPlugin.outcome(
      clients.at(-1) as MysteryClient,
      mysteryMeta(),
    );
    expect(outcome).toMatchObject({ solvedOn: 3, points: 2 });
    expect(outcome?.cells).toEqual(["passed", "passed", "solved", "unused"]);
  });
});
