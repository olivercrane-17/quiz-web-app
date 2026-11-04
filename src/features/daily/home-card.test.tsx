import { render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addDays, dailyNumberFor } from "@/engine/time";
import {
  parseAttemptId,
  parseDailyNumber,
  parseLocalDate,
  type DailyTodayCard,
  type LocalDate,
  type Result,
  type TodayRoundChip,
} from "@/engine/types";

import { DailyHomeCard, chipText, dailyLine, progressLine } from "./home-card";
import { loadSharePayload, loadTodayCard } from "./home-data";

vi.mock("./home-data", () => ({
  loadTodayCard: vi.fn(),
  loadSharePayload: vi.fn(),
  warmDaily: vi.fn(),
}));
// SHR-1 builds the button; here it shows what it was handed.
vi.mock("@/features/share/share-button", () => ({
  ShareButton: ({
    payload,
    surface,
  }: {
    payload: { text: string };
    surface: string;
  }) => (
    <button type="button" data-share-surface={surface}>
      {payload.text}
    </button>
  ),
}));

const EPOCH = "2026-09-21";
/** 12:00 UTC on Sunday 1 November 2026, Daily #42 in every zone from UTC-11 to UTC+11. */
const NOON = Date.UTC(2026, 10, 1, 12);

function must<T>(value: T | null): T {
  if (value === null) throw new Error("bad test value");
  return value;
}

function date(raw: string): LocalDate {
  return must(parseLocalDate(raw));
}

const DAILY_ROUNDS: TodayRoundChip[] = [
  { type: "mystery", difficulty: "easy", answerType: "person" },
  { type: "mystery", difficulty: "medium", answerType: "country" },
  { type: "mystery", difficulty: "hard", answerType: "element" },
  { type: "encore", difficulty: null, answerType: null },
];

function card(overrides: Partial<DailyTodayCard> = {}): DailyTodayCard {
  return {
    daily: {
      dailyNumber: must(parseDailyNumber(42)),
      date: date("2026-11-01"),
    },
    rounds: DAILY_ROUNDS,
    playedCount: null,
    status: "not_started",
    attemptId: null,
    progress: null,
    finished: null,
    nextUnlockAt: NOON + 12 * 3_600_000,
    serverTime: NOON,
    ...overrides,
  };
}

function answers(value: DailyTodayCard, highContrast = false): void {
  vi.mocked(loadTodayCard).mockResolvedValue({
    card: { ok: true, value } satisfies Result<DailyTodayCard>,
    highContrast,
  });
}

const FINISHED = {
  status: "finished",
  attemptId: parseAttemptId("0f8fad5b-d9cb-469f-a165-70867728950e"),
  finished: {
    points: 9,
    maxPoints: 12,
    rows: [
      ["solved", "unused", "unused", "unused"],
      ["passed", "solved", "unused", "unused"],
      ["passed", "passed", "solved", "unused"],
    ],
    encore: null,
  },
  nextUnlockAt: NOON + 15 * 3_600_000,
} satisfies Partial<DailyTodayCard>;

function renderCard() {
  const view = render(<DailyHomeCard epoch={EPOCH} minutes={6} />);
  // The section is named by its heading, which changes with the state.
  const region = () => {
    const section = view.container.querySelector("section[data-daily-card]");
    if (!(section instanceof HTMLElement)) throw new Error("no Daily card");
    return section;
  };
  return { ...view, region };
}

beforeEach(() => {
  // Only Date: React and Testing Library keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"], now: NOON });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the card's own Daily number", () => {
  it("is the engine's, without importing it, and never repeats Today's date (D18)", () => {
    // Every day for two and a half years, across a leap day.
    for (let day = 0; day < 900; day += 1) {
      const at = addDays(date(EPOCH), day);
      expect(dailyLine(at, EPOCH)).toBe(
        `Daily #${dailyNumberFor(at, date(EPOCH))}`,
      );
    }
  });
});

