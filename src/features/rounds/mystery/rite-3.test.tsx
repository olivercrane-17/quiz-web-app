/**
 * The Mystery after RITE round 3 (docs/playtests/rite-3.md §6, §7 and §9;
 * the decisions memo §26, D28): each test title starts with the finding it
 * reproduces. What needs a real layout (the legend's reserved line, the
 * kicker's accessible name across its flex items, Escape in a browser) is
 * also measured in e2e/daily/mystery-rite-3.spec.ts.
 */
import { act, screen, waitFor, within } from "@testing-library/react";
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
import { clearAnnouncements } from "@/ui/announce";
import { renderWithUser } from "@/test/render";

import { answerListHandleOf, type MysteryAnswerList } from "../answer-list";
import type { RoundComponentProps } from "../contracts";
import { MysteryRound } from ".";
import { RoundKicker } from "./kicker";
import { TYPING_MS } from "./options";
import { MysteryHarness, TEST_SETTINGS, mysteryMeta } from "./testing";

let people: MysteryAnswerList;
let peopleLookup: EntityLookup;
let odile: MysteryContent;

beforeAll(async () => {
  const person = await loadFixtureList("person");
  if (person === null) throw new Error("no fixture list");
  people = answerListHandleOf(person.list);
  peopleLookup = entityLookupOf(person);
  const parsed = parseItemId("fx.m.hist.0101");
  const found = parsed === null ? undefined : FIXTURE_MYSTERIES.get(parsed);
  if (found === undefined) throw new Error("no fixture mystery");
  odile = found;
});

beforeEach(() => {
  clearAnnouncements();
});

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

const LAST_LEAD =
  "Last clue. Pick one of four. One pick: a wrong one scores 0.";
const LEGEND = "Keys A to D choose. Enter locks in.";

const field = () => screen.getByRole("combobox", { name: "Your guess" });
const optionsGroup = () =>
  screen.getByRole("group", {
    name: /^Clue 4:/,
    description: `${LAST_LEAD} ${LEGEND}`,
  });
const optionButtons = () => within(optionsGroup()).getAllByRole("button");
const legend = () => document.querySelector("[data-keys-legend]");

function picks(onIntent: RoundComponentProps["onIntent"]) {
  return vi
    .mocked(onIntent)
    .mock.calls.map(([intent]) => intent)
    .filter((intent) => intent.family === "mystery" && intent.kind === "pick");
}

/** Odile Marsh's Mystery, played through the real plugin. */
function play(meta = mysteryMeta({ ordinal: 1, difficulty: "easy" })) {
  const onIntent = vi.fn<(intent: RoundIntent) => void>();
  const view = renderWithUser(
    <MysteryHarness
      content={odile}
      entities={peopleLookup}
      list={people}
      meta={meta}
      onIntent={onIntent}
    />,
  );
  return { ...view, onIntent };
}

/** Next clue three times, from the keyboard as Dee did: clue 4 opens. */
async function toClue4(user: UserEvent) {
  for (let i = 0; i < 3; i += 1) {
    const next = screen.getByRole("button", { name: /^(Next|Last) clue/ });
    act(() => {
      next.focus();
    });
    await user.keyboard("{Enter}");
  }
  expect(document.querySelector('[data-round="mystery"]')).toHaveAttribute(
    "data-clue",
    "4",
  );
}

/** The option index (as picks name it) of the button at `position`. */
function indexAt(position: number): number {
  const item = optionButtons()[position]?.closest("[data-option]");
  const value = item?.getAttribute("data-option");
  if (value === null || value === undefined) throw new Error("no option");
  return Number(value);
}

