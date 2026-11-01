import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { NicknameInput } from "@/backend";
import { renderWithUser } from "@/test/render";

import { NicknameField } from "./nickname-field";

function Field({
  allowCustom,
  onChange,
  error = null,
}: {
  allowCustom: boolean;
  onChange?: (value: NicknameInput) => void;
  error?: string | null;
}) {
  const [value, setValue] = useState<NicknameInput>({
    generated: "Plucky Otter",
  });
  return (
    <NicknameField
      label="What should your friends see?"
      generated="Plucky Otter"
      value={value}
      allowCustom={allowCustom}
      error={error}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("NicknameField (greybox)", () => {
  it("offers only the generated name without the 18+ band", () => {
    renderWithUser(<Field allowCustom={false} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Plucky Otter")).toBeInTheDocument();
  });

  it("takes a custom name from 18, and falls back to the generated one when emptied", async () => {
    const onChange = vi.fn();
    const { user } = renderWithUser(<Field allowCustom onChange={onChange} />);
    const field = screen.getByRole("textbox", {
      name: "What should your friends see?",
    });
    expect(field).toHaveAccessibleDescription(
      /Leave it empty to be Plucky Otter/,
    );
    await user.type(field, "Dee");
    expect(onChange).toHaveBeenLastCalledWith({ custom: "Dee" });
    await user.clear(field);
    expect(onChange).toHaveBeenLastCalledWith({ generated: "Plucky Otter" });
    expect(field).toHaveAttribute("maxlength", "24");
  });

  it("shows a refusal under the field and marks it invalid", () => {
    renderWithUser(
      <Field allowCustom error="Please choose different wording." />,
    );
    const field = screen.getByRole("textbox");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      /Please choose different wording\./,
    );
  });
});
