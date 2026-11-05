/**
 * RITE round 2's findings for the shell and the primitives (FIX2-DS;
 * docs/playtests/rite-2.md §4, §6, §8 and §9, decisions memo §22), each
 * reproduced the way the personas met it, on the mock build. Every title
 * starts with its finding's id.
 *
 * - R2-06: the Daily's pills, Today's round chips and the Mystery's
 *   category chip are flat marks (D11): no border, no ledge, no pointer,
 *   in every state; the current pill is filled in ink with a bar under
 *   it, never ringed like keyboard focus; a longer mark (the Encore's % off
 *   to come) stays inside its pill; and a tap on the stopwatch on a 390 px
 *   phone opens the More menu at Hide stopwatch, as DESIGN §6.7 says.
 * - R2-07: Groups, Me and Settings each say what's coming there and what
 *   works now, instead of "This part of Knewt isn't ready yet."
 * - R2-17: question and option text is never split with a hyphen, at 200%
 *   text on a phone included, whatever a round around it asks for.
 * - R2-28: placeholder text holds 4.5:1 on every surface a field sits on,
 *   and practice's empty segments have a 3:1 edge.
 * - R2-34: Settings marks no tab.
 */
import type { Locator, Page } from "@playwright/test";

import { markFit } from "../../src/ui/mark-fit";
import { expect, test } from "../fixtures";

