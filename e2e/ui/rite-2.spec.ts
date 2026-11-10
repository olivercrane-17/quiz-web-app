/**
 * RITE round 2's findings for the shell and the primitives (FIX2-DS;
 * docs/playtests/rite-2.md §4, §6, §8 and §9, decisions memo §22), each
 * reproduced the way the personas met it, on the mock build. Every title
 * starts with its finding's id.
 *
 * - R2-06: the Daily's pills, Today's round chips and the Mystery's
 *   category chip are flat marks (D11): no border, no ledge, no pointer,
 *   in every state; the current pill keeps the wash with ink text and a
 *   bar under it, never the primary button's fill and never ringed like
 *   keyboard focus; a locked-in Encore's pill is filled, unlike a pill
 *   nobody has played; a longer mark (the Encore's % off to come) stays
 *   inside its pill; and a tap on the stopwatch on a 390 px phone opens
 *   the More menu at Hide stopwatch, as DESIGN §6.7 says. The Beta label
 *   keeps DESIGN §6.14's ink-2 outline.
 * - R2-07: Groups, Me and Settings each say what's coming there and what
 *   works now, instead of "This part of Knewt isn't ready yet."
 * - R2-17: question and option text is never split with a hyphen, at 200%
 *   text on a phone included, the Mystery's clue text too, where the
 *   personas met it (FIX2-MYS's ladder.tsx sets `hyphens-manual`).
 * - R2-28: the guess field Sam measured takes its placeholder colour
 *   from the design system (ink-3, 4.5:1 on its frame), and practice's
 *   empty segments have a 3:1 edge. The field adds no opacity of its own,
 *   so the placeholder shows at that contrast.
 * - R2-34: Settings marks no tab.
 */
import type { Locator, Page } from "@playwright/test";

import { markFit } from "../../src/ui/mark-fit";
import { lockInButton, pickFirstOption } from "../daily/clue-4";
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

/** A computed colour's channels and alpha. */
function rgba(colour: string): [number, number, number, number] {
  const parts = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(colour);
  if (parts === null) throw new Error(`not an rgb colour: ${colour}`);
  return [
    Number(parts[1]),
    Number(parts[2]),
    Number(parts[3]),
    parts[4] === undefined ? 1 : Number(parts[4]),
  ];
}

