import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PLUGINS } from "@/engine/rounds";
import { ROUND_FAMILY, ROUND_TYPES } from "@/engine/types";
import type { RoundMeta, RoundOpen } from "@/engine/types";
import { DEFAULT_SETTINGS } from "@/platform/settings/store";
import { renderWithUser } from "@/test/render";

import { playSettingsFrom, type RoundComponentProps } from "./contracts";
import { ROUND_COMPONENTS, roundComponentFor } from "./registry";

const meta: RoundMeta = {
  index: 0,
  type: "mc",
  difficulty: "easy",
  category: "geo",
  answerType: null,
  ordinal: 1,
  ofType: 10,
  maxPoints: 1,
  voided: false,
};

const open: RoundOpen = {
  family: "choice",
  index: 0,
  format: "mc",
  stem: "Which is the capital of Australia?",
  options: [
    { index: 0, label: "Sydney", alreadyGuessed: false },
    { index: 1, label: "Canberra", alreadyGuessed: false },
  ],
  issuedAt: 0,
};

function props(): RoundComponentProps {
  return {
    meta,
    open,
    client: null,
    status: "idle",
    reveal: null,
    error: null,
    onIntent: vi.fn(),
    onContinue: vi.fn(),
    continueLabel: "Continue",
    context: {
      mode: "practice",
      sealed: false,
      list: null,
      itemRef: "fx.p.geo.0101",
      settings: playSettingsFrom(DEFAULT_SETTINGS, false),
    },
  };
}

describe("round component registry", () => {
  it("has a component for every family the engine can play", () => {
    for (const type of ROUND_TYPES) {
      const family = ROUND_FAMILY[type];
      expect(PLUGINS[type].family).toBe(family);
      if (family === "ordering") {
        expect(roundComponentFor(family)).toBeNull();
      } else {
        expect(roundComponentFor(family)).toBe(ROUND_COMPONENTS[family]);
      }
    }
  });

  it("renders a stub as a visible note until its ticket builds it", () => {
    const Choice = ROUND_COMPONENTS.choice;
    renderWithUser(<Choice {...props()} />);
    expect(screen.getByText(/isn't ready yet/)).toBeInTheDocument();
  });
});

describe("playSettingsFrom", () => {
  it("resolves reduced motion from the setting and the media query", () => {
    expect(playSettingsFrom(DEFAULT_SETTINGS, false).reducedMotion).toBe(false);
    expect(playSettingsFrom(DEFAULT_SETTINGS, true).reducedMotion).toBe(true);
    expect(
      playSettingsFrom({ ...DEFAULT_SETTINGS, motion: "on" }, false)
        .reducedMotion,
    ).toBe(true);
    expect(
      playSettingsFrom({ ...DEFAULT_SETTINGS, motion: "off" }, true)
        .reducedMotion,
    ).toBe(false);
  });

  it("carries the PRD defaults for play", () => {
    expect(playSettingsFrom(DEFAULT_SETTINGS, false)).toEqual({
      shortcuts: true,
      reducedMotion: false,
      sound: false,
      haptics: false,
      readAloud: false,
      autoAdvance: false,
      highContrast: false,
      timerAnnouncements: false,
    });
  });
});
