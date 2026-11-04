/**
 * The Daily greybox on the mock backend (ARCHITECTURE §12.3 DLY-1): Today's
 * card, the Daily screen's start states, the stop screen's routing, and the
 * fixture Dailies played through the real round plugins and components
 * (PRA-1's choice round, MYS-1's Mystery and Encore). The typed-guess spec
 * gets its suggestions from MYS-1's answer lists, which the Daily reads
 * through src/features/daily/screen/answer-lists.ts. The engine-level halves
 * of AC-DLY-01, 07 and 09 also run in Vitest with the echo plugins
 * (src/features/daily/model/controller.test.ts,
 * src/backend/mock/server/sealed.test.ts, src/engine/share/text.test.ts).
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { expectSealedPayloads } from "../support/sealed";

/** 09:00 in London on Sunday 1 November 2026: Daily #42 (spare set 6). */
const NOV_1 = new Date("2026-11-01T09:00:00Z");

type MockInit = Record<string, unknown>;

/** Sets `window.__QZ_MOCK_INIT__` before the app loads (§11.4). */
async function mockInit(page: Page, init: MockInit): Promise<void> {
  await page.addInitScript((value) => {
    (window as unknown as { __QZ_MOCK_INIT__: unknown }).__QZ_MOCK_INIT__ =
      value;
  }, init);
}

/** A choice or clue-4 option by its label: AnswerButton names it "A. Label". */
function option(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole("button", {
    name: new RegExp(`^[A-H]\\. ${escaped}$`),
  });
}

/** Reads the mock's database (`window.__qzMock.inspect`), once the backend has loaded. */
async function inspect<T>(page: Page, path: string): Promise<T> {
  await page.waitForFunction(() => "__qzMock" in window);
  return page.evaluate(
    (at) =>
      (
        window as unknown as { __qzMock: { inspect(path: string): unknown } }
      ).__qzMock.inspect(at),
    path,
  ) as Promise<T>;
}

test.use({ timezoneId: "Europe/London" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOV_1);
});

test.describe("Today's Daily card", () => {
  test("D18 shows today's number and minutes at once, never the date the dateline gives, then one chip per round from get_today", async ({
    page,
  }) => {
    await page.goto("/");
    const card = page.locator("[data-daily-card]");
    await expect(
      card.getByRole("heading", { name: "Today's Daily" }),
    ).toBeVisible();
    await expect(card).toContainText("Daily #42 · About 4 minutes");
    // One date on Today: the dateline's, above the greeting.
    await expect(page.getByText(/Sunday 1 November/)).toHaveCount(1);
    await expect(card).not.toContainText("November");
    await expect(card).toContainText(
      "Fewer clues, more points. Then one number.",
    );
    await expect(
      card.getByRole("list", { name: "Today's rounds" }).getByRole("listitem"),
    ).toHaveText([
      "A person · Easy",
      "A country · Medium",
      "An element · Hard",
      "Encore · a number",
    ]);
    await expect(
      card.getByRole("link", { name: "Play today's Daily" }),
    ).toHaveAttribute("href", "/daily");
  });

  test("mints the guest identity on the device and registers nothing until a write (§9.1)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator('[data-daily-card="not_started"] li').first(),
    ).toHaveText("A person · Easy");
    const identity = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("qz:identity") ?? "null"),
    );
    expect(identity).toMatchObject({
      v: 1,
      registered: false,
      source: "minted",
    });
    expect(identity.playerId).toMatch(/^[0-9a-f-]{36}$/);
    // get_today never registers (§8.4).
    expect(await inspect(page, "players")).toBeUndefined();
  });
});

test.describe("the Daily screen's start states", () => {
  test("keeps trying when the server can't be reached, and says what still works", async ({
    page,
  }) => {
    await mockInit(page, {
      failures: [{ method: "sealed.start", code: "unreachable", times: 50 }],
    });
    await page.goto("/daily");
    const problem = page.locator('[data-daily-problem="unreachable"]');
    await expect(
      problem.getByRole("heading", {
        name: "We couldn't reach today's Daily.",
      }),
    ).toBeVisible();
    await expect(
      problem.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(
      problem.getByRole("link", { name: "Play practice instead" }),
    ).toHaveAttribute("href", "/practice");
    // No Daily content renders behind it.
    await expect(page.locator("[data-round-area]")).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "Leave the Daily. Your progress is saved.",
      }),
    ).toHaveAttribute("href", "/");
  });

  test("says the Daily needs a connection when the device is offline", async ({
    page,
  }) => {
    await mockInit(page, {
      failures: [{ method: "sealed.start", code: "offline", times: 50 }],
    });
    await page.goto("/daily");
    await expect(
      page.locator('[data-daily-problem="offline"]').getByRole("heading", {
        name: "The Daily needs a connection.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Practice works offline, but it isn't today's Daily."),
    ).toBeVisible();
  });
});