describe("chips and progress lines", () => {
  it("name each round by answer type and difficulty, and the Encore by its number", () => {
    expect(DAILY_ROUNDS.map(chipText)).toEqual([
      "A person · Easy",
      "A country · Medium",
      "An element · Hard",
      "Encore · a number",
    ]);
    expect(chipText({ type: "mc", difficulty: "easy", answerType: null })).toBe(
      "A question · Easy",
    );
  });

  it("say where an unfinished run stands, counting rounds of the same kind", () => {
    const at = (roundIndex: number, rounds = DAILY_ROUNDS) =>
      progressLine(
        card({
          rounds,
          status: "in_progress",
          progress: { roundIndex, of: rounds.length },
        }),
      );
    expect(at(0)).toBe("Mystery 1 of 3");
    expect(at(2)).toBe("Mystery 3 of 3");
    expect(at(3)).toBe("Encore");
    const nine: TodayRoundChip[] = [
      ...Array.from({ length: 9 }, () => ({
        type: "mc" as const,
        difficulty: "easy" as const,
        answerType: null,
      })),
      { type: "encore", difficulty: null, answerType: null },
    ];
    expect(at(3, nine)).toBe("Question 4 of 9");
  });
});

describe("Today's Daily card", () => {
  it("shows the number, the minutes and a live Play before get_today answers, and no date (D18)", () => {
    vi.mocked(loadTodayCard).mockReturnValue(new Promise(() => {}));
    const { region } = renderCard();
    expect(region()).toHaveAttribute("data-daily-card", "not_started");
    expect(region()).toHaveAccessibleName("Today's Daily");
    expect(within(region()).getByText("Daily #42")).toBeVisible();
    expect(within(region()).getByText(/About 6 minutes/)).toBeVisible();
    // Today's dateline names the day; the card doesn't say it again.
    expect(region()).not.toHaveTextContent(/Sunday|November/);
    expect(
      within(region()).getByText("Fewer clues, more points. Then one number."),
    ).toBeVisible();
    expect(
      within(region()).getByRole("link", { name: "Play today's Daily" }),
    ).toHaveAttribute("href", "/daily");
    expect(
      within(region())
        .getAllByRole("listitem")
        .map((chip) => chip.textContent),
    ).toEqual(["Easy", "Medium", "Hard", "Number"]);
  });

  it("not started: today's chips arrive with get_today", async () => {
    answers(card());
    const { region } = renderCard();
    expect(await within(region()).findByText("A person · Easy")).toBeVisible();
    expect(
      within(region())
        .getAllByRole("listitem")
        .map((chip) => chip.textContent),
    ).toEqual(DAILY_ROUNDS.map(chipText));
    expect(region()).toHaveAttribute("data-daily-card", "not_started");
  });

  it("R1-27 draws each round as the design system's flat chip, not a pill that reads as a control", async () => {
    answers(card());
    const { region } = renderCard();
    await within(region()).findByText("A person · Easy");
    for (const item of within(region()).getAllByRole("listitem")) {
      const chip = item.querySelector(".kn-chip");
      expect(chip).toHaveAttribute("data-tone", "default");
      expect(item.className).not.toMatch(/rounded-full/);
    }
  });

  it("not started: a Daily of questions alone gets its own rule line", async () => {
    answers(
      card({
        rounds: [
          ...Array.from({ length: 9 }, () => ({
            type: "mc" as const,
            difficulty: "easy" as const,
            answerType: null,
          })),
          { type: "encore", difficulty: null, answerType: null },
        ],
      }),
    );
    const { region } = renderCard();
    expect(
      await within(region()).findByText("A point a question. Then one number."),
    ).toBeVisible();
    expect(region()).not.toHaveTextContent("Fewer clues");
  });

  it("in progress: Continue, named for where the run stands", async () => {
    answers(
      card({
        status: "in_progress",
        attemptId: parseAttemptId("0f8fad5b-d9cb-469f-a165-70867728950e"),
        progress: { roundIndex: 1, of: 4 },
      }),
    );
    const { region } = renderCard();
    expect(
      await within(region()).findByRole("heading", {
        name: "Continue Daily #42 · Mystery 2 of 3",
      }),
    ).toBeVisible();
    expect(region()).toHaveAttribute("data-daily-card", "in_progress");
    expect(
      within(region()).getByRole("link", { name: "Continue" }),
    ).toHaveAttribute("href", "/daily");
    expect(within(region()).queryByRole("list")).toBeNull();
    // The heading names the Daily, and Today's dateline the day (D18).
    expect(region()).not.toHaveTextContent(/Sunday|November/);
    expect(region()).not.toHaveTextContent(/minutes/);
  });

  it("finished: the score, the rows as the share draws them, See results and the countdown", async () => {
    answers(card(FINISHED));
    vi.mocked(loadSharePayload).mockResolvedValue(null);
    const { region } = renderCard();
    expect(
      await within(region()).findByRole("heading", {
        name: "Done for today · 9/12",
      }),
    ).toBeVisible();
    expect(region()).toHaveAttribute("data-daily-card", "finished");
    expect(region()).toHaveTextContent("✅⬜⬜⬜🟧✅⬜⬜🟧🟧✅⬜");
    expect(
      within(region()).getByRole("link", { name: "See results" }),
    ).toHaveAttribute("href", "/daily/42/results");
    expect(within(region()).getByText("Next Daily in 15h 0m")).toBeVisible();
    expect(
      within(region()).queryByRole("link", { name: "Play today's Daily" }),
    ).toBeNull();
    expect(within(region()).getByText("Daily #42")).toBeVisible();
    expect(region()).not.toHaveTextContent(/Sunday|November/);
    expect(region()).not.toHaveTextContent(/minutes/);
  });

  it("finished: Share carries the stop screen's text, and the grid follows high contrast", async () => {
    answers(card(FINISHED), true);
    vi.mocked(loadSharePayload).mockResolvedValue({
      text: "Knewt Daily #42 · 9/12",
      mode: "daily",
      grid: FINISHED.finished.rows,
    });
    const { region } = renderCard();
    const share = await within(region()).findByRole("button", {
      name: "Knewt Daily #42 · 9/12",
    });
    expect(share).toHaveAttribute("data-share-surface", "home");
    expect(loadSharePayload).toHaveBeenCalledWith(
      "0f8fad5b-d9cb-469f-a165-70867728950e",
      true,
    );
    expect(region()).toHaveTextContent("🟦⬜⬜⬜🟧🟦⬜⬜🟧🟧🟦⬜");
  });

  it("R1-02 shows no Past 7 days link in any state while the archive has no route", async () => {
    for (const state of [
      card(),
      card({
        status: "in_progress",
        attemptId: FINISHED.attemptId,
        progress: { roundIndex: 1, of: 4 },
      }),
      card(FINISHED),
    ]) {
      answers(state);
      vi.mocked(loadSharePayload).mockResolvedValue(null);
      const calls = vi.mocked(loadTodayCard).mock.calls.length;
      const { region, unmount } = renderCard();
      // The card's first lazy chunk can take a while to load in a test.
      await vi.waitFor(
        () => {
          expect(loadTodayCard).toHaveBeenCalledTimes(calls + 1);
          expect(region()).toHaveAttribute("data-daily-card", state.status);
        },
        { timeout: 5_000 },
      );
      expect(
        within(region()).queryByRole("link", { name: "Past 7 days" }),
      ).toBeNull();
      unmount();
    }
  });

  it("keeps Play working when get_today fails", async () => {
    vi.mocked(loadTodayCard).mockResolvedValue({
      card: {
        ok: false,
        error: {
          code: "offline",
          retryable: true,
          retryAfterMs: null,
          refId: null,
        },
      },
      highContrast: false,
    });
    const { region } = renderCard();
    await vi.waitFor(() => {
      expect(loadTodayCard).toHaveBeenCalledTimes(1);
    });
    expect(region()).toHaveAttribute("data-daily-card", "not_started");
    expect(
      within(region()).getByRole("link", { name: "Play today's Daily" }),
    ).toHaveAttribute("href", "/daily");
  });
});
