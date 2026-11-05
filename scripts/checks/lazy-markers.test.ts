// @vitest-environment node
/**
 * scripts/checks/lazy-markers.mjs (SEC-1): lazy-only modules stay out of
 * every first load (ARCHITECTURE §10.9 item 4), and no sealed id, text or
 * Encore answer is anywhere a browser or a crawler can fetch it (§5.4, PRD
 * AC-CNT-07). Each test builds a small fake `.next/` and `public/` in a
 * temporary folder.
 *
 * The --sealed tests seal fixture content with a throwaway key made here,
 * and hand the check that key with a key path that doesn't exist, so the
 * real content key is never read.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { deriveSealKeys, envelopeText, sealBytes } from "../content/crypto.ts";
import {
  CheckError,
  containsNumber,
  decodeText,
  isReservedExampleId,
  packageSignatures,
  runCheck,
  SCAN_ROOTS,
  sealedIdsIn,
} from "./lazy-markers.mjs";

const REPO = resolve(__dirname, "../..");
const FIXTURES = join(REPO, "content/fixtures");
const SCRIPT = join(REPO, "scripts/checks/lazy-markers.mjs");
const SDK_VERSION = "9.9.9";

interface FakeBuild {
  root: string;
  write(path: string, content: string): void;
  /**
   * route-bundle-stats.json: each route's first-load chunks, by file name
   * under .next/static/chunks. The build's route manifest lists the same
   * pages, plus what the stats always leave out.
   */
  routes(rows: Record<string, string[]>): void;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A fake build of `mode`, with the two Supabase packages installed at
 * SDK_VERSION, a prerendered Home page and a public/ folder: a clean build
 * that every check passes.
 */
function fakeBuild(mode: "supabase" | "mock" | "off" = "mock"): FakeBuild {
  const root = mkdtempSync(join(tmpdir(), "qz-lazy-markers-"));
  roots.push(root);
  const write = (path: string, content: string) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  write("package.json", "{}");
  for (const name of ["supabase-js", "realtime-js"]) {
    write(
      `node_modules/@supabase/${name}/package.json`,
      JSON.stringify({ name: `@supabase/${name}`, version: SDK_VERSION }),
    );
  }
  write(
    ".next/required-server-files.json",
    JSON.stringify({
      config: {
        env: { NEXT_PUBLIC_BACKEND_MODE: mode === "supabase" ? "" : mode },
      },
    }),
  );
  const routes = (rows: Record<string, string[]>) => {
    write(
      ".next/diagnostics/route-bundle-stats.json",
      JSON.stringify(
        Object.entries(rows).map(([route, chunks]) => ({
          route,
          firstLoadUncompressedJsBytes: 1,
          firstLoadChunkPaths: chunks.map(
            (chunk) => `.next/static/chunks/${chunk}`,
          ),
        })),
      ),
    );
    write(
      ".next/app-path-routes-manifest.json",
      JSON.stringify({
        ...Object.fromEntries(
          Object.keys(rows).map((route) => [
            `/(tabs)${route === "/" ? "" : route}/page`,
            route,
          ]),
        ),
        // Next's error page and route handlers never get route stats.
        "/_global-error/page": "/_global-error",
        "/api/restore/route": "/api/restore",
      }),
    );
  };
  // Every build has a shared framework chunk and a lazy chunk with the SDK.
  write(".next/static/chunks/framework.js", "self.__framework=1;");
  write(
    ".next/static/chunks/sdk.js",
    `var h={"X-Client-Info":\`supabase-js/${SDK_VERSION}\`},r="realtime-js/${SDK_VERSION}";`,
  );
  write(
    ".next/server/app/index.html",
    "<!DOCTYPE html><html><body><h1>Today</h1></body></html>",
  );
  mkdirSync(join(root, "public"));
  routes({ "/": ["framework.js"], "/daily": ["framework.js"] });
  return { root, write, routes };
}

