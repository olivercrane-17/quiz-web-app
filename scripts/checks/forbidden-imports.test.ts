// @vitest-environment node
/**
 * scripts/checks/forbidden-imports.mjs (ARCHITECTURE §11.2): the detector
 * on planted fixture trees, then the real module graphs of the Daily, the
 * archive and repair, and Survival.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  checkForbiddenImports,
  describeFinding,
  monetizationWordIn,
  offersStrike,
  wordsOf,
} from "./forbidden-imports.mjs";

const REPO = process.cwd();
const SCRIPT = resolve(REPO, "scripts/checks/forbidden-imports.mjs");
const temps: string[] = [];

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repository holding `files` (path → source). */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "qz-imports-"));
  temps.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** The Daily's route files, pointing at `daily.tsx` for the rest. */
const DAILY_ROUTE = {
  "src/app/layout.tsx":
    "export default function RootLayout() { return null; }\n",
  "src/app/(play)/layout.tsx":
    'export { default } from "@/features/shell/routes/play-layout";\n',
  "src/features/shell/routes/play-layout.tsx":
    "export default function PlayLayout() { return null; }\n",
  "src/app/(play)/daily/page.tsx":
    'export { default } from "@/features/daily/routes/daily";\n',
};

function findingsOf(root: string, graph: string) {
  return checkForbiddenImports({ root }).findings.filter(
    (finding) => finding.graph === graph,
  );
}

describe("words", () => {
  it.each([
    ["showPaywall", "paywall"],
    ["PRICE_TABLE", "price"],
    ["purchase-sheet", "purchase"],
    ["useEntitlements", "entitlements"],
    ["AdBanner", "ad"],
    ["load-ads", "ads"],
    ["src/features/advertising/slot.tsx", "advertising"],
  ])("finds the word in %s", (text, word) => {
    expect(monetizationWordIn(text)).toBe(word);
  });

  it.each([
    "header",
    "download",
    "readAloud",
    "badge",
    "adjustFontFallback",
    "loadAddress",
    "AdaptiveMixed",
    "src/features/daily/stop-screen/results-loader.ts",
    // "AD" beside an era word is the era (src/engine/text/metrics.ts reads "AD 79").
    "AD_ERA",
    "isAdYear",
    "formatAdDate",
    "parseYearAd",
    "src/engine/text/ad-era.ts",
  ])("reads %s as no monetization word", (text) => {
    expect(monetizationWordIn(text)).toBeNull();
  });

  it.each([
    // The era word has to sit right beside "AD", in the same path segment.
    ["src/features/ads/year-end.ts", "ads"],
    ["AdYearlyRevenue", "ad"],
    ["AdBannerDate", "ad"],
  ])("still finds the advert in %s", (text, word) => {
    expect(monetizationWordIn(text)).toBe(word);
  });

  it("splits camelCase, kebab-case, snake_case and digits", () => {
    expect(wordsOf("buyExtraLife2_HTMLElement-load")).toEqual([
      "buy",
      "extra",
      "life",
      "2",
      "html",
      "element",
      "load",
    ]);
  });

  it.each([
    ["restoreStrike", true],
    ["buyExtraLife", true],
    ["Earn an extra strike for every streak of five.", true],
    ["Strikes restored!", true],
    ["Three strikes and the run ends.", false],
    ["addStrike", false],
    ["strikesLeft", false],
    ["Restore your progress", false],
    // Copy that states the rule (PRD §3.3.6) is not an offer.
    [
      "Strikes show as three X slots, never hearts, and are never sold or refilled.",
      false,
    ],
    ["No extra lives, no second chances.", false],
    ["You cannot buy or earn strikes.", false],
    ["Strikes can't be bought or earned back.", false],
    ["Play without buying extra lives.", false],
    ["noExtraLives", false],
    // An offer still counts in its own sentence, after a contrast, or asked.
    ["Out of lives? Buy more.", true],
    ["Never lose a strike: buy an extra life now!", true],
    ["No ads, but you can buy extra lives.", true],
    ["Why not buy an extra life?", true],
    ["Earn strikes back without paying.", true],
  ])("offersStrike(%s) is %s", (text, offers) => {
    expect(offersStrike(text)).toBe(offers);
  });
});

