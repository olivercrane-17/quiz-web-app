// @vitest-environment node
/**
 * content:build (ARCHITECTURE §5.3): every output, deterministic, budgets
 * enforced on the bytes that ship, the drift check, the append-only bit
 * positions, and no sealed pool in any output (§5.4).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  fxCountryList,
  loadContentTree,
  removeTempDirs,
  tempDir,
} from "../../../src/content/pipeline/__fixtures__/builders.ts";
import { compareOutputs, existingOutputs, writeOutputs } from "./files.ts";
import { loadBanks, loadBuildInputs } from "./inputs.ts";
import {
  LIST_GZIP_LIMIT,
  PACK_GZIP_LIMIT,
  buildOutputs,
  type BuildInputs,
  type BuildResult,
} from "./outputs.ts";
import { entityKeys, projectList } from "./project.ts";
import { readPracticeRows } from "./sql.ts";

afterAll(removeTempDirs);

let first: BuildResult;
let inputs: BuildInputs;

beforeAll(async () => {
  inputs = await loadBuildInputs(REPO_ROOT, await loadBanks(REPO_ROOT));
  first = await buildOutputs(inputs);
}, 60_000);

/** ARCHITECTURE §5.4's sealed id pattern, fixtures excepted. */
const SEALED_ID = /(?<!fx\.)\b(m\.[a-z]+\.\d{4}|e\.\d{4}|r\.[a-z-]+\.\d{2})\b/;

const CHOICE_ITEM_KEYS = [
  "category",
  "correct",
  "explanation",
  "format",
  "id",
  "learnMore",
  "options",
  "order",
  "predicted",
  "region",
  "reviewBy",
  "seededDifficulty",
  "stem",
  "tags",
  "valueDisplay",
  "volatility",
];