test.describe("the stop screen's routing", () => {
  test("for today's Daily before it's finished, offers to play it", async ({
    page,
  }) => {
    await page.goto("/daily/42/results");
    await expect(
      page.getByText("You haven't finished today's Daily yet."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Play today's Daily" }),
    ).toHaveAttribute("href", "/daily");
  });

  test("R1-02 for another date, says the results moved and offers Today, never the archive's missing route", async ({
    page,
  }) => {
    await page.goto("/daily/30/results");
    await expect(
      page.getByText("These results have moved to the archive."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to Today", exact: true }),
    ).toHaveAttribute("href", "/");
    await expect(page.locator('a[href="/archive"]')).toHaveCount(0);
  });

  test("for an address with no Daily number, says the page can't be found", async ({
    page,
  }) => {
    await page.goto("/daily/abc/results");
    await expect(page.getByText("We couldn't find that page.")).toBeVisible();
    // Exact: the close button is "Close the results and go to Today".
    await expect(
      page.getByRole("link", { name: "Go to Today", exact: true }),
    ).toHaveAttribute("href", "/");
    await expect(
      page.getByText("These results have moved to the archive."),
    ).toHaveCount(0);
  });
});

/** Wave 1 exit: the fixture Dailies on PRA-1's and MYS-1's plugins and round components. */
test.describe("playing the fixture Dailies (Wave 1 exit)", () => {
  /** Plays a Mystery on Next clue to its options, then picks the one matching `pattern`. */
  async function playMysteryToOptions(page: Page, pattern: RegExp) {
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    await page.getByRole("button", { name: pattern }).click();
  }

  test("a typed guess finds its suggestions, and a wrong one keeps the field and survives a reload", async ({
    page,
  }) => {
    // The suggestions come from MYS-1's person list (screen/answer-lists.ts).
    await page.goto("/daily");
    const round = page.locator("[data-round-area]");
    const field = round.getByRole("combobox");
    await field.fill("Cor");
    const suggestion = page.getByRole("option", { name: /Corin Ashby/ });
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await round.getByRole("button", { name: "Guess", exact: true }).click();
    await expect(round.getByText(/Not Corin Ashby/)).toBeVisible();
    await expect(round.getByRole("heading", { name: /clue 2/i })).toBeVisible();
    await expect(field).toBeFocused();
    const actions = () =>
      page.evaluate(() =>
        Object.values(
          (
            window as unknown as {
              __qzMock: {
                inspect(path: string): Record<string, { actions: number }>;
              };
            }
          ).__qzMock.inspect("attempts"),
        ).map((attempt) => attempt.actions),
      );
    expect(await actions()).toEqual([1]);
    await page.reload();
    await expect(round.getByText(/Not Corin Ashby/)).toHaveCount(1);
    expect(await actions()).toEqual([1]);
  });

  test("AC-DLY-09 [mc ×9, encore] renders, scores out of 9 and shares one row of nine choice glyphs", async ({
    page,
  }) => {
    // 15 November 2026: the [mc ×9, encore] fixture Daily (content/fixtures/schedule/2026-11.json).
    await page.clock.setFixedTime(new Date("2026-11-15T09:00:00Z"));
    const answers = [
      "The Tolle",
      "Hazel",
      "The Ringers' Guild",
      "A copper jar",
      "A goat-horn pipe",
      "Fish scales",
      "Ice skittles",
      "Mill ford",
      "The white stork",
    ];
    await page.goto("/daily");
    await expect(
      page.getByRole("list", { name: "Daily progress" }).getByRole("listitem"),
    ).toHaveCount(10);
    for (const [index, answer] of answers.entries()) {
      // ChoiceRound's position line ("Question 1 of 9 · Easy").
      await expect(
        page
          .locator("[data-round-area]")
          .getByText(new RegExp(`^Question ${index + 1} of 9`)),
      ).toBeVisible();
      await option(page, answer).click();
      await page
        .getByRole("button", {
          name: index < 8 ? "Next question" : "On to the Encore",
        })
        .click();
    }
    await page.getByLabel(/your number/i).fill("220");
    await page.getByRole("button", { name: "Lock in" }).click();
    await page.getByRole("button", { name: "See your results" }).click();
    await expect(page).toHaveURL("/daily/56/results");
    await expect(page.locator("[data-score]")).toHaveText("9/9");
    const lines = (await page.locator("[data-share-text]").inputValue()).split(
      "\n",
    );
    expect(lines[0]).toMatch(/^Knewt Daily.#56 · 9\/9 · Encore/);
    expect(lines.slice(1, -1)).toEqual([`Questions ${"✅".repeat(9)}`]);
    expect(lines.at(-1)).toMatch(/\/daily$/);
  });

  test("AC-DLY-09 [mc ×5, mystery, encore] scores out of 9 and shares five choice glyphs, then a Mystery row", async ({
    page,
  }) => {
    // 16 November 2026: the [mc ×5, mystery, encore] fixture Daily.
    await page.clock.setFixedTime(new Date("2026-11-16T09:00:00Z"));
    await page.goto("/daily");
    for (const [index, answer] of [
      "Nella Sorrow",
      "Flour Day",
      "Beacon Knoll",
      "Heather ale",
      "1641",
    ].entries()) {
      await option(page, answer).click();
      await page
        .getByRole("button", {
          name: index < 4 ? "Next question" : "Next mystery",
        })
        .click();
    }
    await playMysteryToOptions(page, /The Lantern Keeper/);
    await page.getByRole("button", { name: "On to the Encore" }).click();
    await page.getByLabel(/your number/i).fill("1391");
    await page.getByRole("button", { name: "Lock in" }).click();
    await page.getByRole("button", { name: "See your results" }).click();
    await expect(page.locator("[data-score]")).toHaveText("6/9");
    const lines = (await page.locator("[data-share-text]").inputValue()).split(
      "\n",
    );
    expect(lines.slice(1, -1)).toEqual([
      `Questions ${"✅".repeat(5)}`,
      "Film & TV 🟧🟧🟧✅",
    ]);
    // The Lantern Keeper as R1-30 rewrote it gave nothing away early.
    await expectSealedPayloads(page);
  });

  test("the home card follows the Daily: in progress, then finished with its grid", async ({
    page,
  }) => {
    await mockInit(page, { scenario: "in_progress_mystery_2" });
    await page.goto("/");
    const card = page.locator("[data-daily-card]");
    await expect(card.getByRole("heading")).toHaveText(
      "Continue Daily #42 · Mystery 2 of 3",
    );
    await expect(card.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/daily",
    );
    await page.evaluate(() =>
      (
        window as unknown as { __qzMock: { seed(s: string): Promise<void> } }
      ).__qzMock.seed("finished_today"),
    );
    await page.reload();
    await expect(card.getByRole("heading")).toHaveText("Done for today · 9/12");
    await expect(
      card.getByRole("link", { name: "See results" }),
    ).toHaveAttribute("href", "/daily/42/results");
    await expect(card).toContainText("Next Daily in 15h 0m");
  });
});

/** One analytics event as the mock build records it (`window.__qzTrackLog`). */
interface Tracked {
  name: string;
  props: Record<string, unknown>;
}

/** The props of every `name` event this page has tracked so far. */
async function tracked(page: Page, name: string): Promise<unknown[]> {
  const log = await page.evaluate(
    () =>
      (window as unknown as { __qzTrackLog?: Tracked[] }).__qzTrackLog ?? [],
  );
  return log.filter((event) => event.name === name).map((e) => e.props);
}

/** The page's polite status region (src/ui/announce.ts). */
const statusRegion = (page: Page) => page.locator("#qz-live-polite");

/** No Web Share, as in desktop Chromium on Linux and the in-app browsers round 1 met. */
async function withoutWebShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const proto = Navigator.prototype as unknown as Record<string, unknown>;
    delete proto.share;
    delete proto.canShare;
  });
}