/** `colour` at `opacity` (times its own alpha) laid over the opaque `ground`. */
function blend(colour: string, opacity: number, ground: string): string {
  const [r, g, b, a] = rgba(colour);
  const [gr, gg, gb] = rgba(ground);
  const alpha = a * opacity;
  const mix = (top: number, under: number) =>
    Math.round(top * alpha + under * (1 - alpha));
  return `rgb(${mix(r, gr)}, ${mix(g, gg)}, ${mix(b, gb)})`;
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
  await pickFirstOption(page);
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

  test("R2-06 the current pill is the wash with ink text and the bar under it, never the primary button's fill, never ringed like keyboard focus", async ({
    page,
  }) => {
    for (const [scheme, wash, ink, ink2] of [
      ["light", "rgb(236, 228, 214)", "rgb(29, 26, 22)", "rgb(78, 70, 61)"],
      ["dark", "rgb(19, 17, 14)", "rgb(243, 235, 222)", "rgb(206, 195, 179)"],
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
          text: css.color,
          outline: css.outlineStyle,
          border: css.borderTopWidth,
          bar: bar.content === "none" ? null : bar.height,
        };
      });
      expect(look, scheme).toEqual({
        fill: wash,
        text: ink,
        outline: "none",
        border: "0px",
        bar: "3px",
      });
      // Not the primary button's pairing ("Play today's Daily", "See your
      // results"), which read as the selected segment of a control (D11).
      const primary = await page.evaluate(() => {
        const probe = document.createElement("button");
        probe.className = "kn-btn kn-btn-primary";
        document.querySelector("header")?.append(probe);
        const css = getComputedStyle(probe);
        const pair = { fill: css.backgroundColor, text: css.color };
        probe.remove();
        return pair;
      });
      expect(look.fill, scheme).not.toBe(primary.fill);
      expect(look.text, scheme).not.toBe(primary.text);
      // The pills not open now are the same wash in ink-2, without the bar.
      const others = await page
        .locator('header .kn-step:not([aria-current="step"])')
        .evaluateAll((steps) =>
          steps.map((step) => ({
            text: getComputedStyle(step).color,
            bar: getComputedStyle(step, "::after").content,
          })),
        );
      expect(others, scheme).toEqual(
        Array.from({ length: 3 }, () => ({ text: ink2, bar: "none" })),
      );
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

  test("R2-06 practice's segments are flat too, and the open question's is the edged wash with the bar under it", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await startQuickPlay(page);
    const segments = page.locator('header ol[data-variant="bar"] > li');
    await expect(segments).toHaveCount(10);
    expectFlat(await looksOf(segments), "practice's segments");
    const current = segments.and(page.locator('[aria-current="step"]'));
    const look = await current.evaluate((step) => {
      const css = getComputedStyle(step);
      const bar = getComputedStyle(step, "::after");
      return {
        fill: css.backgroundColor,
        outline: `${css.outlineWidth} at ${css.outlineOffset}`,
        bar: bar.content === "none" ? null : bar.height,
      };
    });
    // The empty well's 1 px edge inside it (R2-28), never a ring outside.
    expect(look).toEqual({
      fill: "rgb(236, 228, 214)",
      outline: "1px at -1px",
      bar: "3px",
    });
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
          fill: css.backgroundColor,
          edge: css.borderTopColor,
          text: css.color,
        };
      });
    });
    expect(looks.slice(0, 2)).toMatchObject([
      { border: 0, cursor: "default" },
      { border: 0, cursor: "default" },
    ]);
    // The Beta label keeps DESIGN §6.14's outline in ink-2, on no wash,
    // and is no control.
    expect(looks[2]).toMatchObject({
      border: 1,
      cursor: "default",
      fill: "rgba(0, 0, 0, 0)",
    });
    expect(looks[2]?.edge).toBe(looks[2]?.text);
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

  for (const scheme of ["light", "dark"] as const) {
    test(`R2-06 after Lock in, the Encore's pill is filled, so it no longer looks like a pill nobody has played, in the ${scheme} theme`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/daily");
      const encore = pills(page).nth(3);
      await expect(encore).toHaveAttribute("data-status", "upcoming");
      const unplayed = await encore.evaluate(
        (step) => getComputedStyle(step).backgroundColor,
      );
      for (const next of ["Next mystery", "Next mystery", "On to the Encore"]) {
        await expect(
          page.getByRole("button", { name: /^Next clue/ }),
        ).toBeVisible();
        for (let clue = 1; clue < 4; clue += 1) {
          await page
            .getByRole("button", { name: /^(Next clue|Last clue)/ })
            .click();
        }
        await pickFirstOption(page);
        await page.getByRole("button", { name: next }).click();
      }
      await page.getByLabel(/your number/i).fill("1000");
      await page.getByRole("button", { name: "Lock in" }).click();
      const results = page.getByRole("button", { name: "See your results" });
      await expect(results).toBeVisible();
      await expect(encore).toHaveAttribute("data-status", "done");
      // The step fills over 200 ms; read it once the fill has landed.
      await encore.evaluate((step) =>
        Promise.all(step.getAnimations().map((motion) => motion.finished)),
      );
      const look = await encore.evaluate((step) => {
        const css = getComputedStyle(step);
        return {
          fill: css.backgroundColor,
          text: css.color,
          border: css.borderTopWidth,
        };
      });
      const primary = await results.evaluate(
        (button) => getComputedStyle(button).backgroundColor,
      );
      // Still a flat mark, but no longer the unplayed wash, and not the
      // primary button's fill either.
      expect(look.border).toBe("0px");
      expect(look.fill, scheme).not.toBe(unplayed);
      expect(look.fill, scheme).not.toBe(primary);
      expect(contrast(look.text, look.fill)).toBeGreaterThanOrEqual(4.5);
    });
  }

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
      await lockInButton(page).tap();
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

