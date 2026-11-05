/**
 * NicknameField (MOD-1): the generated-name picker, the custom field with
 * Shuffle, the band question's hand-off and the filter's feedback. The
 * filter here compiles the stand-in list of src/engine/fixtures/
 * moderation.json, which holds no real term; the real list is held to the
 * same rules in ./filter.test.ts.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NicknameInput } from "@/backend";
import { NAME_ADJECTIVES, NAME_ANIMALS } from "@/content/generated/names";
import { renderWithUser } from "@/test/render";
import { clearAnnouncements, LIVE_REGION_IDS } from "@/ui/announce";

import { FILTER_SETTLE_MS, NICKNAME_COPY } from "./copy";
import { loadTextFilter } from "./filter";
import { NicknameField, type NicknameFieldProps } from "./nickname-field";

vi.mock("./filter", async () => {
  const { createModerationList, isBlocked } =
    await import("@/engine/text/moderation");
  const { default: fixture } =
    await import("@/engine/fixtures/moderation.json");
  // Each stand-in's declared match is the rule's (moderation-sql.ts checks).
  const list = createModerationList(
    fixture.terms.map(({ term }) => term),
    fixture.allowlist,
  );
  return {
    loadTextFilter: vi.fn(() =>
      Promise.resolve({ isBlocked: (text: string) => isBlocked(text, list) }),
    ),
  };
});

const LABEL = "What should your friends see?";
const FRIENDLY = "Plucky Otter";

type FieldProps = Partial<
  Omit<NicknameFieldProps, "value" | "label" | "generated">
> & { initial?: NicknameInput };

/** The field with its value held as a caller holds it. */
function Field({
  initial = { generated: FRIENDLY },
  allowCustom = false,
  onChange,
  ...rest
}: FieldProps) {
  const [value, setValue] = useState<NicknameInput>(initial);
  return (
    <NicknameField
      {...rest}
      label={LABEL}
      generated={FRIENDLY}
      value={value}
      allowCustom={allowCustom}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function spoken(): string {
  return document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";
}

/** The filter's answer under the field, if it shows (the status region's copy aside). */
function answer(): HTMLElement | null {
  const field = document.querySelector<HTMLElement>("[data-nickname-field]");
  return field === null
    ? null
    : within(field).queryByText(NICKNAME_COPY.blocked);
}

/** A user-event session that moves fake timers along with its own waits. */
function withFakeTimers() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // Testing Library drains each user-event call with a setTimeout(0) that
  // it only fast-forwards through a global `jest` (as choice-round.test.tsx
  // found), so point that at `vi`.
  vi.stubGlobal("jest", {
    advanceTimersByTime: (ms: number) => {
      vi.advanceTimersByTime(ms);
    },
  });
  return userEvent.setup({
    advanceTimers: (ms) => {
      vi.advanceTimersByTime(ms);
    },
  });
}

function isListedPair(name: string): boolean {
  const [adjective, animal, extra] = name.split(" ");
  return (
    extra === undefined &&
    NAME_ADJECTIVES.includes(adjective as string) &&
    NAME_ANIMALS.includes(animal as string)
  );
}

afterEach(() => {
  vi.useRealTimers();
  clearAnnouncements();
});

describe("NicknameField: generated names", () => {
  it("offers only generated names without the 18+ band, and Shuffle name picks another from the lists", async () => {
    const onChange = vi.fn();
    const { user } = renderWithUser(<Field onChange={onChange} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    const picker = screen.getByRole("group", { name: LABEL });
    expect(within(picker).getByText(FRIENDLY)).toBeInTheDocument();
    expect(within(picker).getByText(NICKNAME_COPY.generatedHint)).toBeVisible();
    const shuffle = within(picker).getByRole("button", {
      name: NICKNAME_COPY.shuffle,
    });
    expect(shuffle).toHaveAccessibleDescription(
      `${FRIENDLY} ${NICKNAME_COPY.generatedHint}`,
    );

    await user.click(shuffle);
    const first = (onChange.mock.lastCall?.[0] as { generated: string })
      .generated;
    expect(first).not.toBe(FRIENDLY);
    expect(isListedPair(first)).toBe(true);
    expect(within(picker).getByText(first)).toBeInTheDocument();
    expect(spoken()).toBe(first);

    await user.click(shuffle);
    const second = (onChange.mock.lastCall?.[0] as { generated: string })
      .generated;
    expect(second).not.toBe(first);
    expect(isListedPair(second)).toBe(true);
  });

  it("shows a generated name in the picker even when the value is custom", () => {
    render(<Field initial={{ custom: "Dee" }} />);
    expect(screen.getByText(FRIENDLY)).toBeInTheDocument();
    expect(screen.queryByText("Dee")).toBeNull();
  });

  it("with the band unknown, Type your own name asks the caller, and the text field takes focus once custom names are allowed", async () => {
    function Asking() {
      const [band, setBand] = useState<"unknown" | "18_plus">("unknown");
      return (
        <Field
          allowCustom={band === "18_plus"}
          onCustomRequest={
            band === "unknown"
              ? () => {
                  setBand("18_plus");
                }
              : undefined
          }
        />
      );
    }
    const { user } = renderWithUser(<Asking />);
    expect(screen.queryByText(NICKNAME_COPY.generatedHint)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: NICKNAME_COPY.typeOwn }),
    );
    const field = screen.getByRole("textbox", { name: LABEL });
    expect(field).toHaveFocus();
    expect(field).toHaveValue(FRIENDLY);
  });

  it("moves focus to Shuffle name when the band comes back 13 to 17", async () => {
    function Asking() {
      const [band, setBand] = useState<"unknown" | "13_17">("unknown");
      return (
        <Field
          onCustomRequest={
            band === "unknown"
              ? () => {
                  setBand("13_17");
                }
              : undefined
          }
        />
      );
    }
    const { user } = renderWithUser(<Asking />);
    await user.click(
      screen.getByRole("button", { name: NICKNAME_COPY.typeOwn }),
    );
    expect(
      screen.queryByRole("button", { name: NICKNAME_COPY.typeOwn }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: NICKNAME_COPY.shuffle }),
    ).toHaveFocus();
    expect(screen.getByText(NICKNAME_COPY.generatedHint)).toBeVisible();
  });
});