describe("clue 4's keys from where focus lands (D28, R3-05)", () => {
  it("R3-05 when clue 4 opens, focus is on the options group, labelled by the clue and described by its line and the legend, which shows", async () => {
    const { user } = play();
    await toClue4(user);
    const group = optionsGroup();
    expect(document.activeElement).toBe(group);
    expect(group).toHaveAccessibleName(`Clue 4: ${odile.clues[3]}`);
    expect(group).toHaveAccessibleDescription(`${LAST_LEAD} ${LEGEND}`);
    // The legend is drawn from the start, in its own line: no class hides it
    // until a key or a focus ring, so nothing moves when one arrives.
    const line = legend();
    expect(line).toHaveTextContent(LEGEND);
    expect(line).toHaveAttribute("data-keys-legend", "shown");
    expect(line?.className).not.toMatch(/(^| )hidden( |$)|:block/);
    const drawn = line?.className;
    await user.keyboard("{Escape}");
    act(() => {
      optionButtons()[0]?.focus();
    });
    expect(legend()).toBe(line);
    expect(legend()?.className).toBe(drawn);
  });

  it("R3-05 Dee's test c: three Next clues, then A and Enter with no Tab send exactly one pick, for A", async () => {
    const { user, onIntent } = play();
    await toClue4(user);
    const a = indexAt(0);
    await user.keyboard("a");
    expect(optionButtons()[0]).toHaveFocus();
    expect(picks(onIntent)).toEqual([]);
    await user.keyboard("{Enter}");
    expect(picks(onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: a },
    ]);
    expect(document.querySelector("[data-reveal]")).not.toBeNull();
  });

  it("R3-05 the same key twice from the group locks in that option, one pick", async () => {
    const { user, onIntent } = play();
    await toClue4(user);
    const c = indexAt(2);
    await user.keyboard("c");
    expect(optionButtons()[2]).toHaveFocus();
    expect(picks(onIntent)).toEqual([]);
    await user.keyboard("c");
    expect(picks(onIntent)).toEqual([
      { family: "mystery", kind: "pick", option: c },
    ]);
  });

  it("R3-05 Dee's test b, kept: typing Cartographer from where clue 4 puts focus commits nothing", async () => {
    const { user, onIntent } = play();
    await toClue4(user);
    expect(optionsGroup()).toHaveFocus();
    await user.keyboard("Cartographer");
    expect(picks(onIntent)).toEqual([]);
    expect(document.querySelector("[data-reveal]")).toBeNull();
    expect(document.querySelector("[data-chosen]")).toBeNull();
    for (const button of optionButtons()) {
      expect(button).toHaveAttribute("data-state", "idle");
    }
  });

  it("R3-05 a name with a space, typed from where clue 4 puts focus, commits nothing", async () => {
    const { user, onIntent } = play();
    await toClue4(user);
    await user.keyboard("Odile Marsh");
    expect(picks(onIntent)).toEqual([]);
    expect(document.querySelector("[data-reveal]")).toBeNull();
    // And an initial with a space, as "B Smith".
    act(() => {
      optionsGroup().focus();
    });
    await user.keyboard("B Smith");
    expect(picks(onIntent)).toEqual([]);
    expect(document.querySelector("[data-reveal]")).toBeNull();
  });

  it("R3-05 on the group itself, Enter and Space pick nothing; a first Space may scroll the page, a Space inside a typed name does nothing", async () => {
    const { user, onIntent } = play();
    await toClue4(user);
    const group = optionsGroup();
    await user.keyboard("{Enter}");
    const space = () =>
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      });
    // A first Space is the page's scroll key, as anywhere else (the options
    // can sit below the fold at 200% text on a phone).
    const first = space();
    act(() => {
      group.dispatchEvent(first);
    });
    expect(first.defaultPrevented).toBe(false);
    // A Space straight after it is typing, and does nothing.
    const second = space();
    act(() => {
      group.dispatchEvent(second);
    });
    expect(second.defaultPrevented).toBe(true);
    expect(group).toHaveFocus();
    expect(picks(onIntent)).toEqual([]);
    expect(document.querySelector("[data-chosen]")).toBeNull();
  });

  describe("R3-05 Enter after a typed name (D20's typing guard, after review)", () => {
    /** Moves performance.now on, as a pause between keys would. */
    function pausable() {
      const real = performance.now.bind(performance);
      let offset = 0;
      vi.spyOn(performance, "now").mockImplementation(() => real() + offset);
      return () => {
        offset += TYPING_MS + 200;
      };
    }

    for (const name of [
      "Cartographer",
      "Bram",
      "Mira Tolland",
      "Odile Marsh",
    ]) {
      it(`R3-05 ${name} then Enter, from where clue 4 puts focus, sends no pick`, async () => {
        const { user, onIntent } = play();
        await toClue4(user);
        expect(optionsGroup()).toHaveFocus();
        await user.keyboard(`${name}{Enter}`);
        expect(picks(onIntent)).toEqual([]);
        expect(document.querySelector("[data-reveal]")).toBeNull();
      });

      it(`R3-05 ${name}, a pause longer than the typing window, then Enter sends no pick`, async () => {
        const pause = pausable();
        const { user, onIntent } = play();
        await toClue4(user);
        await user.keyboard(name);
        pause();
        await user.keyboard("{Enter}");
        expect(picks(onIntent)).toEqual([]);
        expect(document.querySelector("[data-reveal]")).toBeNull();
      });
    }

    it("R3-05 a then Enter still sends one pick, for A", async () => {
      const { user, onIntent } = play();
      await toClue4(user);
      const a = indexAt(0);
      await user.keyboard("a{Enter}");
      expect(picks(onIntent)).toEqual([
        { family: "mystery", kind: "pick", option: a },
      ]);
    });

    it("R3-05 cc still sends one pick, for C", async () => {
      const { user, onIntent } = play();
      await toClue4(user);
      const c = indexAt(2);
      await user.keyboard("cc");
      expect(picks(onIntent)).toEqual([
        { family: "mystery", kind: "pick", option: c },
      ]);
    });

    it("R3-05 Tab, then Odile Marsh and Enter, sends nothing", async () => {
      const { user, onIntent } = play();
      await toClue4(user);
      await user.tab();
      expect(optionButtons()[0]).toHaveFocus();
      await user.keyboard("Odile Marsh{Enter}");
      expect(picks(onIntent)).toEqual([]);
      expect(document.querySelector("[data-reveal]")).toBeNull();
    });

    it("R3-05 a name ending on an option's letter moves focus there unmarked; Enter sends nothing, at once or after a pause, until a key chooses", async () => {
      const pause = pausable();
      const { user, onIntent } = play();
      await toClue4(user);
      const b = indexAt(1);
      // D chooses, e is typing, so b only moves focus to B: no mark claims
      // that Enter locks it in.
      await user.keyboard("Deb");
      expect(optionButtons()[1]).toHaveFocus();
      expect(document.querySelector("[data-chosen]")).toBeNull();
      expect(optionButtons()[1]).not.toHaveAttribute("aria-pressed");
      await user.keyboard("{Enter}");
      expect(picks(onIntent)).toEqual([]);
      pause();
      await user.keyboard("{Enter}");
      expect(picks(onIntent)).toEqual([]);
      // A key on its own, after the typing, chooses; Enter locks that in.
      pause();
      await user.keyboard("b");
      expect(document.querySelector("[data-chosen]")).toHaveAttribute(
        "data-option",
        String(b),
      );
      await user.keyboard("{Enter}");
      expect(picks(onIntent)).toEqual([
        { family: "mystery", kind: "pick", option: b },
      ]);
    });

    it("R3-05 changing one's mind with keys alone (b, d, a) still marks each, and Enter locks in the last", async () => {
      const { user, onIntent } = play();
      await toClue4(user);
      const a = indexAt(0);
      await user.keyboard("bda");
      expect(document.querySelector("[data-chosen]")).toHaveAttribute(
        "data-option",
        String(a),
      );
      await user.keyboard("{Enter}");
      expect(picks(onIntent)).toEqual([
        { family: "mystery", kind: "pick", option: a },
      ]);
    });

    it("R3-05 after typing, a key pressed on its own after a pause chooses again, and Enter locks that in", async () => {
      const pause = pausable();
      const { user, onIntent } = play();
      await toClue4(user);
      const a = indexAt(0);
      await user.keyboard("Bram");
      pause();
      await user.keyboard("{Enter}");
      expect(picks(onIntent)).toEqual([]);
      pause();
      await user.keyboard("a{Enter}");
      expect(picks(onIntent)).toEqual([
        { family: "mystery", kind: "pick", option: a },
      ]);
    });

    it("R3-05 Tab to an option with nothing typed, then Enter, locks it in", async () => {
      const { user, onIntent } = play();
      await toClue4(user);
      const a = indexAt(0);
      await user.tab();
      await user.keyboard("{Enter}");
      expect(picks(onIntent)).toEqual([
        { family: "mystery", kind: "pick", option: a },
      ]);
    });
  });

  it("R3-05 while the options show, the run machine's clue focus lands on their group, not the heading", async () => {
    const { user } = play();
    // Before the options, the clue's heading is the target.
    expect(document.querySelector('[data-focus-target="clue_heading"]')).toBe(
      screen.getByRole("heading", { level: 2 }),
    );
    await toClue4(user);
    const targets = document.querySelectorAll(
      '[data-focus-target="clue_heading"]',
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe(optionsGroup());
  });

  it("R3-05 with shortcuts off, focus still goes to the group, with no legend and no keys", async () => {
    const onIntent = vi.fn<(intent: RoundIntent) => void>();
    const { user } = renderWithUser(
      <MysteryHarness
        content={odile}
        entities={peopleLookup}
        list={people}
        meta={mysteryMeta({ ordinal: 1 })}
        settings={{ ...TEST_SETTINGS, shortcuts: false }}
        onIntent={onIntent}
      />,
    );
    await toClue4(user);
    const group = screen.getByRole("group", {
      name: /^Clue 4:/,
      description: LAST_LEAD,
    });
    expect(group).toHaveFocus();
    expect(legend()).toBeNull();
    await user.keyboard("a{Enter}");
    expect(picks(onIntent)).toEqual([]);
  });

  it("R3-05 typing into the guess field before clue 4 still never reaches an option", async () => {
    const { user, onIntent } = play();
    // Two Next clues, then typing in the field: no options yet, nothing picked.
    for (let i = 0; i < 2; i += 1) {
      await user.click(
        screen.getByRole("button", { name: /^(Next|Last) clue/ }),
      );
    }
    await user.click(field());
    await user.keyboard("abc");
    expect(picks(onIntent)).toEqual([]);
    expect(screen.queryByRole("group", { name: /^Clue/ })).toBeNull();
  });
});