describe("content:build", () => {
  it("builds every output of §5.3 from the bank, with nothing to fix", () => {
    expect(first.problems).toEqual([]);
    const paths = first.outputs.map((output) => output.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "src/content/generated/manifest.ts",
        "src/content/generated/categories.ts",
        "src/content/generated/names.ts",
        "src/content/generated/category-pages.ts",
        "src/content/generated/moderation.ts",
        "src/content/generated/fixture-world.json",
        "src/backend/mock/fixtures.generated.ts",
        "supabase/seed/answer-entities.sql",
        "supabase/seed/practice-items.sql",
        "supabase/seed/config.sql",
      ]),
    );
    expect(first.packs).toHaveLength(12);
    expect(first.lists).toHaveLength(12);
    expect(
      paths.filter((path) => path.startsWith("public/content/packs/")),
    ).toHaveLength(12);
  });

  it("two builds produce identical outputs, and they are the committed ones", async () => {
    const second = await buildOutputs(inputs);
    expect(second.outputs).toEqual(first.outputs);
    expect(second.contentVersion).toBe(first.contentVersion);
    expect(await compareOutputs(REPO_ROOT, first.outputs)).toEqual({
      changed: [],
      missing: [],
      stale: [],
    });
  });

  it("names every pack and list by its content hash", () => {
    for (const output of first.outputs) {
      const match =
        /^public\/content\/(packs|lists)\/[a-z_-]+\.([0-9a-f]{8})\.json$/.exec(
          output.path,
        );
      if (!match) continue;
      const json = JSON.parse(output.content) as Record<string, unknown>;
      if (match[1] === "packs") {
        expect(json.version).toBe(match[2]);
        const { version: _version, ...rest } = json;
        const hash = createHash("sha256")
          .update(
            JSON.stringify({ category: rest.category, items: rest.items }),
          )
          .digest("hex")
          .slice(0, 8);
        expect(hash).toBe(match[2]);
      } else {
        const hash = createHash("sha256")
          .update(JSON.stringify(json))
          .digest("hex")
          .slice(0, 8);
        expect(hash).toBe(match[2]);
      }
    }
  });

  it("ships practice items in the built shape of §3.2, every source-only field stripped", () => {
    const packs = first.outputs.filter((o) =>
      o.path.startsWith("public/content/packs/"),
    );
    let items = 0;
    for (const pack of packs) {
      const json = JSON.parse(pack.content) as {
        items: Record<string, unknown>[];
      };
      for (const item of json.items) {
        items += 1;
        expect(Object.keys(item).sort()).toEqual(CHOICE_ITEM_KEYS);
        if (item.format === "tf") {
          expect(item.options).toEqual(["True", "False"]);
          expect(item.order).toBe("fixed");
        }
        if (item.format === "comparison") {
          expect(item.order).toBe("shuffle");
          expect(item.valueDisplay).toHaveLength(2);
        }
        if (item.format === "mc") expect(item.correct).toBe(0);
      }
    }
    expect(items).toBe(first.packs.reduce((sum, p) => sum + p.items, 0));
  });

  it("ships each list as the client projection of §5.5: active, unreplaced entries as [id, display, keys, popularity]", async () => {
    const list = fxCountryList() as {
      type: "country";
      version: string;
      entities: Record<string, unknown>[];
    };
    const entities = list.entities.map((entity, i) =>
      i === 3
        ? { ...entity, status: "retired" }
        : i === 4
          ? { ...entity, replacedBy: list.entities[5]?.id }
          : entity,
    );
    const projected = projectList("country", list.version, entities as never);
    expect(projected.entities).toHaveLength(entities.length - 2);
    const arvenna = projected.entities.find(
      ([id]) => id === "fx.x.country.arvenna",
    );
    expect(arvenna).toEqual([
      "fx.x.country.arvenna",
      "Arvenna",
      ["arvenna", "arven republic"],
      0,
    ]);
    expect(
      entityKeys({ name: "The Hague", aliases: ["Den Haag", "the hague"] }),
    ).toEqual(["hague", "den haag"]);
  });

  it("AC-CNT-03 every shipped list is 80 KB gzipped or less, and a synthetic 3,000-entry person list stays under it", () => {
    for (const list of first.lists) {
      expect(list.gzipBytes, list.type).toBeLessThanOrEqual(LIST_GZIP_LIMIT);
    }
    // §1.5's synthetic person list: random-syllable names, which compress
    // worse than real ones, each with a descriptor and an alias.
    const syllables = [
      "ka",
      "ro",
      "mi",
      "lu",
      "ten",
      "sha",
      "vor",
      "di",
      "an",
      "bel",
      "qui",
      "zor",
    ];
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const word = () =>
      Array.from(
        { length: 2 + Math.floor(random() * 3) },
        () => syllables[Math.floor(random() * syllables.length)],
      ).join("");
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const entities = Array.from({ length: 3000 }, (_, i) => {
      const name = `${cap(word())} ${cap(word())}`;
      return {
        id: `x.person.${name.toLowerCase().replace(/ /g, "-")}-${i}`,
        name,
        display: name,
        aliases: random() < 0.3 ? [`${cap(word())} ${name.split(" ")[1]}`] : [],
        popularity: 0,
        qualifier: { descriptor: "fixture writer", born: null },
        source: "l.person.b01",
        status: "active",
        addedIn: "2026-11-01",
      };
    });
    const projected = JSON.stringify(
      projectList("person", "2026-11-01", entities as never),
    );
    expect(gzipSync(projected).length).toBeLessThan(LIST_GZIP_LIMIT);
  });

  it("enforces the per-pack and per-list budgets on the bytes that ship", async () => {
    // A list too big to ship: 9,000 entries of noise.
    const base = fxCountryList() as { entities: Record<string, unknown>[] };
    const noise = (i: number) =>
      createHash("sha256").update(String(i)).digest("hex");
    const bigList = {
      ...base,
      entities: Array.from({ length: 9000 }, (_, i) => ({
        ...base.entities[0],
        id: `x.country.n${noise(i).slice(0, 20)}`,
        name: `N${noise(i)}`,
        display: `D${noise(i).slice(10)}`,
        aliases: [`A${noise(i).slice(20)}`],
      })),
    };
    const bank = await loadContentTree({
      "answer-lists/country.json": bigList,
    });
    const result = await buildOutputs({
      ...inputs,
      bank,
      fixtures: null,
      previousPracticeSql: null,
    });
    expect(result.problems.map((p) => p.rule)).toEqual(["X09"]);
    expect(PACK_GZIP_LIMIT).toBe(40_000);
  });

  it("keeps every bit position it ever handed out, and gives new items the next ones", async () => {
    const rows = readPracticeRows(
      readFileSync(join(REPO_ROOT, "supabase/seed/practice-items.sql"), "utf8"),
    );
    expect(rows.length).toBe(first.packs.reduce((s, p) => s + p.items, 0));
    expect(new Set(rows.map((row) => row.ord)).size).toBe(rows.length);
    // An earlier file that knew one item at position 7 and one retired item
    // at position 40: both keep theirs, and new items start at 41.
    const known = rows[0];
    if (known === undefined) throw new Error("no rows");
    const previous = [
      "insert into private.practice_items (id, category, ord, option_count)",
      "values",
      `  ('${known.id}', '${known.category}', 7, ${known.optionCount}),`,
      "  ('p.geo.0999', 'geo', 40, 4)",
      "on conflict (id) do update",
    ].join("\n");
    const result = await buildOutputs({
      ...inputs,
      previousPracticeSql: previous,
    });
    const next = readPracticeRows(
      result.outputs.find((o) => o.path === "supabase/seed/practice-items.sql")
        ?.content ?? "",
    );
    expect(next.find((row) => row.id === known.id)?.ord).toBe(7);
    expect(next.find((row) => row.id === "p.geo.0999")?.ord).toBe(40);
    const fresh = next.filter(
      (row) => row.id !== known.id && row.id !== "p.geo.0999",
    );
    expect(Math.min(...fresh.map((row) => row.ord))).toBe(41);
    expect(new Set(next.map((row) => row.ord)).size).toBe(next.length);
  });

  it("writes SQL loads that apply unattended: idempotent upserts, nothing destructive", () => {
    for (const output of first.outputs.filter((o) => o.path.endsWith(".sql"))) {
      expect(output.content, output.path).not.toMatch(
        /\b(delete|drop|truncate|revoke|alter)\b/i,
      );
      const inserts = output.content.match(/^insert into /gm) ?? [];
      const upserts = output.content.match(/^on conflict \(/gm) ?? [];
      expect(inserts.length, output.path).toBeGreaterThan(0);
      expect(upserts.length, output.path).toBe(inserts.length);
      for (const statement of output.content.split(";\n")) {
        expect(Buffer.byteLength(statement), output.path).toBeLessThan(400_000);
      }
    }
    const config = first.outputs.find(
      (o) => o.path === "supabase/seed/config.sql",
    );
    expect(config?.content).toContain("('crowd_min_n', '50'::jsonb)");
    expect(config?.content).toContain("('options_from_clue', '4'::jsonb)");
  });

  it("puts no sealed pool in public/content or a client module, and only fx. content in the mock's", () => {
    for (const output of first.outputs) {
      if (output.path.endsWith(".sql")) continue;
      expect(SEALED_ID.test(output.content), output.path).toBe(false);
    }
    const mock = first.outputs.find(
      (o) => o.path === "src/backend/mock/fixtures.generated.ts",
    );
    const ids = [
      ...(mock?.content ?? "").matchAll(
        /"((?:fx\.)?[a-z]+\.[a-z0-9.-]+\.\d{2,4})"/g,
      ),
    ].map((m) => m[1] ?? "");
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.every((id) => id.startsWith("fx."))).toBe(true);
    // The fixture tree's sealed kinds stay out of the client's fixture world.
    const world = first.outputs.find(
      (o) => o.path === "src/content/generated/fixture-world.json",
    );
    expect(world?.content).not.toMatch(/"kind":/);
  });

  it("the drift check fails on a hand-edited pack, a missing output and a stale one", async () => {
    const root = tempDir("qz-drift-");
    await writeOutputs(root, first.outputs);
    expect(await existingOutputs(root)).toEqual(
      first.outputs.map((o) => o.path).sort(),
    );
    const pack = first.outputs.find((o) =>
      o.path.startsWith("public/content/packs/"),
    );
    if (!pack) throw new Error("no pack");
    writeFileSync(
      join(root, pack.path),
      pack.content.replace(/"stem": "/, '"stem": "Edited: '),
    );
    const stale = "public/content/packs/old.0000beef.json";
    writeFileSync(join(root, stale), "{}\n");
    const drift = await compareOutputs(root, first.outputs);
    expect(drift.changed).toEqual([pack.path]);
    expect(drift.stale).toEqual([stale]);

    // The CLI end to end: --check against that tree fails and names the pack.
    const run = spawnSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        join(REPO_ROOT, "scripts/content/build.ts"),
        "--check",
        "--out",
        root,
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(1);
    expect(run.stdout).toContain(`differs  ${pack.path}`);
    expect(run.stdout).toContain(`stale    ${stale}`);
    // Writing repairs it; a second check is clean.
    await writeOutputs(root, first.outputs);
    expect(await compareOutputs(root, first.outputs)).toEqual({
      changed: [],
      missing: [],
      stale: [],
    });
    expect(readdirSync(join(root, "public/content/packs"))).not.toContain(
      "old.0000beef.json",
    );
  }, 60_000);
});
