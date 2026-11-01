import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TUNABLES } from "@/config/tunables";
import { renderWithUser } from "@/test/render";

import {
  ANSWER_STATES,
  AnswerButton,
  answerLetter,
  type AnswerState,
} from "./answer-button";

function renderOption(
  state: AnswerState,
  extra: Partial<Parameters<typeof AnswerButton>[0]> = {},
) {
  const onCommit = vi.fn();
  const onPressStart = vi.fn();
  const view = renderWithUser(
    <div>
      <AnswerButton
        index={1}
        state={state}
        onCommit={onCommit}
        onPressStart={onPressStart}
        {...extra}
      >
        Uranus
      </AnswerButton>
      <p>Elsewhere</p>
    </div>,
  );
  return {
    ...view,
    onCommit,
    onPressStart,
    button: screen.getByRole("button"),
  };
}

describe("AnswerButton", () => {
  it("names options by letter, A to D", () => {
    expect([0, 1, 2, 3].map(answerLetter)).toEqual(["A", "B", "C", "D"]);
  });

  it("takes its minimum height from the tunable (PRD §3.0.3)", () => {
    const { button } = renderOption("idle");
    expect(button).toHaveStyle({
      minHeight: `${TUNABLES.answers.buttonMinHeightPx}px`,
    });
  });

  describe("idle", () => {
    it("is an enabled button named by its letter and text", () => {
      const { button } = renderOption("idle");
      expect(button).toHaveAccessibleName("B. Uranus");
      expect(button).toHaveAttribute("data-state", "idle");
      expect(button).not.toHaveAttribute("aria-disabled");
      expect(button).toHaveAttribute("type", "button");
    });

    it("commits on click", async () => {
      const { user, button, onCommit } = renderOption("idle");
      await user.click(button);
      expect(onCommit).toHaveBeenCalledOnce();
    });

    it("commits from the keyboard with Enter and Space", async () => {
      const { user, onCommit } = renderOption("idle");
      await user.tab();
      await user.keyboard("{Enter}");
      await user.keyboard(" ");
      expect(onCommit).toHaveBeenCalledTimes(2);
    });

    it("shows its shortcut hint and announces the key", () => {
      const { button } = renderOption("idle", { shortcut: "2" });
      expect(button).toHaveAttribute("aria-keyshortcuts", "2");
      // The hint is decorative: the name stays the letter and the text.
      expect(button).toHaveAccessibleName("B. Uranus");
      expect(button.querySelector("kbd")).toHaveTextContent("2");
    });
  });

  describe("pressed", () => {
    it("appears on pointerdown, before any commit", async () => {
      const { user, button, onCommit, onPressStart } = renderOption("idle");
      await user.pointer({ keys: "[MouseLeft>]", target: button });
      expect(button).toHaveAttribute("data-pressed");
      expect(onPressStart).toHaveBeenCalledOnce();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("commits on release over the option", async () => {
      const { user, button, onCommit } = renderOption("idle");
      await user.pointer({ keys: "[MouseLeft>]", target: button });
      await user.pointer({ keys: "[/MouseLeft]", target: button });
      expect(onCommit).toHaveBeenCalledOnce();
      expect(button).not.toHaveAttribute("data-pressed");
    });

    it("cancels when the pointer slides off before release (WCAG 2.5.2)", async () => {
      const { user, button, onCommit } = renderOption("idle");
      const elsewhere = screen.getByText("Elsewhere");
      await user.pointer([
        { keys: "[MouseLeft>]", target: button },
        { target: elsewhere },
        { keys: "[/MouseLeft]", target: elsewhere },
      ]);
      expect(button).not.toHaveAttribute("data-pressed");
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("ends when the browser cancels the pointer", () => {
      const { button } = renderOption("idle");
      fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
      expect(button).toHaveAttribute("data-pressed");
      fireEvent.pointerCancel(button, { pointerId: 1 });
      expect(button).not.toHaveAttribute("data-pressed");
    });

    it("ignores secondary buttons", () => {
      const { button, onPressStart } = renderOption("idle");
      fireEvent.pointerDown(button, { button: 2, pointerId: 1 });
      expect(button).not.toHaveAttribute("data-pressed");
      expect(onPressStart).not.toHaveBeenCalled();
    });

    it("can be forced on, such as while a shortcut key is held", () => {
      const { button } = renderOption("idle", { pressed: true });
      expect(button).toHaveAttribute("data-pressed");
    });
  });

  describe("states after a pick", () => {
    const cases: {
      state: AnswerState;
      name: string;
      words: string | null;
    }[] = [
      { state: "locked", name: "B. Uranus Locked in", words: null },
      {
        state: "correct",
        name: "B. Uranus Correct answer",
        words: "Correct answer",
      },
      {
        state: "your-answer",
        name: "B. Uranus Your answer",
        words: "Your answer",
      },
      { state: "dimmed", name: "B. Uranus", words: null },
      {
        state: "already-guessed",
        name: "B. Uranus Already guessed",
        words: "Already guessed",
      },
      { state: "disabled", name: "B. Uranus", words: null },
    ];

    it.each(cases)(
      "$state: named '$name', aria-disabled, never commits",
      async ({ state, name, words }) => {
        const { user, button, onCommit, onPressStart } = renderOption(state, {
          shortcut: "2",
        });
        expect(button).toHaveAttribute("data-state", state);
        expect(button).toHaveAccessibleName(name);
        expect(button).toHaveAttribute("aria-disabled", "true");
        // Still focusable, so focus never falls to the page after a verdict.
        expect(button).not.toBeDisabled();
        await user.tab();
        expect(button).toHaveFocus();

        await user.click(button);
        await user.keyboard("{Enter}");
        expect(onCommit).not.toHaveBeenCalled();

        fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
        expect(button).not.toHaveAttribute("data-pressed");
        expect(onPressStart).not.toHaveBeenCalled();

        // Only an idle option advertises its shortcut.
        expect(button).not.toHaveAttribute("aria-keyshortcuts");
        expect(button.querySelector("kbd")).toBeNull();

        if (words === null) {
          expect(screen.queryByText(/answer|guessed/i)).toBeNull();
        } else {
          expect(screen.getByText(words)).toBeVisible();
        }
      },
    );

    it("correct and your-answer swap the letter for a glyph", () => {
      const correct = renderOption("correct").button;
      expect(correct.querySelector("[aria-hidden] svg")).not.toBeNull();
      expect(correct.querySelector("[aria-hidden]")).not.toHaveTextContent("B");
    });

    it("keeps the letter for the other states", () => {
      const dimmed = renderOption("dimmed").button;
      expect(dimmed.querySelector("[aria-hidden]")).toHaveTextContent("B");
    });

    it("drops the pressed look when the option stops being idle mid-press", () => {
      const onCommit = vi.fn();
      const { rerender } = renderWithUser(
        <AnswerButton index={0} state="idle" onCommit={onCommit}>
          Paris
        </AnswerButton>,
      );
      const button = screen.getByRole("button");
      fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
      expect(button).toHaveAttribute("data-pressed");
      rerender(
        <AnswerButton index={0} state="locked" onCommit={onCommit}>
          Paris
        </AnswerButton>,
      );
      expect(button).not.toHaveAttribute("data-pressed");
      fireEvent.click(button);
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  it("covers every state of the contract", () => {
    expect(ANSWER_STATES).toEqual([
      "idle",
      "locked",
      "correct",
      "your-answer",
      "dimmed",
      "already-guessed",
      "disabled",
    ]);
  });

  it("takes other wording through labels", () => {
    const { button } = renderOption("your-answer", {
      labels: { yourAnswer: "Your pick" },
    });
    expect(button).toHaveAccessibleName("B. Uranus Your pick");
  });

  it("forwards its ref, so rounds can move focus to it", () => {
    let element: HTMLButtonElement | null = null;
    renderWithUser(
      <AnswerButton
        index={0}
        ref={(node) => {
          element = node;
        }}
      >
        Paris
      </AnswerButton>,
    );
    expect(element).toBe(screen.getByRole("button"));
  });
});