/** WCAG 2.2 relative luminance of a computed `rgb(...)` colour. */
function luminance(colour: string): number {
  const parts = /^rgba?\((\d+), (\d+), (\d+)/.exec(colour);
  if (parts === null) throw new Error(`not an rgb colour: ${colour}`);
  const [r, g, b] = parts.slice(1, 4).map((part) => {
    const c = Number(part) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** How an element is drawn: what reads as a button, and what reads as focus. */
interface Look {
  border: number;
  shadow: string;
  cursor: string;
  outline: string;
}

function looksOf(locator: Locator): Promise<Look[]> {
  return locator.evaluateAll((elements) =>
    elements.map((element) => {
      const css = getComputedStyle(element);
      return {
        border: [
          css.borderTopWidth,
          css.borderRightWidth,
          css.borderBottomWidth,
          css.borderLeftWidth,
        ].reduce((sum, width) => sum + Number.parseFloat(width), 0),
        shadow: css.boxShadow,
        cursor: css.cursor,
        outline: css.outlineStyle,
      };
    }),
  );
}

/** A flat mark: no edge, no ledge, nothing to point at (D11). */
function expectFlat(looks: Look[], what: string): void {
  expect(looks.length, what).toBeGreaterThan(0);
  for (const look of looks) {
    expect(look.border, what).toBe(0);
    expect(look.shadow, what).toBe("none");
    expect(look.cursor, what).not.toBe("pointer");
  }
}

const pills = (page: Page) =>
  page.locator('header ol[data-variant="pills"] > li');

/** Next clue to clue 4, then the first option: Mystery 1 resolves. */
async function resolveMysteryOne(page: Page): Promise<void> {
  for (let clue = 1; clue < 4; clue += 1) {
    await page.getByRole("button", { name: /^(Next clue|Last clue)/ }).click();
  }
  await page.getByRole("button", { name: /^A\. / }).click();
  await expect(pills(page).first()).not.toHaveAttribute(
    "data-status",
    "upcoming",
  );
}

/** Quick play from Today, to its first question. */
async function startQuickPlay(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .locator('[data-home-slot="practice"]')
    .getByRole("link", { name: /^(Quick play|Continue practice)/ })
    .click();
  await expect(page).toHaveURL("/practice/run");
  await expect(page.locator('main [data-state="idle"]').first()).toBeVisible();
}

test.describe("R2-06 pills and chips are flat marks", () => {
  test("R2-06 the Daily's pills have no border, no ledge and no pointer, open, upcoming and resolved", async ({
    page,
  }) => {
    await page.goto("/daily");
    await expect(pills(page)).toHaveCount(4);
    expectFlat(await looksOf(pills(page)), "pills at clue 1");
    // Nothing about them reads as keyboard focus either.
    for (const look of await looksOf(pills(page))) {
      expect(look.outline).toBe("none");
    }
    await resolveMysteryOne(page);
    expectFlat(await looksOf(pills(page)), "pills on the reveal");
    await page.getByRole("button", { name: "Next mystery" }).click();
    await expect(pills(page).nth(1)).toHaveAttribute("aria-current", "step");
    expectFlat(await looksOf(pills(page)), "pills at Mystery 2");
  });

  test("R2-06 the current pill is filled in ink, with the bar under it, never ringed like keyboard focus", async ({
    page,
  }) => {
    for (const [scheme, ink] of [
      ["light", "rgb(29, 26, 22)"],
      ["dark", "rgb(243, 235, 222)"],
    ] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/daily");
      const current = page.locator('header .kn-step[aria-current="step"]');
      await expect(current).toHaveCount(1);
      const look = await current.evaluate((step) => {
        const css = getComputedStyle(step);
        const bar = getComputedStyle(step, "::after");
        return {
          fill: css.backgroundColor,
          outline: css.outlineStyle,
          border: css.borderTopWidth,
          bar: bar.content === "none" ? null : bar.height,
        };
      });
      expect(look, scheme).toEqual({
        fill: ink,
        outline: "none",
        border: "0px",
        bar: "3px",
      });
      // The pills not open now are washes, so the ink one stands out.
      const others = await page
        .locator('header .kn-step:not([aria-current="step"])')
        .evaluateAll((steps) =>
          steps.map((step) => getComputedStyle(step).backgroundColor),
        );
      expect(others).toHaveLength(3);
      expect(others, scheme).not.toContain(ink);
    }
    // Keyboard focus is the page's 3 px ring, an outline outside the
    // element (globals.css, worn after a key press); the current pill has
    // no outline at all, and can't take focus.
    const ring = await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.dataset.focusRing = "";
      document.querySelector("header")?.append(probe);
      probe.focus();
      const css = getComputedStyle(probe);
      const look = { style: css.outlineStyle, width: css.outlineWidth };
      probe.remove();
      return look;
    });
    expect(ring).toEqual({ style: "solid", width: "3px" });
    await expect(
      page.locator('header .kn-step[aria-current="step"]'),
    ).not.toHaveAttribute("tabindex");
  });

  test("R2-06 Today's round chips and the Mystery's category chip are flat labels", async ({
    page,
  }) => {
    await page.goto("/");
    const chips = page.locator("[data-daily-card] .kn-chip");
    await expect(chips).toHaveCount(4);
    expectFlat(await looksOf(chips), "Today's round chips");
    await page.goto("/daily");
    const category = page.locator("[data-category-chip] .kn-chip");
    await expect(category).toBeVisible();
    expectFlat(await looksOf(category), "the Mystery's category chip");
    // A chip that is a link is the one that looks like a control.
    const looks = await page.evaluate(() => {
      const holder = document.createElement("div");
      holder.innerHTML =
        '<span class="kn-chip" data-tone="correct">Bullseye</span>' +
        '<span class="kn-chip" data-tone="accent">2</span>' +
        '<span class="kn-chip" data-tone="beta">Beta</span>' +
        '<a href="#" class="kn-chip kn-hit">Choose a category</a>';
      document.querySelector("main")?.append(holder);
      return [...holder.children].map((element) => {
        const css = getComputedStyle(element);
        return {
          border: Number.parseFloat(css.borderTopWidth),
          cursor: css.cursor,
        };
      });
    });
    expect(looks.slice(0, 3)).toEqual([
      { border: 0, cursor: "default" },
      { border: 0, cursor: "default" },
      { border: 0, cursor: "default" },
    ]);
    expect(looks[3]?.border).toBeGreaterThan(0);
    expect(looks[3]?.cursor).toBe("pointer");
  });

  test("R2-06 a pill's longer mark, such as the Encore's % off to come, stays inside its pill at its narrowest", async ({
    page,
  }) => {
    await page.goto("/daily");
    await expect(pills(page)).toHaveCount(4);
    const marks = ["E", "M3", "+4", "🎯", "4%", "13%", "<1%", "100%", "999%"];
    const spills = await page.evaluate(
      (cases) => {
        const list = document.createElement("ol");
        list.className = "kn-progress";
        list.dataset.variant = "pills";
        for (const { mark, fit } of cases) {
          const step = document.createElement("li");
          step.className = "kn-step";
          step.dataset.status = "done";
          if (fit !== null) step.dataset.fit = fit;
          // The narrowest a pill gets (R1-03).
          step.style.flex = "0 0 28px";
          const text = document.createElement("span");
          text.className = "inline-flex";
          text.textContent = mark;
          step.append(text);
          list.append(step);
        }
        document.querySelector("header")?.append(list);
        return [...list.children].flatMap((step, index) => {
          const box = step.getBoundingClientRect();
          const text = step.firstElementChild?.getBoundingClientRect();
          if (text === undefined) return [`${index}: no text`];
          return text.left >= box.left - 0.5 && text.right <= box.right + 0.5
            ? []
            : [`${cases[index]?.mark}: ${text.width} in ${box.width}`];
        });
      },
      marks.map((mark) => ({ mark, fit: markFit(mark) ?? null })),
    );
    expect(spills).toEqual([]);
  });

  test.describe("on a 390 px phone", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    test.skip(
      ({ browserName }) => browserName === "firefox",
      "Firefox has no mobile emulation",
    );

    test("R2-06 a tap on the stopwatch opens the More menu at Hide stopwatch, on a clue and on a reveal", async ({
      page,
    }) => {
      await page.goto("/daily");
      const watch = page.locator("header [data-stopwatch]");
      await expect(watch).toBeVisible();
      // A button, so it is the one part of the header that looks like one.
      await expect(watch).toHaveJSProperty("tagName", "BUTTON");
      const menu = page.getByRole("menu");
      const tapAndCheck = async () => {
        await watch.tap();
        await expect(menu).toBeVisible();
        await expect(menu).toBeInViewport({ ratio: 1 });
        await expect(
          menu.getByRole("menuitem", { name: "Hide stopwatch" }),
        ).toBeFocused();
        await expect(watch).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(watch).toBeFocused();
      };
      await tapAndCheck();
      // On a reveal the clock has stopped; the tap still opens the menu.
      for (let clue = 1; clue < 4; clue += 1) {
        await page
          .getByRole("button", { name: /^(Next clue|Last clue)/ })
          .tap();
      }
      await page.getByRole("button", { name: /^A\. / }).tap();
      await expect(
        page.getByRole("button", { name: "Next mystery" }),
      ).toBeVisible();
      await tapAndCheck();
    });
  });
});

test.describe("R2-07 placeholders say what's coming", () => {
  const LINES = [
    [
      "/g",
      "Groups",
      "Groups are on the way. Until then, paste your result into your group chat.",
    ],
    ["/me", "Me", "Your streak and past results will live here."],
    [
      "/settings",
      "Settings",
      "Settings are on the way. Hide stopwatch is in the Daily's menu.",
    ],
  ] as const;

  test("R2-07 each placeholder route renders its own line, under its title, with a way back to Today", async ({
    page,
  }) => {
    for (const [path, title, line] of LINES) {
      await page.goto(path);
      const main = page.getByRole("main");
      await expect(
        main.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(main.locator("[data-placeholder-line]")).toHaveText(line);
      await expect(
        page.getByText("This part of Knewt isn't ready yet."),
      ).toHaveCount(0);
      await expect(
        main.getByRole("link", { name: "Go to Today" }),
      ).toHaveAttribute("href", "/");
    }
  });

  test("R2-07 the Groups tab, as Priya, Marcus and Lena opened it, says what to do with a result until Groups exist", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Groups" })
      .click();
    await expect(page).toHaveURL("/g");
    await expect(page.locator("main [data-placeholder-line]")).toHaveText(
      LINES[0][2],
    );
  });
});

test.describe("R2-17 no hyphens in questions and options", () => {
  test("R2-17 practice's question and options are never split with a hyphen, at 200% text on a phone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startQuickPlay(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const question = page.locator('[data-round="choice"] [data-question]');
    await expect(question.locator("h1")).toBeVisible();
    const hyphens = await question.evaluate((element) => [
      ...new Set(
        [
          element.closest("main"),
          ...element.querySelectorAll("h1, h1 *, ol button, ol button *"),
        ].map((part) => (part ? getComputedStyle(part).hyphens : "missing")),
      ),
    ]);
    expect(hyphens).toEqual(["manual"]);
  });

  test("R2-17 the Mystery's title and clue-4 options are never split with a hyphen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/daily");
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    const options = page.getByRole("button", { name: /^[A-D]\. / });
    await expect(options).toHaveCount(4);
    const hyphens = await page.evaluate(() => [
      ...new Set(
        [
          document.querySelector("main"),
          document.querySelector("main h1"),
          ...document.querySelectorAll("main .kn-answer, main .kn-answer *"),
        ].map((part) => (part ? getComputedStyle(part).hyphens : "missing")),
      ),
    ]);
    expect(hyphens).toEqual(["manual"]);
  });

  test("R2-17 an option keeps its words whole even inside a round that asks for hyphens", async ({
    page,
  }) => {
    await startQuickPlay(page);
    const inside = await page.evaluate(() => {
      const round = document.createElement("div");
      round.lang = "en";
      round.style.hyphens = "auto";
      round.innerHTML =
        '<button type="button" class="kn-answer" data-state="idle">' +
        '<span class="kn-answer-text">Incomprehensibilities</span></button>';
      document.querySelector("main")?.append(round);
      const option = round.querySelector(".kn-answer");
      const text = round.querySelector(".kn-answer-text");
      return [option, text].map((part) =>
        part ? getComputedStyle(part).hyphens : "missing",
      );
    });
    expect(inside).toEqual(["manual", "manual"]);
  });
});