describe("screen-reader text (R3-09)", () => {
  /**
   * What a screen reader reads in `element`: its text without aria-hidden
   * parts, with a space at every flex item, as a browser's accessibility
   * tree puts one between block-level boxes (a flex item is one).
   */
  function spokenText(element: Element): string {
    const parts: string[] = [];
    const walk = (node: Node, inFlex: boolean) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent ?? "");
        return;
      }
      if (!(node instanceof Element)) return;
      if (node.getAttribute("aria-hidden") === "true") return;
      if (inFlex) parts.push(" ");
      const flex = /(^| )(inline-)?flex( |$)/.test(node.className);
      for (const child of node.childNodes) walk(child, flex);
      if (inFlex) parts.push(" ");
    };
    for (const child of element.childNodes) walk(child, true);
    return parts.join("").replace(/\s+/g, " ").trim();
  }

  it("R3-09 the Mystery's kicker reads Mystery 1 of 3, Easy, with no stray separators", () => {
    play();
    const kicker = document.querySelector("[data-kicker]");
    if (kicker === null) throw new Error("no kicker");
    expect(spokenText(kicker)).toBe("Mystery 1 of 3, Easy");
    expect(spokenText(kicker)).not.toMatch(/\s,|·/);
    // The dot is generated content with empty alternative text: no text
    // node anywhere, so nothing reads or copies it.
    expect(kicker.textContent).not.toContain("·");
    const dot = kicker.querySelector("[data-kicker-dot]");
    expect(dot?.textContent).toBe("");
    expect(dot?.className).toContain("before:content-['·'_/_'']");
  });

  it("R3-09 the reveal's kicker reads Mystery 2 of 3, History, a person", () => {
    const { container } = renderWithUser(
      <RoundKicker meta={mysteryMeta()} withCategory />,
    );
    const kicker = container.querySelector("[data-kicker]");
    if (kicker === null) throw new Error("no kicker");
    expect(spokenText(kicker)).toBe("Mystery 2 of 3, History, a person");
  });

  it("R3-09 a kicker with one part has no comma", () => {
    const { container } = renderWithUser(
      <RoundKicker meta={mysteryMeta({ difficulty: null })} />,
    );
    const kicker = container.querySelector("[data-kicker]");
    if (kicker === null) throw new Error("no kicker");
    expect(spokenText(kicker)).toBe("Mystery 2 of 3");
  });

  it("R3-09 Sam: pressing B marks B with aria-pressed, and only B, until the mark clears", async () => {
    const { user, onIntent } = play();
    await toClue4(user);
    for (const button of optionButtons()) {
      expect(button).not.toHaveAttribute("aria-pressed");
    }
    await user.keyboard("b");
    const [a, b, c, d] = optionButtons();
    expect(b).toHaveFocus();
    expect(b).toHaveAttribute("aria-pressed", "true");
    for (const other of [a, c, d]) {
      expect(other).not.toHaveAttribute("aria-pressed");
    }
    // The mark moves with a key, and Escape clears it.
    await user.keyboard("d");
    expect(d).toHaveAttribute("aria-pressed", "true");
    expect(b).not.toHaveAttribute("aria-pressed");
    await user.keyboard("{Escape}");
    for (const button of optionButtons()) {
      expect(button).not.toHaveAttribute("aria-pressed");
    }
    expect(picks(onIntent)).toEqual([]);
  });

  it("R3-09 a locked option no longer claims to be pressed while it is judged", () => {
    const options = ["Odile Marsh", "Liesl Varo", "Ennis Ward", "Mira Tolland"];
    const props: RoundComponentProps = {
      meta: mysteryMeta({ ordinal: 1 }),
      open: {
        family: "mystery",
        index: 0,
        clue: 4,
        clues: odile.clues.slice(0, 4),
        wrongGuesses: [],
        options: options.map((label, index) => ({
          index,
          label,
          alreadyGuessed: false,
        })),
        issuedAt: 0,
      },
      client: null,
      status: "judging",
      reveal: null,
      error: null,
      onIntent: vi.fn(),
      onContinue: vi.fn(),
      continueLabel: "Next mystery",
      context: {
        mode: "daily",
        sealed: true,
        list: people,
        itemRef: "daily:46:0",
        settings: TEST_SETTINGS,
      },
    };
    renderWithUser(<MysteryRound {...props} />);
    for (const button of optionButtons()) {
      expect(button).not.toHaveAttribute("aria-pressed");
    }
  });
});