describe("NicknameField: custom names", () => {
  it("takes a custom name from 18, prefilled with the generated name; emptying it, or typing that name back, means the generated name", async () => {
    const onChange = vi.fn();
    const { user } = renderWithUser(<Field allowCustom onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: LABEL });
    expect(field).toHaveValue(FRIENDLY);
    expect(field).toHaveAttribute("maxlength", "24");
    expect(field).toHaveAccessibleDescription(
      NICKNAME_COPY.customHint(FRIENDLY),
    );

    await user.clear(field);
    expect(onChange).toHaveBeenLastCalledWith({ generated: FRIENDLY });
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", FRIENDLY);

    await user.type(field, "Dee");
    expect(onChange).toHaveBeenLastCalledWith({ custom: "Dee" });
    expect(field).toHaveValue("Dee");

    await user.clear(field);
    await user.type(field, FRIENDLY);
    expect(onChange).toHaveBeenLastCalledWith({ generated: FRIENDLY });
    expect(field).toHaveValue(FRIENDLY);
  });

  it("puts another generated name in the field with Shuffle name, which an emptied field then means", async () => {
    const onChange = vi.fn();
    const { user } = renderWithUser(<Field allowCustom onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: LABEL });
    await user.type(field, " the Second");
    expect(onChange).toHaveBeenLastCalledWith({
      custom: `${FRIENDLY} the Second`,
    });

    await user.click(
      screen.getByRole("button", { name: NICKNAME_COPY.shuffle }),
    );
    const shuffled = (onChange.mock.lastCall?.[0] as { generated: string })
      .generated;
    expect(isListedPair(shuffled)).toBe(true);
    expect(field).toHaveValue(shuffled);
    expect(field).toHaveAccessibleDescription(
      NICKNAME_COPY.customHint(shuffled),
    );
    expect(spoken()).toBe(shuffled);

    await user.type(field, "s");
    expect(onChange).toHaveBeenLastCalledWith({ custom: `${shuffled}s` });
    await user.clear(field);
    expect(onChange).toHaveBeenLastCalledWith({ generated: shuffled });
  });

  it("keeps the friendly name generated when it is typed back after a Shuffle, so saving it clears the custom name", async () => {
    const onChange = vi.fn();
    const { user } = renderWithUser(
      <Field allowCustom initial={{ custom: "Dee" }} onChange={onChange} />,
    );
    const field = screen.getByRole("textbox", { name: LABEL });
    expect(field).toHaveValue("Dee");
    await user.click(
      screen.getByRole("button", { name: NICKNAME_COPY.shuffle }),
    );
    await user.clear(field);
    expect(field.getAttribute("placeholder")).not.toBe(FRIENDLY);
    await user.type(field, FRIENDLY);
    expect(onChange).toHaveBeenLastCalledWith({ generated: FRIENDLY });
  });

  it("disables the field and its buttons together", () => {
    render(<Field allowCustom disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: NICKNAME_COPY.shuffle }),
    ).toBeDisabled();
  });
});