test.describe("R2-28 contrast", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`R2-28 placeholder text holds 4.5:1 on every surface a field sits on, in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      const pairs = await page.evaluate(() =>
        ["page", "surface", "sunken"].map((surface) => {
          const field = document.createElement("input");
          field.placeholder = "Start typing a person";
          field.style.backgroundColor = `var(--kn-${surface})`;
          document.querySelector("main")?.append(field);
          const pair = {
            surface,
            text: getComputedStyle(field, "::placeholder").color,
            opacity: getComputedStyle(field, "::placeholder").opacity,
            ground: getComputedStyle(field).backgroundColor,
          };
          field.remove();
          return pair;
        }),
      );
      for (const { surface, text, opacity, ground } of pairs) {
        expect(opacity, surface).toBe("1");
        expect(
          contrast(text, ground),
          `${text} on ${ground} (${surface})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`R2-28 practice's empty segments have a 3:1 edge inside them, against their wash and the page, in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await startQuickPlay(page);
      const upcoming = page.locator(
        'header ol[data-variant="bar"] > li[data-status="upcoming"]:not([data-current])',
      );
      await expect(upcoming).toHaveCount(9);
      const page_ = await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      const edges = await upcoming.evaluateAll((steps) =>
        steps.map((step) => {
          const css = getComputedStyle(step);
          return {
            style: css.outlineStyle,
            width: css.outlineWidth,
            offset: css.outlineOffset,
            edge: css.outlineColor,
            wash: css.backgroundColor,
            border: css.borderTopWidth,
          };
        }),
      );
      for (const edge of edges) {
        // Drawn inside the segment, 1 px: never a ring outside it.
        expect(edge).toMatchObject({
          style: "solid",
          width: "1px",
          offset: "-1px",
          border: "0px",
        });
        expect(contrast(edge.edge, edge.wash)).toBeGreaterThanOrEqual(3);
        expect(contrast(edge.edge, page_)).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

test.describe("R2-34 Settings marks no tab", () => {
  for (const { width, nav } of [
    { width: 390, nav: "bottom" },
    { width: 1280, nav: "top" },
  ] as const) {
    test(`R2-34 at ${width} px, Me is marked on Me, and no tab on Settings`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const bar = page.locator(`nav[data-placement="${nav}"]`);
      await page.goto("/me");
      // Hydrated, the bar marks Me on its own page...
      await expect(bar.getByRole("link", { name: "Me" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      // ...and Settings, opened from the top bar's gear, marks nothing.
      await page
        .locator("header.kn-topbar")
        .getByRole("link", { name: "Settings" })
        .click();
      await expect(page).toHaveURL("/settings");
      await expect(
        page.getByRole("main").getByRole("heading", { name: "Settings" }),
      ).toBeVisible();
      await expect(bar.locator("[aria-current]")).toHaveCount(0);
      await expect(bar.locator("[data-active]")).toHaveCount(0);
      await expect(bar.locator(".kn-tab-marker")).toHaveCount(0);
    });
  }
});