interface FixtureMystery {
  id: string;
  clues: string[];
}

interface FixtureEncore {
  id: string;
  question: string;
  answer: number;
}

function fixture<T>(path: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, path), "utf8")) as T;
}

const mystery = fixture<FixtureMystery>("mysteries/fx.m.geo.0101.json");
const encore = fixture<FixtureEncore>("encores/fx.e.0101.json");

/**
 * The scan reported `field` of `itemId` in `file`, and nothing about any
 * other item or file. A claim that restates the planted clue is found
 * too, rightly, so other fields of the same item may appear.
 */
function expectFinding(
  problems: string[],
  file: string,
  itemId: string,
  field: string,
): void {
  expect(problems).toContain(
    `${file} holds ${itemId} ${field}, which is sealed.`,
  );
  for (const problem of problems) {
    expect(problem.startsWith(`${file} holds ${itemId} `), problem).toBe(true);
  }
}

/** HTML as React escapes text: & < > " and ' as entities. */
function htmlEscape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

describe("lazy markers", () => {
  it("fail the check when a statically imported marker module is in a route's first load", async () => {
    const build = fakeBuild();
    build.write(
      "src/features/party/confetti.ts",
      'export const LAZY = "__qz_lazy_confetti__";\nexport function burst() {}\n',
    );
    // A static import put the module into the chunk every route loads first.
    build.write(
      ".next/static/chunks/main.js",
      'var a="__qz_lazy_confetti__";function b(){}',
    );
    build.routes({ "/": ["framework.js", "main.js"], "/daily": ["main.js"] });

    const { problems } = await runCheck({ root: build.root });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("__qz_lazy_confetti__");
    expect(problems[0]).toContain("src/features/party/confetti.ts");
    expect(problems[0]).toContain(".next/static/chunks/main.js");
    expect(problems[0]).toContain("/, /daily");
    expect(problems[0]).toContain("import()");
  });

  it("pass when the marker module is only in a lazy chunk", async () => {
    const build = fakeBuild();
    build.write(
      "src/features/party/confetti.ts",
      'export const LAZY = "__qz_lazy_confetti__";\n',
    );
    build.write(
      ".next/static/chunks/lazy-9.js",
      'var a="__qz_lazy_confetti__";',
    );

    const { problems, lines } = await runCheck({ root: build.root });

    expect(problems).toEqual([]);
    expect(lines[0]).toContain("1 declared marker(s)");
  });

  it("fail on a marker in a first load even when no source declares it", async () => {
    const build = fakeBuild();
    build.write(".next/static/chunks/main.js", 'x="__qz_lazy_editor__"');
    build.routes({ "/create": ["main.js"] });

    const { problems } = await runCheck({ root: build.root });

    expect(problems).toEqual([
      expect.stringContaining(
        "__qz_lazy_editor__ is in .next/static/chunks/main.js, in the first load of /create",
      ),
    ]);
  });

  it("fail when a declared marker is in no client chunk, since the check would prove nothing for it", async () => {
    const build = fakeBuild();
    build.write("src/ui/qr.ts", "export const LAZY = '__qz_lazy_qr__';\n");

    const { problems } = await runCheck({ root: build.root });

    expect(problems).toEqual([
      expect.stringContaining(
        "the marker __qz_lazy_qr__ (src/ui/qr.ts) is in no client chunk",
      ),
    ]);
  });

  it("count only markers in string literals of non-test sources as declared", async () => {
    const build = fakeBuild();
    build.write(
      "src/backend/index.ts",
      "// The mock carries __qz_lazy_mock__ (a comment never reaches a chunk).\n",
    );
    build.write("src/ui/qr.test.ts", 'expect("__qz_lazy_qr__").toBe(1);\n');
    build.write(
      "src/backend/supabase/__fixtures__/x.ts",
      'export const a = "__qz_lazy_fixture__";\n',
    );

    const { problems, lines } = await runCheck({ root: build.root });

    expect(problems).toEqual([]);
    expect(lines[0]).toContain("0 declared marker(s)");
  });

  it("fail when the Supabase SDK is in a route's first load", async () => {
    const build = fakeBuild("supabase");
    build.write(
      ".next/static/chunks/main.js",
      `var h={"X-Client-Info":\`supabase-js/${SDK_VERSION}\`};`,
    );
    build.routes({ "/": ["framework.js", "main.js"] });

    const { problems } = await runCheck({ root: build.root });

    expect(problems).toEqual([
      expect.stringContaining(
        `the Supabase SDK ("supabase-js/${SDK_VERSION}") is in .next/static/chunks/main.js, in the first load of /`,
      ),
    ]);
  });

  it("pass with the SDK in a lazy chunk, and say so", async () => {
    const build = fakeBuild("supabase");

    const { problems, lines } = await runCheck({ root: build.root });

    expect(problems).toEqual([]);
    expect(lines[0]).toContain(
      `supabase-js/${SDK_VERSION} and realtime-js/${SDK_VERSION} only in lazy chunks, supabase build`,
    );
  });

  it("fail a Supabase build whose chunks no longer hold the SDK's signature, which would switch the check off", async () => {
    const build = fakeBuild("supabase");
    build.write(".next/static/chunks/sdk.js", 'var h="supabase-js/next";');

    const { problems } = await runCheck({ root: build.root });

    expect(problems).toEqual([
      expect.stringContaining(
        `no client chunk holds "supabase-js/${SDK_VERSION}"`,
      ),
      expect.stringContaining(
        `no client chunk holds "realtime-js/${SDK_VERSION}"`,
      ),
    ]);
  });

  it.each(["mock", "off"] as const)(
    "let a %s build leave the SDK out",
    async (mode) => {
      const build = fakeBuild(mode);
      build.write(".next/static/chunks/sdk.js", "var nothing=1;");

      expect((await runCheck({ root: build.root })).problems).toEqual([]);
    },
  );

  it("say what is missing when there is no build", async () => {
    const build = fakeBuild();
    rmSync(join(build.root, ".next/diagnostics"), { recursive: true });

    await expect(runCheck({ root: build.root })).rejects.toThrow(
      /route-bundle-stats\.json.*npm run build/,
    );
    await expect(runCheck({ root: build.root })).rejects.toBeInstanceOf(
      CheckError,
    );
  });

  it("read a package's version from the copy the SDK resolves, nested under it before the hoisted one", () => {
    const build = fakeBuild("supabase");
    build.write(
      "node_modules/@supabase/supabase-js/node_modules/@supabase/realtime-js/package.json",
      JSON.stringify({ version: "8.8.8" }),
    );

    expect(
      packageSignatures(build.root, "supabase").map((pkg) => pkg.text),
    ).toEqual([`supabase-js/${SDK_VERSION}`, "realtime-js/8.8.8"]);
    expect(
      packageSignatures(build.root, "mock").every((pkg) => !pkg.required),
    ).toBe(true);

    rmSync(join(build.root, "node_modules"), { recursive: true });
    expect(() => packageSignatures(build.root, "supabase")).toThrow(
      /@supabase\/supabase-js.*npm ci/,
    );
  });
});