describe("NicknameField: filter feedback", () => {
  it("loads the term list only once the field is used", async () => {
    const { user } = renderWithUser(<Field allowCustom />);
    expect(loadTextFilter).not.toHaveBeenCalled();
    await user.click(screen.getByRole("textbox"));
    expect(loadTextFilter).toHaveBeenCalled();
  });

  it("answers once typing pauses, keeps the answer while the text stays blocked, and drops it the moment the text is clean", async () => {
    const user = withFakeTimers();
    const onBlockedChange = vi.fn();
    render(<Field allowCustom onBlockedChange={onBlockedChange} />);
    expect(onBlockedChange).toHaveBeenLastCalledWith(false);
    const field = screen.getByRole("textbox", { name: LABEL });

    await user.clear(field);
    await user.type(field, "Zorblax");
    // The verdict is immediate, for the caller's Save; the words wait.
    expect(onBlockedChange).toHaveBeenLastCalledWith(true);
    expect(answer()).toBeNull();
    expect(field).not.toHaveAttribute("aria-invalid");

    act(() => {
      vi.advanceTimersByTime(FILTER_SETTLE_MS);
    });
    expect(answer()).toBeVisible();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      `${NICKNAME_COPY.customHint(FRIENDLY)} ${NICKNAME_COPY.blocked}`,
    );
    expect(spoken()).toBe(NICKNAME_COPY.blocked);

    // Still blocked: the answer stays without another pause.
    await user.type(field, "ian");
    expect(answer()).toBeVisible();

    // Clean: it goes at once.
    await user.clear(field);
    await user.type(field, "Zorblaxton");
    expect(onBlockedChange).toHaveBeenLastCalledWith(false);
    expect(answer()).toBeNull();
    expect(field).not.toHaveAttribute("aria-invalid");

    // Blocked again: a new pause before the words.
    await user.type(field, "{Backspace}{Backspace}{Backspace}");
    expect(onBlockedChange).toHaveBeenLastCalledWith(true);
    expect(answer()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(FILTER_SETTLE_MS);
    });
    expect(answer()).toBeVisible();
  });

  it("answers at once when the field loses focus", async () => {
    const user = withFakeTimers();
    render(<Field allowCustom />);
    const field = screen.getByRole("textbox", { name: LABEL });
    await user.clear(field);
    await user.type(field, "no go team");
    expect(answer()).toBeNull();
    await user.tab();
    expect(answer()).toBeVisible();
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("leaves a name alone when a listed word only sits inside its words", async () => {
    const onBlockedChange = vi.fn();
    const { user } = renderWithUser(
      <Field allowCustom onBlockedChange={onBlockedChange} />,
    );
    const field = screen.getByRole("textbox", { name: LABEL });
    await user.clear(field);
    await user.type(field, "Henrietta Pantry");
    await user.tab();
    expect(onBlockedChange).toHaveBeenLastCalledWith(false);
    expect(answer()).toBeNull();
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("shows the server's refusal under the field, marks it invalid and speaks it", () => {
    render(
      <Field
        allowCustom
        initial={{ custom: "Dee" }}
        error="Please choose a different name."
      />,
    );
    const field = screen.getByRole("textbox", { name: LABEL });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      /Please choose a different name\./,
    );
    expect(spoken()).toBe("Please choose a different name.");
  });

  it("shows the server's refusal under the picker too", () => {
    render(<Field error="Something went wrong. Try again." />);
    expect(
      within(screen.getByRole("group", { name: LABEL })).getByText(
        "Something went wrong. Try again.",
      ),
    ).toBeVisible();
  });
});
