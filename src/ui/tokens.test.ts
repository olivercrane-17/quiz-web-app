/**
 * The design tokens as they ship (src/app/globals.css), measured the way
 * DESIGN Appendix A measures them: WCAG 2.2 relative luminance, 4.5:1 for
 * text and 3:1 for state graphics and control edges (WCAG 1.4.3, 1.4.11),
 * in light and dark and with high-contrast feedback in both.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const CSS = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

type Tokens = Record<string, string>;

/** The declarations of the first rule whose selector is exactly `selector`, inside `within` if given. */
function block(selector: string, within?: string): string {
  let source = CSS;
  if (within !== undefined) {
    const at = CSS.indexOf(within);
    if (at < 0) throw new Error(`no ${within}`);
    source = CSS.slice(at);
  }
  const pattern = new RegExp(
    `(^|[}\\n])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`,
  );
  const match = pattern.exec(source);
  if (match === null) throw new Error(`no rule for ${selector}`);
  const open = match.index + match[0].length;
  let depth = 1;
  let i = open;
  while (depth > 0 && i < source.length) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    i += 1;
  }
  return source.slice(open, i - 1);
}

function tokensOf(body: string): Tokens {
  const out: Tokens = {};
  for (const [, name = "", value = ""] of body.matchAll(
    /--kn-([a-z0-9-]+):\s*([^;]+);/g,
  )) {
    out[name] = value.trim();
  }
  return out;
}

const DARK_MEDIA = "@media (prefers-color-scheme: dark)";

