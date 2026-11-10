/**
 * Key legends only for keyboards (decision D32; RITE round 4, R4-03): the
 * rule the choice round's legend reads, by itself.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  KEYBOARD_LIKELY_QUERY,
  forgetKeyPresses,
  keyLegendShown,
  useKeyLegend,
} from "./key-legend";

/** A `matchMedia` whose answer to the legend's query a test can change. */
function stubPointer(fine: boolean) {
  const listeners = new Set<() => void>();
  const state = { fine };
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === KEYBOARD_LIKELY_QUERY && state.fine;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: () => void) => {
      listeners.delete(listener);
    },
  }));
  return {
    listeners,
    set(next: boolean) {
      state.fine = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function Probe() {
  return <p>{useKeyLegend() ? "legend" : "no legend"}</p>;
}

beforeEach(() => {
  forgetKeyPresses();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useKeyLegend", () => {
  it("R4-03 names the device whose primary pointer is a mouse or a trackpad", () => {
    expect(KEYBOARD_LIKELY_QUERY).toBe("(hover: hover) and (pointer: fine)");
  });

  it("R4-03 is false on a touch-only phone until a key is pressed, and stays true after", () => {
    stubPointer(false);
    render(<Probe />);
    expect(screen.getByText("no legend")).toBeInTheDocument();
    expect(keyLegendShown()).toBe(false);
    fireEvent.keyDown(document.body, { key: "Shift" });
    expect(screen.getByText("legend")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.getByText("legend")).toBeInTheDocument();
    expect(keyLegendShown()).toBe(true);
  });

  it("R4-03 is true from the start with a fine pointer and hover", () => {
    stubPointer(true);
    render(<Probe />);
    expect(screen.getByText("legend")).toBeInTheDocument();
  });

  it("R4-03 follows a pointer that arrives mid-run, and stops listening when it unmounts", () => {
    const pointer = stubPointer(false);
    const { unmount } = render(<Probe />);
    expect(screen.getByText("no legend")).toBeInTheDocument();
    act(() => {
      pointer.set(true);
    });
    expect(screen.getByText("legend")).toBeInTheDocument();
    unmount();
    expect(pointer.listeners.size).toBe(0);
  });

  it("R4-03 typing in a field, a combobox or editable text, composition and modifier chords aren't key presses", () => {
    stubPointer(false);
    render(
      <>
        <Probe />
        <input aria-label="field" />
        <textarea aria-label="area" />
        <div
          role="combobox"
          aria-label="box"
          aria-expanded="false"
          aria-controls="x"
          tabIndex={0}
        />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "a" });
    fireEvent.keyDown(screen.getByLabelText("area"), { key: "a" });
    fireEvent.keyDown(screen.getByLabelText("box"), { key: "a" });
    fireEvent.keyDown(document.body, { key: "Unidentified" });
    fireEvent.keyDown(document.body, { key: "a", isComposing: true });
    fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "c", metaKey: true });
    fireEvent.keyDown(document.body, { key: "c", altKey: true });
    expect(screen.getByText("no legend")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "a" });
    expect(screen.getByText("legend")).toBeInTheDocument();
  });

  it("R4-03 renders no legend on the server, whatever the device, so the markup matches", () => {
    stubPointer(true);
    expect(renderToString(<Probe />)).toContain("no legend");
  });
});