/** 200% text, as a phone's text-size setting gives it (R1-03). */
const BIG_TEXT = "html { font-size: 200% !important; }";
/** WCAG 1.4.12's text spacing, as AC-A11Y-06 applies it. */
const TEXT_SPACING = [
  "* { line-height: 1.5 !important; letter-spacing: 0.12em !important;",
  "word-spacing: 0.16em !important; }",
  "p { margin-bottom: 2em !important; }",
].join(" ");

/**
 * AC-A11Y-04's "no clipping" DOM check: every visible text or control sits
 * inside the viewport horizontally, any of them whose overflow is hidden
 * (and every text box) shows all of its content, and the page doesn't
 * scroll sideways. Visually hidden text (`sr-only`, the live regions) is
 * out of sight on purpose and doesn't count.
 */
async function expectNoClipping(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    if (document.documentElement.scrollWidth > width) {
      found.push(`the page is ${document.documentElement.scrollWidth} px wide`);
    }
    // `sr-only` clips to nothing (the skip link's padding widens its box),
    // and the live regions clip to an empty rectangle.
    const visuallyHidden = (element: Element) => {
      for (let at: Element | null = element; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (
          style.clipPath === "inset(50%)" ||
          style.clip === "rect(0px, 0px, 0px, 0px)"
        ) {
          return true;
        }
      }
      return false;
    };
    const clips = (value: string) => value === "hidden" || value === "clip";
    for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
      const control = element.matches(
        "a[href], button, input, select, textarea, summary, [tabindex], [role='button'], [role='menuitem']",
      );
      const text = [...element.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE &&
          (node.textContent ?? "").trim() !== "",
      );
      if (!control && !text) continue;
      if (!element.checkVisibility({ visibilityProperty: true })) continue;
      if (visuallyHidden(element)) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      const name = `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 30)}"`;
      if (box.left < -0.5 || box.right > width + 0.5) {
        found.push(
          `${name} runs from x ${Math.round(box.left)} to ${Math.round(box.right)}`,
        );
      }
      const style = getComputedStyle(element);
      const field = element instanceof HTMLTextAreaElement;
      if (
        clips(style.overflowX) &&
        element.scrollWidth > element.clientWidth + 1
      ) {
        found.push(
          `${name} hides ${element.scrollWidth - element.clientWidth} px sideways`,
        );
      }
      if (
        (field || clips(style.overflowY)) &&
        element.scrollHeight > element.clientHeight + 1
      ) {
        found.push(
          `${name} hides ${element.scrollHeight - element.clientHeight} px below`,
        );
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
}

/** RITE round 1's findings for the Daily (docs/playtests/rite-1.md, FIX-DLY). */
test.describe("RITE round 1", () => {
  test.describe("Share (R1-01, PRD §3.5.2)", () => {
    test.use({ permissions: ["clipboard-read", "clipboard-write"] });

    test("AC-SHR-05 with navigator.share absent, the stop screen's Share copies its text and logs share_complete with method clipboard", async ({
      page,
    }) => {
      await withoutWebShare(page);
      await mockInit(page, { scenario: "finished_today" });
      await page.goto("/daily/42/results");
      const box = page.locator("[data-share-text]");
      await expect(box).toHaveValue(/^Knewt Daily/);
      await page.getByRole("button", { name: "Share", exact: true }).click();
      // A toast says it (DESIGN §6.9), and the status region speaks it.
      const toast = page.locator("[data-toast]");
      await expect(toast).toHaveText("Copied. Paste it into your group chat.");
      await expect(toast).toBeVisible();
      await expect(statusRegion(page)).toHaveText(
        "Copied. Paste it into your group chat.",
      );
      await expect(page.locator("[data-share-button]")).toHaveText("Share");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        await box.inputValue(),
      );
      expect(await tracked(page, "share_open")).toEqual([
        { mode: "daily", surface: "stop" },
      ]);
      expect(await tracked(page, "share_complete")).toEqual([
        { method: "clipboard", mode: "daily", surface: "stop" },
      ]);
    });

    test("R1-01 a keyboard alone selects just the share text, then reaches Share and copies with Enter", async ({
      page,
    }) => {
      await withoutWebShare(page);
      await mockInit(page, { scenario: "finished_today" });
      await page.goto("/daily/42/results");
      // The results open on their heading (R1-34); the share box is next.
      await expect(
        page.getByRole("heading", { level: 1, name: "Daily #42" }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      const box = page.getByRole("textbox", { name: "Your share text" });
      await expect(box).toBeFocused();
      await page.keyboard.press("ControlOrMeta+a");
      const text = await box.inputValue();
      // Select-all in the box takes the share alone, never the answers around it.
      expect(
        await box.evaluate((el: HTMLTextAreaElement) => [
          el.selectionStart,
          el.selectionEnd,
        ]),
      ).toEqual([0, text.length]);
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("button", { name: "Share", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(statusRegion(page)).toHaveText(
        "Copied. Paste it into your group chat.",
      );
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        text,
      );
    });

    test("R1-01 shows the text selected in a box with 'Copy this text' when neither Web Share nor the clipboard works", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await withoutWebShare(page);
      await page.addInitScript(() => {
        Clipboard.prototype.writeText = () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError"));
      });
      await mockInit(page, { scenario: "finished_today" });
      await page.goto("/daily/42/results");
      await page.getByRole("button", { name: "Share", exact: true }).click();
      const fallback = page.getByRole("textbox", { name: "Copy this text" });
      await expect(fallback).toBeFocused();
      const text = await page.locator("[data-share-text]").inputValue();
      await expect(fallback).toHaveValue(text);
      // All of it shows, wrapped lines too, as wide as the share box above.
      expect(
        await fallback.evaluate((el) => el.scrollHeight <= el.clientHeight),
      ).toBe(true);
      const shareBox = await page.locator("[data-share-text]").boundingBox();
      const box = await fallback.boundingBox();
      expect(Math.abs((box?.width ?? 0) - (shareBox?.width ?? 0))).toBeLessThan(
        1,
      );
      expect(
        await fallback.evaluate((el: HTMLTextAreaElement) => [
          el.selectionStart,
          el.selectionEnd,
        ]),
      ).toEqual([0, text.length]);
      expect(await tracked(page, "share_complete")).toEqual([]);
      await page.keyboard.press("ControlOrMeta+c");
      await expect
        .poll(() => tracked(page, "share_complete"))
        .toEqual([{ method: "manual", mode: "daily", surface: "stop" }]);
    });

    test("AC-SHR-04 counts one share_complete when Web Share resolves, and a share_cancel and nothing more when it is dismissed", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const page = window as unknown as {
          __shared: unknown[];
          __shareAnswer?: "abort";
        };
        page.__shared = [];
        Object.defineProperty(Navigator.prototype, "share", {
          configurable: true,
          value(data: unknown) {
            page.__shared.push(data);
            return page.__shareAnswer === "abort"
              ? Promise.reject(new DOMException("Share canceled", "AbortError"))
              : Promise.resolve();
          },
        });
      });
      await mockInit(page, { scenario: "finished_today" });
      await page.goto("/daily/42/results");
      const share = page.getByRole("button", { name: "Share", exact: true });
      await share.click();
      await expect
        .poll(() => tracked(page, "share_complete"))
        .toEqual([{ method: "native", mode: "daily", surface: "stop" }]);
      // The text alone, with the link as its last line.
      expect(
        await page.evaluate(
          () => (window as unknown as { __shared: unknown[] }).__shared,
        ),
      ).toEqual([
        { text: await page.locator("[data-share-text]").inputValue() },
      ]);

      await page.evaluate(() => {
        (window as unknown as { __shareAnswer: string }).__shareAnswer =
          "abort";
      });
      await share.click();
      await expect
        .poll(() => tracked(page, "share_cancel"))
        .toEqual([{ mode: "daily", surface: "stop" }]);
      expect(await tracked(page, "share_complete")).toHaveLength(1);
      expect(await tracked(page, "share_open")).toHaveLength(2);
    });

    test("AC-SHR-11 the finished home card's Share copies the stop screen's own text and logs share_open with surface home", async ({
      page,
    }) => {
      await withoutWebShare(page);
      await mockInit(page, { scenario: "finished_today" });
      await page.goto("/");
      const card = page.locator('[data-daily-card="finished"]');
      await card.getByRole("button", { name: "Share", exact: true }).click();
      await expect(statusRegion(page)).toHaveText(
        "Copied. Paste it into your group chat.",
      );
      const fromHome = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(await tracked(page, "share_open")).toEqual([
        { mode: "daily", surface: "home" },
      ]);
      expect(await tracked(page, "share_complete")).toEqual([
        { method: "clipboard", mode: "daily", surface: "home" },
      ]);
      await page.goto("/daily/42/results");
      expect(await page.locator("[data-share-text]").inputValue()).toBe(
        fromHome,
      );
    });
  });

  test("R1-02 Today's Daily card shows no Past 7 days link while the archive has no route", async ({
    page,
  }) => {
    await page.goto("/");
    const card = page.locator("[data-daily-card]");
    await expect(card.locator("li").first()).toHaveText("A person · Easy");
    await expect(card.getByRole("link", { name: "Past 7 days" })).toHaveCount(
      0,
    );
    await expect(page.locator('a[href="/archive"]')).toHaveCount(0);
  });

  test.describe("the Daily header on a phone (R1-03)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("R1-03 at 200% text the header fits on one row: DS-1's pills and stopwatch keep their size, the words stay out of sight, nothing scrolls sideways", async ({
      page,
    }) => {
      await page.goto("/daily");
      await expect(
        page.getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await page.addStyleTag({ content: BIG_TEXT });
      // The pills' type is in px (DESIGN §10.5), so 200% text leaves them
      // room: the words, for the eye alone, stay out of sight.
      const words = page.locator("[data-progress-text]");
      await expect(words).toHaveAttribute("aria-hidden", "true");
      await expect(words).toBeHidden();
      const list = page.getByRole("list", { name: "Daily progress" });
      await expect(list).toBeVisible();
      await expect(list.getByRole("listitem")).toHaveCount(4);
      const watch = page.locator("[data-stopwatch]");
      // After "Time so far", which only screen readers hear.
      await expect(watch).toHaveText(/\b0:00$/);
      const pills = await list.boundingBox();
      const box = await watch.boundingBox();
      // Beside the pills, on their row, and 36 px tall as at ordinary text.
      expect(
        Math.abs(
          (box?.y ?? 0) +
            (box?.height ?? 0) / 2 -
            ((pills?.y ?? 0) + (pills?.height ?? 0) / 2),
        ),
      ).toBeLessThan(4);
      expect(box?.height ?? Infinity).toBeLessThanOrEqual(36.5);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
      expect(
        await watch.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const header = page.locator("header").first();
      expect(
        await header.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
    });

    test("R1-03 where the header can't hold even the narrowest pills, the words take their place, wrapping by word", async ({
      page,
    }) => {
      await page.goto("/daily");
      await expect(
        page.getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await page.addStyleTag({ content: BIG_TEXT });
      // Under the pills' 127 px (four at 28 px with their gaps).
      await page.addStyleTag({
        content: "[data-header-status] { width: 120px !important; }",
      });
      const words = page.locator("[data-progress-text]");
      await expect(words).toBeVisible();
      await expect(words).toHaveText("Mystery 1 of 3");
      // Screen readers keep the pills' list, only out of sight.
      const list = page.getByRole("list", { name: "Daily progress" });
      await expect(list.getByRole("listitem")).toHaveCount(4);
      expect(
        await list.evaluate((el) => {
          const box = el.parentElement?.getBoundingClientRect();
          return box !== undefined && box.width <= 1 && box.height <= 1;
        }),
      ).toBe(true);
      // The words wrap by word on their own line, never letter by letter.
      expect(
        await words.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeLessThan(150);
    });

    test("R1-03 with ordinary text the same phone keeps the pills and the stopwatch's icon", async ({
      page,
    }) => {
      await page.goto("/daily");
      await expect(
        page.getByRole("list", { name: "Daily progress" }),
      ).toBeVisible();
      await expect(page.locator("[data-progress-text]")).toBeHidden();
      await expect(page.locator("[data-stopwatch] svg")).toBeVisible();
    });

    test("R1-03 at 200% text the words (out of sight while the pills fit) say only where the run is, and the list still names a finished Mystery's 3 points", async ({
      page,
    }) => {
      await mockInit(page, { scenario: "in_progress_mystery_2" });
      await page.goto("/daily");
      await expect(
        page.getByRole("list", { name: "Daily progress" }),
      ).toBeVisible();
      await page.addStyleTag({ content: BIG_TEXT });
      // The finished rounds' marks took the header to four lines.
      await expect(page.locator("[data-progress-text]")).toHaveText(
        "Mystery 2 of 3",
      );
      await expect(page.getByRole("banner")).toMatchAriaSnapshot(`
        - list "Daily progress":
          - listitem: Mystery 1, solved on clue 2, 3 points
          - listitem: Mystery 2, playing now
          - listitem: Mystery 3, not started
          - listitem: Encore, not started
      `);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
    });

    test("R1-03 at 320 px the pills keep one row with '+3', the stopwatch beside them, and nothing runs off", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await mockInit(page, { scenario: "in_progress_mystery_2" });
      await page.goto("/daily");
      const list = page.getByRole("list", { name: "Daily progress" });
      await expect(list).toBeVisible();
      await expect(list.getByRole("listitem").first()).toContainText("+3");
      await expect(page.locator("[data-progress-text]")).toBeHidden();
      // DS-1's flat pills give up width (never under 28 px) rather than wrap.
      const tops = await list
        .getByRole("listitem")
        .evaluateAll((items) =>
          items.map((item) => Math.round(item.getBoundingClientRect().top)),
        );
      expect(new Set(tops).size).toBe(1);
      const pills = await list.boundingBox();
      const watch = await page.locator("[data-stopwatch]").boundingBox();
      expect(watch?.x ?? 0).toBeGreaterThanOrEqual(
        (pills?.x ?? 0) + (pills?.width ?? 0),
      );
      expect((watch?.x ?? 0) + (watch?.width ?? 0)).toBeLessThanOrEqual(320);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
    });

    test("R1-03 at 360 by 640 with 200% text the sticky header stays under 160 px on every round, the Encore included", async ({
      page,
    }) => {
      // The words grew a line per finished Mystery: 217 px, a third of the
      // screen, from Mystery 3 on.
      await page.setViewportSize({ width: 360, height: 640 });
      await page.goto("/daily");
      await expect(
        page.getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await page.addStyleTag({ content: BIG_TEXT });
      const header = page.locator("header").first();
      const words = page.locator("[data-progress-text]");
      const height = async () => (await header.boundingBox())?.height ?? 0;
      for (const [where, next] of [
        ["Mystery 1 of 3", "Next mystery"],
        ["Mystery 2 of 3", "Next mystery"],
        ["Mystery 3 of 3", "On to the Encore"],
      ] as const) {
        await expect(words).toHaveText(where);
        expect(await height(), where).toBeLessThanOrEqual(160);
        for (let clue = 1; clue < 4; clue += 1) {
          await page
            .getByRole("button", { name: /^(Next clue|Last clue)/ })
            .click();
        }
        await page.getByRole("button", { name: /^A\. / }).click();
        await page.getByRole("button", { name: next }).click();
      }
      await expect(words).toHaveText("Encore");
      expect(await height()).toBeLessThanOrEqual(160);
      // Every result is still in the pills' list.
      await expect(
        page
          .getByRole("list", { name: "Daily progress" })
          .getByRole("listitem"),
      ).toHaveCount(4);
    });

    // DS-1 sets the pills' marks in px (DESIGN §10.5), so at 200% text
    // they stay inside their 38 by 30 box.
    test("R1-03 at 200% text on a tablet each pill still holds its mark", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await mockInit(page, { scenario: "in_progress_mystery_2" });
      await page.goto("/daily");
      const pills = page
        .getByRole("list", { name: "Daily progress" })
        .getByRole("listitem");
      await expect(pills).toHaveCount(4);
      await page.addStyleTag({ content: BIG_TEXT });
      await expect(page.locator("[data-progress-text]")).toBeHidden();
      for (const pill of await pills.all()) {
        const [outer, mark] = await pill.evaluate((el) =>
          [el, el.querySelector("[aria-hidden]") ?? el].map((node) => {
            const box = node.getBoundingClientRect();
            return [box.left, box.top, box.right, box.bottom];
          }),
        );
        const [left, top, right, bottom] = mark ?? [];
        expect(left).toBeGreaterThanOrEqual(outer?.[0] ?? Infinity);
        expect(top).toBeGreaterThanOrEqual(outer?.[1] ?? Infinity);
        expect(right).toBeLessThanOrEqual(outer?.[2] ?? -Infinity);
        expect(bottom).toBeLessThanOrEqual(outer?.[3] ?? -Infinity);
      }
    });

    test("AC-A11Y-04 at 200% text the More menu stays on a phone's screen, its items wrapping instead", async ({
      page,
    }) => {
      for (const viewport of [
        { width: 320, height: 568 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto("/daily");
        await expect(
          page.getByRole("heading", { name: /clue 1/i }),
        ).toBeVisible();
        await page.addStyleTag({ content: BIG_TEXT });
        await page.getByRole("button", { name: "More" }).click();
        const items = page.getByRole("menuitem");
        await expect(items).toHaveCount(2);
        for (const item of await items.all()) {
          const box = await item.boundingBox();
          expect(
            box?.x ?? -1,
            viewport.width.toString(),
          ).toBeGreaterThanOrEqual(0);
          expect(
            (box?.x ?? 0) + (box?.width ?? Infinity),
            viewport.width.toString(),
          ).toBeLessThanOrEqual(viewport.width);
        }
        await page.keyboard.press("Escape");
      }
    });
  });

  test.describe("the More menu, How to play and the stopwatch (R1-04, R1-05)", () => {
    test("R1-05 a first Daily says 'Take your time. Time only breaks ties.' beside the stopwatch, which opens More at Hide stopwatch", async ({
      page,
    }) => {
      await page.goto("/daily");
      await expect(
        page.getByText("Take your time. Time only breaks ties."),
      ).toBeVisible();
      const watch = page.locator("[data-stopwatch]");
      // A screen reader hears it on the stopwatch itself.
      await expect(watch).toHaveAccessibleDescription(
        "Take your time. Time only breaks ties.",
      );
      await watch.click();
      const menu = page.getByRole("menu", { name: "More" });
      await expect(menu).toBeVisible();
      await expect(
        menu.getByRole("menuitem", { name: "Hide stopwatch" }),
      ).toBeFocused();
      await expect(watch).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(watch).toBeFocused();
    });

    test("R1-04 the next date's Daily, once one is finished, shows no first-Daily hint", async ({
      page,
    }) => {
      await mockInit(page, { scenario: "finished_today" });
      await page.goto("/");
      await expect(page.locator('[data-daily-card="finished"]')).toBeVisible();
      // Monday 2 November: Daily #43, after a finished #42.
      await page.clock.setFixedTime(new Date("2026-11-02T09:00:00Z"));
      await page.goto("/daily");
      await expect(
        page.getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await expect(page.locator("[data-stopwatch]")).toBeVisible();
      await expect(
        page.getByText("Take your time. Time only breaks ties."),
      ).toHaveCount(0);
      await expect(page.locator("[data-stopwatch]")).not.toHaveAttribute(
        "aria-describedby",
      );
      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "How to play" }).click();
      expect(await tracked(page, "how_to_play_open")).toEqual([
        { round: 1, first_daily: false },
      ]);
    });

    test("AC-DLY-30 More opens How to play: the five parts in order, focus back on the clue when it closes, one how_to_play_open", async ({
      page,
    }) => {
      await page.goto("/daily");
      const clue = page.getByRole("heading", { name: /clue 1/i });
      await expect(clue).toBeVisible();
      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "How to play" }).click();
      const sheet = page.getByRole("dialog", { name: "How to play" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("heading", { level: 3 })).toHaveText([
        "The clue ladder",
        "The points",
        "Clue 4",
        "The Encore",
        "The ranking",
      ]);
      await expect(sheet).toContainText(
        "A wrong guess costs exactly what Next clue costs",
      );
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(clue).toBeFocused();
      expect(await tracked(page, "how_to_play_open")).toEqual([
        { round: 1, first_daily: true },
      ]);
    });

    test("AC-DLY-12 the stopwatch hides from More and stays hidden after a reload, comes back from More, and never speaks", async ({
      page,
    }) => {
      await page.goto("/daily");
      const watch = page.locator("[data-stopwatch]");
      await expect(watch).toHaveAttribute("aria-live", "off");
      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Hide stopwatch" }).click();
      await expect(watch).toHaveCount(0);
      // Its hint goes with it.
      await expect(
        page.getByText("Take your time. Time only breaks ties."),
      ).toHaveCount(0);
      expect(await tracked(page, "settings_change")).toEqual([
        { setting: "stopwatch", value: "hidden" },
      ]);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await expect(watch).toHaveCount(0);
      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Show stopwatch" }).click();
      await expect(watch).toBeVisible();
      await expect(watch).toHaveAttribute("aria-live", "off");
    });
  });

  test.describe("the stop screen (R1-07, R1-16, R1-19, D7, R1-34)", () => {
    test.beforeEach(async ({ page }) => {
      await mockInit(page, { scenario: "finished_today" });
      await page.goto("/daily/42/results");
      await expect(page.locator("[data-score]")).toHaveText("9/12");
    });

    test("R1-07 the Encore row says the Encore breaks ties and scores no points", async ({
      page,
    }) => {
      const row = page.locator('[data-round-row="encore"]');
      await expect(row).toContainText("Breaks ties. Scores no points.");
    });

    test("R1-16 the grid paints every clue used before the solve 🟧, never red, and explains itself in one line", async ({
      page,
    }) => {
      const rows = page.locator("[data-score-rows]");
      await expect(rows).toContainText("History ✅⬜⬜⬜");
      await expect(rows).toContainText("Geography 🟧✅⬜⬜");
      await expect(rows).toContainText("Science & Tech 🟧🟧✅⬜");
      await expect(rows).not.toContainText("🟥");
      await expect(page.locator("[data-legend]")).toHaveText(
        "🟧 clue used · ✅ solved · ⬜ not needed",
      );
      // Outside the rows only the eye needs, so a screen reader hears it,
      // and it describes the share box that reads the glyphs by name.
      await expect(
        page.getByRole("paragraph").filter({ hasText: "clue used" }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("textbox", { name: "Your share text" }),
      ).toHaveAccessibleDescription(
        "No answers inside. 🟧 clue used · ✅ solved · ⬜ not needed",
      );
    });

    test("R1-19 the share's first line says 'Encore off by 4%', while the Encore row keeps '4% off'", async ({
      page,
    }) => {
      const text = await page.locator("[data-share-text]").inputValue();
      expect(text.split("\n")[0]?.replaceAll(" ", " ")).toBe(
        "Knewt Daily #42 · 9/12 · Encore off by 4% 🎯",
      );
      await expect(page.locator('[data-round-row="encore"]')).toContainText(
        ": 4% off",
      );
    });

    test("R1-05 D7 the score card shows the total time, which only breaks ties, and the share never carries a time", async ({
      page,
    }) => {
      await expect(page.locator("[data-time]")).toHaveText(
        /^Time \d+:\d\d · only breaks ties$/,
      );
      // Every line but the link, whose port would read as a time.
      const lines = (await page.locator("[data-share-text]").inputValue())
        .split("\n")
        .slice(0, -1);
      expect(lines.join("\n")).not.toMatch(/\d+:\d\d/);
    });

    test("R1-12 the dock holds Done for today at the bottom, and tabbing never leaves focus under it, at 200% text", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 640 });
      await page.addStyleTag({ content: BIG_TEXT });
      const dock = page.locator("[data-results-dock]");
      await expect(
        dock.getByRole("link", { name: "Done for today" }),
      ).toBeVisible();
      // Sticky at the screen's bottom while the results scroll under it,
      // one button tall even at 200% text.
      const box = await dock.boundingBox();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(640.5);
      expect(box?.height ?? Infinity).toBeLessThan(640 / 4);
      // Its height is the page's bottom scroll inset (ScrollInset).
      await expect
        .poll(() =>
          page.evaluate(() =>
            Number.parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue(
                "--kn-inset-bottom",
              ),
            ),
          ),
        )
        .toBeGreaterThanOrEqual(Math.floor(box?.height ?? Infinity));
      const hidden: string[] = [];
      for (let step = 0; step < 40; step += 1) {
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => {
          const element = document.activeElement;
          const bar = document.querySelector("[data-results-dock]");
          const header = document.querySelector("header");
          if (!(element instanceof HTMLElement) || bar === null) return null;
          const rect = element.getBoundingClientRect();
          return {
            name: element.textContent?.trim().slice(0, 40) ?? "",
            inDock: bar.contains(element),
            top: rect.top,
            bottom: rect.bottom,
            dockTop: bar.getBoundingClientRect().top,
            headerBottom: header?.getBoundingClientRect().bottom ?? 0,
          };
        });
        if (focus === null || focus.inDock) break;
        // Never under the dock (WCAG 2.4.11), and whole above it, with room
        // for the 3 px ring at its 3 px offset, wherever it can fit there.
        const room = focus.dockTop - focus.headerBottom;
        const whole = focus.bottom - focus.top + 12 <= room;
        if (
          focus.top > focus.dockTop - 6 ||
          (whole && focus.bottom > focus.dockTop - 6)
        ) {
          hidden.push(
            `${focus.name}: ${Math.round(focus.top)} to ${Math.round(focus.bottom)}, dock at ${Math.round(focus.dockTop)}`,
          );
        }
      }
      expect(hidden).toEqual([]);
    });

    test("R1-34 the results open on their heading, the route's one h1", async ({
      page,
    }) => {
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveText("Daily #42");
      await expect(heading).toBeFocused();
    });

    test("AC-A11Y-04 AC-A11Y-06 at 320 px nothing clips or scrolls sideways, with 200% text or with text spacing", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      for (const style of [BIG_TEXT, TEXT_SPACING]) {
        await page.reload();
        await expect(page.locator("[data-score]")).toHaveText("9/12");
        await page.addStyleTag({ content: style });
        await expectNoClipping(page);
      }
    });
  });

  test("R1-08 a solved Mystery's pill shows +3 and names its points, and no pill acts like a button", async ({
    page,
  }) => {
    await mockInit(page, { scenario: "in_progress_mystery_2" });
    await page.goto("/daily");
    const list = page.getByRole("list", { name: "Daily progress" });
    const pills = list.getByRole("listitem");
    await expect(pills).toHaveCount(4);
    await expect(pills.first()).toContainText("+3");
    await expect(pills.first()).toContainText(
      "Mystery 1, solved on clue 2, 3 points",
    );
    await expect(list.getByRole("button")).toHaveCount(0);
    for (const pill of await pills.all()) {
      expect(await pill.evaluate((el) => getComputedStyle(el).cursor)).not.toBe(
        "pointer",
      );
    }
  });

  test("R1-22 D10 a solve after a wrong guess stamps and says Got there., never Knew it.", async ({
    page,
  }) => {
    await page.goto("/daily");
    const round = page.locator("[data-round-area]");
    const field = round.getByRole("combobox");
    await field.fill("Cor");
    await page.getByRole("option", { name: /Corin Ashby/ }).click();
    await round.getByRole("button", { name: "Guess", exact: true }).click();
    await expect(round.getByRole("heading", { name: /clue 2/i })).toBeVisible();
    await field.fill("Odile");
    await page.getByRole("option", { name: /Odile Marsh/ }).click();
    await round.getByRole("button", { name: "Guess", exact: true }).click();
    // The reveal's stamp and the status region agree (the controller
    // passes the round's miss to the announcement).
    const stamp = round.locator('[data-verdict="solved"]');
    await expect(stamp).toHaveText("Got there.");
    await expect(statusRegion(page)).toHaveText(
      "Got there. Odile Marsh. Solved on clue 2, 3 points.",
    );
  });

  test.describe("a resumed reveal keeps the round's misses (R1-22, D10)", () => {
    /** The reveal's row for clue `n`. */
    const clueRow = (page: Page, n: number) =>
      page.locator("[data-reveal] ol li").nth(n - 1);

    /** A wrong guess of Corin Ashby on Mystery 1's clue 1. */
    async function guessCorin(page: Page) {
      await page.goto("/daily");
      const round = page.locator("[data-round-area]");
      await round.getByRole("combobox").fill("Cor");
      await page.getByRole("option", { name: /Corin Ashby/ }).click();
      await round.getByRole("button", { name: "Guess", exact: true }).click();
      await expect(
        round.getByRole("heading", { name: /clue 2/i }),
      ).toBeVisible();
    }

    /** Leave for Today, then Continue from the Daily card. */
    async function leaveAndContinue(page: Page) {
      await page
        .getByRole("link", { name: "Leave the Daily. Your progress is saved." })
        .click();
      await expect(page).toHaveURL("/");
      await page
        .locator('[data-daily-card="in_progress"]')
        .getByRole("link", { name: "Continue" })
        .click();
      await expect(page).toHaveURL("/daily");
    }

    test("R1-22 D10 a solve after a wrong guess still stamps Got there. and says You guessed after a reload, and after Leave and Continue", async ({
      page,
    }) => {
      await guessCorin(page);
      const round = page.locator("[data-round-area]");
      await round.getByRole("combobox").fill("Odile");
      await page.getByRole("option", { name: /Odile Marsh/ }).click();
      await round.getByRole("button", { name: "Guess", exact: true }).click();
      const stamp = page.locator('[data-verdict="solved"]');
      const expectTheMiss = async () => {
        await expect(stamp).toHaveText("Got there.");
        await expect(clueRow(page, 1)).toContainText("You guessed Corin Ashby");
        await expect(clueRow(page, 2)).toContainText("Solved here");
        await expect(
          page.getByRole("heading", { level: 1, name: "Odile Marsh" }),
        ).toBeFocused();
      };
      await expectTheMiss();
      await page.reload();
      await expectTheMiss();
      await leaveAndContinue(page);
      await expectTheMiss();
    });

    test("R1-22 a miss keeps You guessed and You picked after a reload, and after Leave and Continue", async ({
      page,
    }) => {
      await guessCorin(page);
      for (let clue = 2; clue < 4; clue += 1) {
        await page
          .getByRole("button", { name: /^(Next clue|Last clue)/ })
          .click();
      }
      // A wrong pick: Mira Tolland, one of the three decoys.
      await page
        .getByRole("button", { name: /^[A-D]\. Mira Tolland$/ })
        .click();
      const expectTheMisses = async () => {
        await expect(page.locator('[data-verdict="missed"]')).toHaveText(
          "This one got away.",
        );
        await expect(clueRow(page, 1)).toContainText("You guessed Corin Ashby");
        await expect(clueRow(page, 4)).toContainText("You picked Mira Tolland");
      };
      await expectTheMisses();
      await page.reload();
      await expectTheMisses();
      await leaveAndContinue(page);
      await expectTheMisses();
    });
  });

  test("R1-34 the Daily screen has one h1 while a round shows: the round's own", async ({
    page,
  }) => {
    await page.goto("/daily");
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test.describe("Leave (R1-38)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("R1-38 Leave shows 'Saved' on Today, above the tab bar, says it in the status region, and keeps its edge in forced colours", async ({
      page,
    }) => {
      await page.goto("/daily");
      await expect(
        page.getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Leave the Daily. Your progress is saved." })
        .click();
      await expect(page).toHaveURL("/");
      const toast = page.locator("[data-toast]");
      await expect(toast).toHaveText("Saved");
      await expect(toast).toBeVisible();
      await expect(statusRegion(page)).toHaveText("Saved");
      // In forced colours its fill drops out, and its border, painted in
      // the system's text colour, keeps the pill's shape (DESIGN §11).
      await page.emulateMedia({ forcedColors: "active" });
      const [edge, ink] = await toast.evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.borderTopWidth, style.borderTopColor];
      });
      expect(edge).toBe("2px");
      expect(ink).not.toBe("rgba(0, 0, 0, 0)");
      await page.emulateMedia({ forcedColors: "none" });
      const bar = await page
        .locator('nav[data-placement="bottom"]')
        .boundingBox();
      const pill = await toast.boundingBox();
      expect((pill?.y ?? 0) + (pill?.height ?? 0)).toBeLessThanOrEqual(
        (bar?.y ?? 0) - 16 + 1,
      );
    });
  });
});