describe("Escape in the suggestion list (R3-14)", () => {
  it("R3-14 Marcus: type co, Escape closes the list and keeps the text; Escape again clears the field", async () => {
    const { user } = play();
    await user.click(field());
    await user.keyboard("co");
    expect(field()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(field()).toHaveValue("co");
    expect(field()).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(field()).toHaveValue("");
    expect(field()).toHaveAttribute("aria-expanded", "false");
  });

  it("R3-14 with the on-screen keyboard open (the compact layout), Escape closes the list and keeps the text; Escape again clears the field", async () => {
    // Marcus played on an Android-sized phone, by touch: the keyboard was up.
    const viewport = new FakeViewport();
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("scrollBy", vi.fn());
    const { user } = play();
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
    await user.keyboard("co");
    expect(field()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(field()).toHaveValue("co");
    expect(field()).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(field()).toHaveValue("");
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector('[data-round="mystery"]')).toHaveAttribute(
      "data-keyboard",
      "open",
    );
  });

  it("R3-14 the list stays closed after Escape until the player types or arrows again", async () => {
    const { user } = play();
    await user.click(field());
    await user.keyboard("co");
    await user.keyboard("{Escape}");
    expect(field()).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{ArrowDown}");
    expect(field()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}r");
    expect(field()).toHaveAttribute("aria-expanded", "true");
    expect(field()).toHaveValue("cor");
  });
});