describe("the module graph", () => {
  it("follows re-exports, @/ and relative paths and dynamic imports to a paywall module", () => {
    const root = tree({
      ...DAILY_ROUTE,
      "src/features/daily/routes/daily.tsx":
        'import { load } from "../model/lazy";\nexport default function Daily() { return load; }\n',
      "src/features/daily/model/lazy.ts":
        'export const load = () => import("@/features/paywall/gate");\n',
      "src/features/paywall/gate.ts": "export const gate = 1;\n",
    });

    const findings = findingsOf(root, "daily");

    expect(findings).toEqual([
      expect.objectContaining({
        module: "src/features/paywall/gate.ts",
        kind: "path",
        word: "paywall",
        chain: [
          "src/app/(play)/daily/page.tsx",
          "src/features/daily/routes/daily.tsx",
          "src/features/daily/model/lazy.ts",
          "src/features/paywall/gate.ts",
        ],
      }),
    ]);
    expect(describeFinding(findings[0] as (typeof findings)[number])).toBe(
      'AC-DLY-19 src/features/paywall/gate.ts: its path names "paywall" (reached from src/app/(play)/daily/page.tsx > src/features/daily/routes/daily.tsx > src/features/daily/model/lazy.ts)',
    );
  });

  it("names an export that mentions a price, a purchase or an entitlement", () => {
    const root = tree({
      ...DAILY_ROUTE,
      "src/features/daily/routes/daily.tsx":
        'export { formatPrice } from "../money";\nexport default function Daily() { return null; }\n',
      "src/features/daily/money.ts": [
        "export function formatPrice() { return 0; }",
        "export const ENTITLEMENTS = [];",
        "export interface PurchaseState { done: boolean }",
        "export const total = 1;",
        "",
      ].join("\n"),
    });

    expect(
      findingsOf(root, "daily").map((finding) => [
        finding.module,
        finding.kind,
        finding.name,
      ]),
    ).toEqual([
      ["src/features/daily/routes/daily.tsx", "export", "formatPrice"],
      ["src/features/daily/money.ts", "export", "formatPrice"],
      ["src/features/daily/money.ts", "export", "ENTITLEMENTS"],
      ["src/features/daily/money.ts", "export", "PurchaseState"],
    ]);
  });

  it("checks a package by its name without following it", () => {
    const root = tree({
      ...DAILY_ROUTE,
      "src/features/daily/routes/daily.tsx":
        'import { show } from "@acme/ad-network";\nimport { useState } from "react";\nexport default function Daily() { return [show, useState]; }\n',
    });

    expect(findingsOf(root, "daily")).toEqual([
      expect.objectContaining({
        module: "package:@acme/ad-network",
        kind: "path",
        word: "ad",
      }),
    ]);
  });

  it("passes a clean graph, and reads words whole", () => {
    const root = tree({
      ...DAILY_ROUTE,
      "src/features/daily/routes/daily.tsx":
        'import { header } from "./header";\nimport "./download.css";\nexport const readAloud = header;\nexport default function Daily() { return null; }\n',
      "src/features/daily/routes/header.ts": "export const header = 1;\n",
      "src/features/daily/routes/download.css": ".a { color: red; }\n",
    });

    const report = checkForbiddenImports({ root });

    expect(report.findings).toEqual([]);
    expect(
      report.graphs.find((graph) => graph.id === "daily")?.modules,
    ).toEqual(
      expect.arrayContaining([
        "src/features/daily/routes/header.ts",
        "src/features/daily/routes/download.css",
      ]),
    );
  });

  it("scans Survival's own code for strike offers, and only its own", () => {
    const root = tree({
      "src/app/(play)/practice/survival/page.tsx":
        'export { default } from "@/features/practice/survival/routes/survival";\n',
      "src/features/practice/survival/routes/survival.tsx": [
        'import { CopyLine } from "@/ui/copy-line";',
        "export function restoreStrike() { return 1; }",
        "export default function Survival() {",
        "  return <p>Earn an extra strike every ten answers.</p>;",
        "}",
        "",
      ].join("\n"),
      "src/ui/copy-line.tsx":
        'export const CopyLine = () => "Buy one, get a life";\n',
    });

    expect(
      findingsOf(root, "survival").map((finding) => [
        finding.module,
        finding.name,
      ]),
    ).toEqual([
      ["src/features/practice/survival/routes/survival.tsx", "restoreStrike"],
      [
        "src/features/practice/survival/routes/survival.tsx",
        "Earn an extra strike every ten answers.",
      ],
    ]);
  });

  it("passes Survival copy that states the rule, and an era helper on the Daily's path", () => {
    const root = tree({
      ...DAILY_ROUTE,
      "src/features/daily/routes/daily.tsx":
        'import { AD_ERA } from "@/engine/text/metrics";\nexport default function Daily() { return AD_ERA; }\n',
      "src/engine/text/metrics.ts": 'export const AD_ERA = "AD";\n',
      "src/app/(play)/practice/survival/page.tsx":
        'export { default } from "@/features/practice/survival/routes/survival";\n',
      "src/features/practice/survival/routes/survival.tsx": [
        "export default function Survival() {",
        "  return <p>Strikes show as three X slots, never hearts, and are never sold or refilled.</p>;",
        "}",
        "",
      ].join("\n"),
    });

    expect(checkForbiddenImports({ root }).findings).toEqual([]);
  });

  it("reports a graph with no entry module as not built, and passes it", () => {
    const report = checkForbiddenImports({ root: tree(DAILY_ROUTE) });

    expect(
      report.graphs.find((graph) => graph.id === "survival"),
    ).toMatchObject({ entries: [], modules: [] });
    expect(report.findings).toEqual([]);
  });

  it("fails from the command line, naming each finding", () => {
    const root = tree({
      ...DAILY_ROUTE,
      "src/features/daily/routes/daily.tsx":
        'export { gate } from "@/features/paywall/gate";\nexport default function Daily() { return null; }\n',
      "src/features/paywall/gate.ts": "export const gate = 1;\n",
    });

    const run = spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      encoding: "utf8",
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'AC-DLY-19 src/features/paywall/gate.ts: its path names "paywall"',
    );
    expect(run.stdout).toContain("AC-SUR-03 Survival: not built yet");
  });
});