describe("an incomplete build", () => {
  it.each(SCAN_ROOTS)(
    "stops the check when %s is missing, since the sealed scan would cover nothing there",
    async (dir) => {
      const build = fakeBuild();
      rmSync(join(build.root, dir), { recursive: true });

      const run = runCheck({ root: build.root });

      await expect(run).rejects.toThrow(
        `${dir} is missing, so the sealed scan would cover nothing there. Run "npm run build" first.`,
      );
      await expect(run).rejects.toBeInstanceOf(CheckError);
    },
  );

  it("stops the check when .next/server/app holds no prerendered Home page, as when Next moves its output", async () => {
    const build = fakeBuild();
    rmSync(join(build.root, ".next/server/app/index.html"));
    build.write(".next/server/app/page_client-reference-manifest.js", "");

    await expect(runCheck({ root: build.root })).rejects.toThrow(
      /^\.next\/server\/app has no prerendered Home page \(index\.html\)/,
    );
  });

  it("AC-CNT-07 exits 1 from the command line when .next/server/app has moved, though its pages hold a sealed id", () => {
    const build = fakeBuild();
    build.write(
      ".next/server/app/index.html",
      '<!DOCTYPE html><html><body><p data-id="m.film.0107">Today</p></body></html>',
    );
    renameSync(
      join(build.root, ".next/server/app"),
      join(build.root, ".next/server/app-moved"),
    );

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: build.root,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "check:lazy: .next/server/app is missing, so the sealed scan would cover nothing there.",
    );
  });

  it("stops the check when the route stats leave out a page the build has, which neither first-load check would then see", async () => {
    const build = fakeBuild();
    const manifest = join(build.root, ".next/app-path-routes-manifest.json");
    build.write(
      ".next/app-path-routes-manifest.json",
      JSON.stringify({
        ...(JSON.parse(readFileSync(manifest, "utf8")) as object),
        "/(tabs)/me/page": "/me",
        "/(play)/daily/[number]/results/page": "/daily/[number]/results",
      }),
    );

    const run = runCheck({ root: build.root });

    // Next's error page and the route handlers have no stats, rightly.
    await expect(run).rejects.toThrow(
      ".next/diagnostics/route-bundle-stats.json leaves out /daily/[number]/results, /me, which .next/app-path-routes-manifest.json lists, so neither this check nor check:bundle sees their first load.",
    );
    await expect(run).rejects.toBeInstanceOf(CheckError);
  });
});

