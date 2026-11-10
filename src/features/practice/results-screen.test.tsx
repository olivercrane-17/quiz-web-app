/**
 * The practice results screen around the real history and fixture packs:
 * where Share sits and what it is handed (R1-01, PRD §3.5.4), and the rows'
 * lines with the Why hint under them (R1-17, D13). The share feature
 * builds the button; here a stand-in shows what it was given.
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadPracticePool } from "@/content/loaders/practice";
import { SHELL_COPY } from "@/features/shell";
import { getSiteUrl } from "@/lib/env";
import { getKv } from "@/platform/storage";

import { appendHistory } from "./model/storage";
import { PracticeResultsScreen } from "./results-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, prefetch: () => {} }),
}));
vi.mock("@/features/identity", () => ({ bootClient: () => Promise.resolve() }));
vi.mock("@/features/share/share-button", () => ({
  ShareButton: ({
    payload,
    surface,
  }: {
    payload: { text: string; mode: string; grid: unknown };
    surface: string;
  }) => (
    <button
      type="button"
      data-share-surface={surface}
      data-share-mode={payload.mode}
      data-share-grid={payload.grid === null ? "none" : "some"}
    >
      {payload.text}
    </button>
  ),
}));

afterEach(() => {
  localStorage.clear();
});

/** A finished Hard Geography run of two questions: one right, one missed. */
async function finishedRun() {
  const pool = await loadPracticePool("geo");
  if (!pool.ok) throw new Error("no pack");
  const [first, second] = pool.value;
  if (first === undefined || second === undefined) {
    throw new Error("short pack");
  }
  appendHistory(getKv(), {
    runId: "run-1",
    mode: "practice",
    request: {
      mode: "category",
      category: "geo",
      difficulty: "hard",
      repeats: false,
    },
    score: 1,
    maxPoints: 2,
    startedAt: 0,
    finishedAt: 1,
    questions: [
      { itemId: first.id, correct: true, chosen: first.correct },
      {
        itemId: second.id,
        correct: false,
        chosen: (second.correct + 1) % second.options.length,
      },
    ],
  });
}

function renderResults() {
  return render(
    <PracticeResultsScreen
      categories={{ geo: { name: "Geography", slug: "geography" } }}
    />,
  );
}

describe("practice results", () => {
  it("R1-01 offers Share after Play again, with PRD §3.5.4's text and the practice link last", async () => {
    await finishedRun();
    renderResults();
    const share = await screen.findByRole("button", {
      name: /Practice · Geography/,
    });
    expect(share).toHaveAttribute("data-share-surface", "practice");
    expect(share).toHaveAttribute("data-share-mode", "practice");
    expect(share).toHaveAttribute("data-share-grid", "none");
    expect(share.textContent).toBe(
      `${SHELL_COPY.brand} Practice · Geography · Hard · 1/2\n${getSiteUrl()}/practice`,
    );
    // AC-SHR-08: never a challenge link.
    expect(share.textContent).not.toContain("/c/");
    const again = screen.getByRole("button", { name: "Play again" });
    expect(
      again.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("R1-17 puts the Why hint under a row's lines, beside nothing but the icon", async () => {
    await finishedRun();
    const { container } = renderResults();
    await screen.findByRole("button", { name: "Play again" });
    const rows = container.querySelectorAll("[data-result-row]");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const stem = row.querySelector("[data-result-stem]");
      const why = row.querySelector("[data-result-why]");
      expect(why).not.toBeNull();
      // The hint closes the text column, which holds the stem too.
      expect(why?.parentElement).toBe(stem?.parentElement);
      expect(why?.parentElement?.lastElementChild).toBe(why);
      // The summary's name still ends with the hint.
      const summary = row.querySelector("summary");
      expect(summary).not.toBeNull();
      if (summary !== null) {
        expect(within(summary).getByText("Why")).toBeVisible();
        expect(summary.textContent?.trim().endsWith("Why▾")).toBe(true);
      }
    }
  });

  it("R3-11 says You chose True. on a true-or-false miss, in the option's own case", async () => {
    const pool = await loadPracticePool("geo");
    if (!pool.ok) throw new Error("no pack");
    const tf = pool.value.find((item) => item.id === "fx.p.geo.0104");
    if (tf === undefined || tf.format !== "tf") throw new Error("no tf item");
    // "True" is right here; the miss picked "False" and the round showed
    // "True" and "False", as the options read.
    const wrong = tf.correct === 0 ? 1 : 0;
    const picked = tf.options[wrong];
    const answer = tf.options[tf.correct];
    expect(picked).toMatch(/^[TF]/);
    appendHistory(getKv(), {
      runId: "run-tf",
      mode: "practice",
      request: {
        mode: "category",
        category: "geo",
        difficulty: "mixed",
        repeats: false,
      },
      score: 0,
      maxPoints: 1,
      startedAt: 0,
      finishedAt: 1,
      questions: [{ itemId: tf.id, correct: false, chosen: wrong }],
    });
    const { container } = renderResults();
    await screen.findByRole("button", { name: "Play again" });
    const row = container.querySelector('[data-result-row="wrong"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain(
      `Not quite. Answer: ${answer}. You chose ${picked}.`,
    );
    expect(row?.textContent).not.toContain(
      `You chose ${picked?.toLowerCase()}.`,
    );
  });
});