test.describe("R2-07 a link's placeholder says what's coming too", () => {
  test("R2-07 a group's board and a challenge, opened from a link, each say what's coming and what works now", async ({
    page,
  }) => {
    const LINKS = [
      [
        "/g/abc123",
        "Group board",
        "Group boards come with Groups. Until then, compare results in your group chat.",
      ],
      [
        "/c/abc123",
        "Challenge",
        "Challenges are on the way. Until then, send a friend your Daily result.",
      ],
    ] as const;
    for (const [path, title, line] of LINKS) {
      await page.goto(path);
      const main = page.getByRole("main");
      await expect(
        main.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(main.locator("[data-placeholder-line]")).toHaveText(line);
    }
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

  // The reproductions ("This fix- / ture coun- / try", "Its ti- / tle")
  // are clue text, which FIX2-MYS's ladder.tsx sets with `hyphens-manual`.
  test("R2-17 every clue's title, body and note keeps its words whole, at 390×844 with 200% text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/daily");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    // The open clue's title, the clues before it and any note under it.
    const clueText = page
      .getByRole("list", { name: "Clues" })
      .locator("[data-clue-card] h2, [data-rung] p:not([data-stamp])");
    await expect(clueText.first()).toBeVisible();
    await expect
      .poll(() => clueText.count(), {
        message: "the open clue and three before it",
      })
      .toBeGreaterThanOrEqual(4);
    const hyphens = await clueText.evaluateAll((parts) => [
      ...new Set(parts.map((part) => getComputedStyle(part).hyphens)),
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
  // The field Sam measured: combobox.tsx once added `placeholder:opacity-60`
  // over globals.css's ink-3, 2.6:1 in light and 3.1:1 in dark; without
  // it, 6.3:1 and 6.0:1.
  for (const scheme of ["light", "dark"] as const) {
    test(`R2-28 the Daily's guess field shows its placeholder at 4.5:1 on its frame, in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/daily");
      const field = page.getByRole("combobox");
      await expect(field).toBeVisible();
      const look = await field.evaluate((input) => {
        const placeholder = getComputedStyle(input, "::placeholder");
        // The field is transparent; the frame under it gives the ground.
        let ground = "rgba(0, 0, 0, 0)";
        for (
          let element: Element | null = input;
          element !== null;
          element = element.parentElement
        ) {
          const fill = getComputedStyle(element).backgroundColor;
          if (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") {
            ground = fill;
            break;
          }
        }
        return {
          text: placeholder.color,
          opacity: Number(placeholder.opacity),
          ground,
        };
      });
      const shown = blend(look.text, look.opacity, look.ground);
      expect(
        contrast(shown, look.ground),
        `${look.text} at ${look.opacity} on ${look.ground}`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  // The half DS owns, on the real field: the placeholder's colour comes
  // from globals.css's `::placeholder` (ink-3), not from the round. The
  // test above checks what shows, opacity included.
  for (const scheme of ["light", "dark"] as const) {
    test(`R2-28 the Daily's guess field takes its placeholder colour from the design system, 4.5:1 on its frame before any opacity of its own, in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/daily");
      const field = page.getByRole("combobox");
      await expect(field).toBeVisible();
      const look = await field.evaluate((input) => {
        let ground = "rgba(0, 0, 0, 0)";
        for (
          let element: Element | null = input;
          element !== null;
          element = element.parentElement
        ) {
          const fill = getComputedStyle(element).backgroundColor;
          if (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") {
            ground = fill;
            break;
          }
        }
        const probe = document.createElement("span");
        probe.style.color = "var(--kn-ink-3)";
        document.body.append(probe);
        const ink3 = getComputedStyle(probe).color;
        probe.remove();
        return {
          text: getComputedStyle(input, "::placeholder").color,
          ink3,
          ground,
        };
      });
      expect(look.text, scheme).toBe(look.ink3);
      expect(
        contrast(look.text, look.ground),
        `${look.text} on ${look.ground}`,
      ).toBeGreaterThanOrEqual(4.5);
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