describe("the sealed-content scan", () => {
  it("AC-CNT-07 fails on a sealed id planted in a prerendered page", async () => {
    const build = fakeBuild();
    build.write(
      ".next/server/app/index.html",
      '<!DOCTYPE html><html><body><p data-id="m.film.0107">Today</p></body></html>',
    );

    const { problems } = await runCheck({ root: build.root });

    expect(problems).toEqual([
      expect.stringContaining(
        ".next/server/app/index.html holds the sealed id m.film.0107",
      ),
    ]);
  });

  it("AC-CNT-07 fails on a sealed id planted in public/", async () => {
    const build = fakeBuild();
    build.write(
      "public/content/packs/geography.0a1b2c3d.json",
      JSON.stringify({
        items: [{ id: "p.geo.0142" }, { contentId: "e.0113" }],
      }),
    );

    const { problems } = await runCheck({ root: build.root });

    expect(problems).toEqual([
      expect.stringContaining(
        "public/content/packs/geography.0a1b2c3d.json holds the sealed id e.0113",
      ),
    ]);
  });

  it("AC-CNT-07 fails on sealed ids in client chunks and RSC payloads", async () => {
    const build = fakeBuild();
    build.write(".next/static/chunks/lazy-3.js", 'var r={id:"r.party.07"};');
    build.write(".next/server/app/daily.rsc", '1:["m.hist.0312"]');

    const { problems } = await runCheck({ root: build.root });

    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          ".next/static/chunks/lazy-3.js holds the sealed id r.party.07",
        ),
        expect.stringContaining(
          ".next/server/app/daily.rsc holds the sealed id m.hist.0312",
        ),
      ]),
    );
    expect(problems).toHaveLength(2);
  });

  it("passes fixture ids, practice ids and the content guide's worked examples", async () => {
    const build = fakeBuild();
    build.write(
      ".next/static/chunks/mock.js",
      'var f=["fx.m.geo.0101","fx.e.0101","fx.r.dly.01","p.geo.0142"];',
    );
    build.write(
      "public/guide.json",
      JSON.stringify(["m.geo.0001", "e.0004", "r.party.93"]),
    );

    expect((await runCheck({ root: build.root })).problems).toEqual([]);
    expect(isReservedExampleId("e.0004")).toBe(true);
    expect(isReservedExampleId("e.0104")).toBe(false);
    expect(isReservedExampleId("r.party.93")).toBe(true);
    expect(isReservedExampleId("r.party.07")).toBe(false);
  });

  it("reads ids as whole words only", () => {
    expect(sealedIdsIn("1e.0042 e.00423 xm.geo.0142 m.geo.01420")).toEqual([]);
    expect(sealedIdsIn("(m.geo.0142) e.0113, r.room-pack.12.")).toEqual([
      "m.geo.0142",
      "e.0113",
      "r.room-pack.12",
    ]);
  });

  it("AC-CNT-07 fails on a sealed clue planted in a prerendered page, matched as whole words after normalizeName and never printed", async () => {
    const build = fakeBuild();
    const clue = mystery.clues[1] ?? "";
    build.write(
      ".next/server/app/daily.html",
      `<html><body><h2>Clue 2</h2><p>${htmlEscape(clue.toUpperCase())}</p></body></html>`,
    );

    const { problems, lines } = await runCheck({
      root: build.root,
      fixtures: FIXTURES,
    });

    expectFinding(
      problems,
      ".next/server/app/daily.html",
      mystery.id,
      "clues[1]",
    );
    expect(lines[2]).toMatch(/^sealed text: \d+ texts and \d+ Encore answers/);
    for (const line of [...problems, ...lines]) {
      expect(line).not.toContain(clue);
      expect(line.toLowerCase()).not.toContain(clue.slice(0, 20).toLowerCase());
    }
  });

  it("AC-CNT-07 fails on a sealed clue planted in public/", async () => {
    const build = fakeBuild();
    build.write(
      "public/content/lists/notes.json",
      JSON.stringify({ note: `See: ${mystery.clues[3] ?? ""}` }),
    );

    const { problems } = await runCheck({
      root: build.root,
      fixtures: FIXTURES,
    });

    expectFinding(
      problems,
      "public/content/lists/notes.json",
      mystery.id,
      "clues[3]",
    );
  });

  it("AC-CNT-07 finds a clue in an RSC payload inside an inline script, escaped twice", async () => {
    const build = fakeBuild();
    const payload = JSON.stringify(
      `5:["$","p",null,{"children":${JSON.stringify(mystery.clues[0] ?? "")}}]`,
    );
    build.write(
      ".next/server/app/index.html",
      `<script>self.__next_f.push([1,${payload}])</script>`,
    );

    const { problems } = await runCheck({
      root: build.root,
      fixtures: FIXTURES,
    });

    expectFinding(
      problems,
      ".next/server/app/index.html",
      mystery.id,
      "clues[0]",
    );
  });

  it("matches whole words: part of a clue, or a clue run into other letters, is no finding", async () => {
    const build = fakeBuild();
    const clue = mystery.clues[2] ?? "";
    const words = clue.split(" ");
    build.write(
      ".next/server/app/index.html",
      `<p>${words.slice(0, -1).join(" ")}</p><p>x${clue.replaceAll(" ", "")}</p>`,
    );

    expect(
      (await runCheck({ root: build.root, fixtures: FIXTURES })).problems,
    ).toEqual([]);
  });

  it("AC-CNT-07 fails on an Encore answer beside its question, by AC-DLY-04's number rules", async () => {
    const build = fakeBuild();
    const value = encore.answer.toLocaleString("en-US");
    build.write(
      ".next/server/app/index.html",
      `<p>${htmlEscape(encore.question)}</p><p>It is ${value}.</p>`,
    );
    build.write(
      "public/encore.json",
      JSON.stringify({ q: encore.question, v: encore.answer }),
    );
    // The number alone gives nothing away.
    build.write("public/numbers.json", JSON.stringify({ v: encore.answer }));

    const { problems } = await runCheck({
      root: build.root,
      fixtures: FIXTURES,
    });

    expect(problems.sort()).toEqual(
      [
        `.next/server/app/index.html holds ${encore.id} question, which is sealed.`,
        `.next/server/app/index.html holds ${encore.id} answer beside its question, which is sealed.`,
        `public/encore.json holds ${encore.id} question, which is sealed.`,
        `public/encore.json holds ${encore.id} answer beside its question, which is sealed.`,
      ].sort(),
    );
  });

  it("with --sealed, decrypts the envelopes in memory with the key it is given and finds a planted clue", async () => {
    const build = fakeBuild();
    const master = randomBytes(32);
    const keys = deriveSealKeys(master);
    const sealed = { ...mystery, id: "m.geo.9001" };
    build.write(
      "content/sealed/mysteries/m.geo.9001.json.enc",
      envelopeText(sealBytes(keys, Buffer.from(JSON.stringify(sealed)))),
    );
    build.write(
      ".next/static/chunks/lazy-7.js",
      `var c=${JSON.stringify(sealed.clues[0])};`,
    );

    const { problems } = await runCheck({
      root: build.root,
      sealed: true,
      keySource: {
        envValue: master.toString("base64"),
        keyPath: join(build.root, "no-such.key"),
      },
    });

    expectFinding(
      problems,
      ".next/static/chunks/lazy-7.js",
      "m.geo.9001",
      "clues[0]",
    );
  });

  it("with --sealed and no key, stops with the key hint", async () => {
    const build = fakeBuild();

    await expect(
      runCheck({
        root: build.root,
        sealed: true,
        keySource: {
          envValue: undefined,
          keyPath: join(build.root, "no-such.key"),
        },
      }),
    ).rejects.toThrow(/--sealed needs the content key/);
  });

  it("says the text scan didn't run without --sealed", async () => {
    const { lines } = await runCheck({ root: fakeBuild().root });

    expect(lines[2]).toBe(
      "sealed text: not scanned (npm run check:lazy -- --sealed, where the content key is).",
    );
  });

  it("exits 1 from the command line on a finding, and 0 on a clean build", () => {
    const build = fakeBuild();
    const run = () =>
      spawnSync(process.execPath, [SCRIPT], {
        cwd: build.root,
        encoding: "utf8",
      });

    const clean = run();
    expect(clean.status, clean.stderr).toBe(0);
    expect(clean.stdout).toContain("check:lazy: sealed scan:");

    build.write("public/x.json", '{"id":"m.geo.0142"}');
    const dirty = run();
    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain(
      "check:lazy: public/x.json holds the sealed id m.geo.0142",
    );
  });
});

describe("AC-DLY-04's matching rules", () => {
  it("read numbers as whole formatted tokens", () => {
    expect(containsNumber("Daily #12 · 9/12", 12)).toBe(false);
    expect(containsNumber("v12 and 12a", 12)).toBe(false);
    expect(containsNumber("It has 12 moons.", 12)).toBe(true);
    expect(containsNumber("(1,250)", 1250)).toBe(true);
    expect(containsNumber("about 86.4 km", 86.4)).toBe(true);
    expect(containsNumber("1,25,000", 125000)).toBe(false);
    // A page's text runs straight into its tags and quotes.
    expect(containsNumber("<p>It is 1,250.</p>", 1250)).toBe(true);
    expect(containsNumber('{"v":1250}', 1250)).toBe(true);
    expect(containsNumber('<a title="12:30">', 12)).toBe(false);
  });

  it("decode JSON escapes and HTML entities before matching", () => {
    expect(
      decodeText("O\\u0027Brien &amp; O&#x27;Hara &#39;x&#39; &quot;"),
    ).toBe("O'Brien & O'Hara 'x' \"");
    expect(decodeText('\\\\"quoted\\\\" a\\nb')).toBe('"quoted" a b');
  });
});