describe("the real module graphs", () => {
  const report = checkForbiddenImports({ root: REPO });
  const graph = (id: string) => {
    const found = report.graphs.find((candidate) => candidate.id === id);
    if (found === undefined) throw new Error(`no graph ${id}`);
    return found;
  };
  const findings = (id: string) =>
    report.findings
      .filter((finding) => finding.graph === id)
      .map(describeFinding);

  it("AC-DLY-19 the Daily route's code imports no entitlement, paywall or ad module", () => {
    const daily = graph("daily");

    expect(daily.entries).toEqual(
      expect.arrayContaining([
        "src/app/layout.tsx",
        "src/app/(play)/layout.tsx",
        "src/app/(play)/daily/page.tsx",
        "src/app/(play)/daily/[number]/results/page.tsx",
      ]),
    );
    // The graph really reaches the Daily's screens, not just its route files.
    expect(daily.modules).toEqual(
      expect.arrayContaining([
        "src/features/daily/routes/daily.tsx",
        "src/features/daily/stop-screen/stop-screen.tsx",
      ]),
    );
    expect(findings("daily")).toEqual([]);
  });

  it("AC-RPR-07 no code path attaches a price, entitlement or purchase to repair", () => {
    const repair = graph("repair");

    expect(repair.entries).toEqual(
      expect.arrayContaining(["src/features/archive/offers/repair.tsx"]),
    );
    expect(findings("repair")).toEqual([]);
  });

  it("checks Survival's code as soon as it exists (BLZ-1), and finds nothing to report", () => {
    expect(findings("survival")).toEqual([]);
  });
});