const light = tokensOf(block(':root,\n[data-theme="light"]'));
const dark = tokensOf(block('[data-theme="dark"]'));
const darkSystem = tokensOf(
  block(':root:not([data-theme="light"])', DARK_MEDIA),
);
const contrastLight = { ...light, ...tokensOf(block('[data-contrast="on"]')) };
const contrastDark = {
  ...dark,
  ...tokensOf(block('[data-theme="dark"][data-contrast="on"]')),
};
const readableLight = { ...light, ...tokensOf(block('[data-readable="on"]')) };
const readableDark = {
  ...dark,
  ...tokensOf(block('[data-theme="dark"][data-readable="on"]')),
};

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match?.[1] === undefined) throw new Error(`not a hex colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function ratio(tokens: Tokens, fg: string, bg: string): number {
  const a = tokens[fg];
  const b = tokens[bg];
  if (a === undefined || b === undefined)
    throw new Error(`${fg} or ${bg} missing`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** DESIGN Appendix A, Light and Dark: [foreground, background, target]. */
const THEME_PAIRS: [string, string, number][] = [
  ["ink", "page", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "sunken", 4.5],
  ["ink", "surface-2", 4.5],
  ["ink-2", "page", 4.5],
  ["ink-2", "surface", 4.5],
  ["ink-3", "page", 4.5],
  ["ink-3", "surface", 4.5],
  ["ink-3", "sunken", 4.5],
  ["on-primary", "primary", 4.5],
  ["primary", "page", 3],
  ["on-accent", "accent", 4.5],
  ["accent-text", "page", 4.5],
  ["accent-text", "surface", 4.5],
  ["ink", "accent-tint", 4.5],
  ["on-ticket", "ticket", 4.5],
  ["on-ticket", "ticket-card", 4.5],
  ["on-ticket-invert", "ticket-invert", 4.5],
  ["ticket", "page", 3],
  ["focus-on-ticket", "ticket", 3],
  ["on-ticket-btn", "ticket-btn", 4.5],
  ["ticket-btn", "ticket", 3],
  ["on-correct", "correct", 4.5],
  ["correct-text", "surface", 4.5],
  ["ink", "correct-tint", 4.5],
  ["correct-line", "surface", 3],
  ["correct-line", "page", 3],
  ["ink", "incorrect-tint", 4.5],
  ["incorrect-text", "surface", 4.5],
  ["incorrect-text", "incorrect-tint", 4.5],
  ["incorrect-line", "surface", 3],
  ["incorrect-line", "incorrect-tint", 3],
  ["on-incorrect", "incorrect", 3],
  ["on-play-accent", "play-accent", 4.5],
  ["play-accent-text", "page", 4.5],
  ["selected", "surface", 3],
  ["focus", "page", 3],
  ["focus", "surface", 3],
  ["rule-strong", "page", 3],
  ["rule-strong", "surface", 3],
  ["warning-text", "page", 4.5],
  ["on-warning", "warning", 4.5],
  ["on-caution", "caution", 4.5],
  ["caution-line", "caution", 3],
  ["on-freeze", "freeze", 4.5],
  ["chart-bar", "surface", 3],
  ["chart-you-line", "chart-you", 3],
  ["chart-you", "surface", 3],
  ["link", "surface", 4.5],
  ["link-underline", "surface", 3],
];

/** DESIGN Appendix A, high-contrast feedback, in both themes. */
const CONTRAST_PAIRS: [string, string, number][] = [
  ["on-correct", "correct", 4.5],
  ["correct-text", "surface", 4.5],
  ["ink", "correct-tint", 4.5],
  ["correct-line", "surface", 3],
  ["correct-line", "page", 3],
  ["ink", "incorrect-tint", 4.5],
  ["incorrect-text", "surface", 4.5],
  ["incorrect-text", "incorrect-tint", 4.5],
  ["incorrect-line", "surface", 3],
  ["incorrect-line", "incorrect-tint", 3],
  ["on-incorrect", "incorrect", 3],
  ["on-play-accent", "play-accent", 4.5],
  ["play-accent-text", "page", 4.5],
  ["chart-you-line", "chart-you", 3],
  ["chart-you", "surface", 3],
];

/**
 * The flat marks (RITE round 2, R2-06 and R2-28), which no border outlines
 * any more: a pill's mark on its wash (the current step's in ink), a
 * locked-in Encore's mark in `surface` on its ink-2 fill, the inner edge of
 * practice's empty segments against their wash and the page, a verdict's
 * glyph on its fill,
 * and placeholder text (globals.css) on every surface a field sits on.
 */
const MARK_PAIRS: [string, string, number][] = [
  ["ink-2", "sunken", 4.5],
  ["ink", "sunken", 4.5],
  ["surface", "ink-2", 4.5],
  ["rule-strong", "sunken", 3],
  ["rule-strong", "page", 3],
  ["on-correct", "correct", 4.5],
  ["incorrect-text", "incorrect-tint", 4.5],
  ["ink-3", "page", 4.5],
  ["ink-3", "surface", 4.5],
  ["ink-3", "sunken", 4.5],
];

/**
 * The score card's inset (RITE round 2, R2-09): the inset against the
 * ticket-toned card it sits on, and the rows' text on it.
 */
const INSET_PAIRS: [string, string, number][] = [
  ["card-inset", "ticket", 3],
  ["ink", "card-inset", 4.5],
];

/**
 * 🟧 is drawn by the emoji font, not by a token: approximate fills of the
 * orange square in the fonts `--kn-font-emoji` names (Apple, Segoe UI and
 * Noto Color Emoji). On the orange card it nearly vanished (about 1.1 to
 * 1.5:1, R2-09). On the inset it holds 3:1 in dark. In light no cream can
 * reach 3:1 against a mid orange, so the inset more than doubles the
 * card's contrast there and keeps at least 2.2:1, with the legend's words
 * beside the squares (PRD §3.5.1).
 */
const EMOJI_ORANGES = ["#f4900c", "#f7630c", "#f57c00"];

/** Readable text changes the paper; text on it must still hold. */
const READABLE_PAIRS: [string, string, number][] = [
  ["ink", "page", 4.5],
  ["ink-2", "page", 4.5],
  ["ink-3", "page", 4.5],
  ["ink-3", "surface", 4.5],
  ["rule-strong", "page", 3],
  ["focus", "page", 3],
];

describe("design tokens", () => {
  describe.each([
    ["light", light],
    ["dark", dark],
  ])("%s theme", (_name, tokens) => {
    it.each(THEME_PAIRS)("%s on %s holds %s:1", (fg, bg, target) => {
      expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(target);
    });
  });

  describe.each([
    ["light", contrastLight],
    ["dark", contrastDark],
  ])("%s theme with high-contrast feedback", (_name, tokens) => {
    it.each(CONTRAST_PAIRS)("%s on %s holds %s:1", (fg, bg, target) => {
      expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(target);
    });
  });

  describe.each([
    ["light", light],
    ["dark", dark],
    ["light with high-contrast feedback", contrastLight],
    ["dark with high-contrast feedback", contrastDark],
    ["light with readable text", readableLight],
    ["dark with readable text", readableDark],
  ])("R2-09 the score card's inset, %s", (_name, tokens) => {
    it.each(INSET_PAIRS)("%s on %s holds %s:1", (fg, bg, target) => {
      expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(target);
    });
  });

  it.each(EMOJI_ORANGES)(
    "R2-09 🟧 (%s) shows on the inset far better than on the orange card",
    (orange) => {
      for (const [theme, tokens, floor] of [
        ["light", light, 2.2],
        ["dark", dark, 3],
      ] as const) {
        const withOrange = { ...tokens, orange };
        const onInset = ratio(withOrange, "orange", "card-inset");
        const onCard = ratio(withOrange, "orange", "ticket");
        expect(onInset, theme).toBeGreaterThanOrEqual(floor);
        expect(onInset, theme).toBeGreaterThanOrEqual(onCard * 1.5);
      }
    },
  );

  describe.each([
    ["light", readableLight],
    ["dark", readableDark],
  ])("%s theme with readable text", (_name, tokens) => {
    it.each(READABLE_PAIRS)("%s on %s holds %s:1", (fg, bg, target) => {
      expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(target);
    });
  });

  describe.each([
    ["light", light],
    ["dark", dark],
    ["light with high-contrast feedback", contrastLight],
    ["dark with high-contrast feedback", contrastDark],
    ["light with readable text", readableLight],
    ["dark with readable text", readableDark],
  ])("R2-06 and R2-28 the flat marks, %s", (_name, tokens) => {
    it.each(MARK_PAIRS)("%s on %s holds %s:1", (fg, bg, target) => {
      expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(target);
    });
  });

  it("AC-SET-04 (token half) high-contrast feedback swaps correct and incorrect to the blue and orange pair", () => {
    expect(contrastLight.correct).toBe("#1e5ba8");
    expect(contrastLight.incorrect).toBe("#b04a0c");
    expect(contrastDark.correct).toBe("#1f4f8f");
    expect(contrastDark.incorrect).toBe("#f09a55");
    // In-play accents beside a verdict turn ink, since orange now means wrong.
    expect(contrastLight["play-accent"]).toBe(light.ink);
    expect(contrastDark["play-accent"]).toBe(dark.ink);
  });

  it("the system's dark theme and a chosen dark theme are the same palette", () => {
    expect(darkSystem).toEqual(dark);
    expect(
      tokensOf(
        block(
          ':root:not([data-theme="light"])[data-contrast="on"]',
          DARK_MEDIA,
        ),
      ),
    ).toEqual(tokensOf(block('[data-theme="dark"][data-contrast="on"]')));
    expect(
      tokensOf(
        block(
          ':root:not([data-theme="light"])[data-readable="on"]',
          DARK_MEDIA,
        ),
      ),
    ).toEqual(tokensOf(block('[data-theme="dark"][data-readable="on"]')));
  });

  it("both themes define the same colour tokens", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it("every --kn-* token the code reads is defined", () => {
    // Set from script, each read with a fallback: the toast's offset
    // (toast.ts) and the bars' measured heights (shell/scroll-inset.tsx).
    const defined = new Set<string>([
      "toast-bottom",
      "inset-top",
      "inset-bottom",
    ]);
    const used = new Map<string, string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== "generated" && entry !== "node_modules") walk(path);
        } else if (/\.(css|tsx?)$/.test(entry) && !entry.endsWith(".test.ts")) {
          const text = readFileSync(path, "utf8");
          for (const match of text.matchAll(/var\(--kn-([a-z0-9-]+)/g)) {
            if (match[1] !== undefined) used.set(match[1], path);
          }
          if (entry.endsWith(".css")) {
            for (const match of text.matchAll(/--kn-([a-z0-9-]+):/g)) {
              if (match[1] !== undefined) defined.add(match[1]);
            }
          }
        }
      }
    };
    walk(join(ROOT, "src"));
    const missing = [...used].filter(([name]) => !defined.has(name));
    expect(missing).toEqual([]);
  });
});
