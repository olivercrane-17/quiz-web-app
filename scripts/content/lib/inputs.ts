/**
 * Reads everything the build needs from a repository: the content bank
 * (content/), the fixture tree (content/fixtures/), the composition
 * layouts, the shared config, the committed practice positions and the
 * side inputs other tickets own (content/names/, content/safety/,
 * content/category-pages/). Plaintext only: the build never decrypts, and
 * sealed workspace files it may load for validation never reach an output.
 */
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import * as prettier from "prettier";

import { loadBank, type Bank } from "../../../src/content/pipeline/bank.ts";
import { resolveLayout } from "../../../src/content/pipeline/layout.ts";
import {
  PRACTICE_SEED_PATH,
  parseLineFile,
  type BuildInputs,
} from "./outputs.ts";

function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function readJson(path: string): unknown {
  const text = readText(path);
  return text === null ? null : (JSON.parse(text) as unknown);
}

export interface LoadedBanks {
  bank: Bank;
  fixtures: Bank | null;
}

/** content/ and content/fixtures/ as the pipeline loads them, workspace included. */
export async function loadBanks(repoRoot: string): Promise<LoadedBanks> {
  const bank = await loadBank(resolveLayout({ repoRoot, root: "content" }));
  const fixtureRoot = join(repoRoot, "content", "fixtures");
  const fixtures = existsSync(fixtureRoot)
    ? await loadBank(
        resolveLayout({ repoRoot, root: "content/fixtures", fixtures: true }),
      )
    : null;
  return { bank, fixtures };
}

/** content/category-pages/<slug>.json: `{ "intro": "..." }` (F-CAT, CAT-1). */
async function categoryIntros(
  repoRoot: string,
): Promise<ReadonlyMap<string, string>> {
  const dir = join(repoRoot, "content", "category-pages");
  const intros = new Map<string, string>();
  if (!existsSync(dir)) return intros;
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith(".json")) continue;
    const raw = readJson(join(dir, name)) as { intro?: unknown } | null;
    if (typeof raw?.intro === "string" && raw.intro !== "") {
      intros.set(name.slice(0, -".json".length), raw.intro);
    }
  }
  return intros;
}

/** Formats one output with the repository's Prettier config. */
export function prettierFormatter(
  repoRoot: string,
): (path: string, text: string) => Promise<string> {
  const configs = new Map<string, Promise<prettier.Options | null>>();
  return async (path, text) => {
    const filepath = join(repoRoot, path);
    const extension = path.slice(path.lastIndexOf("."));
    let config = configs.get(extension);
    if (config === undefined) {
      config = prettier.resolveConfig(filepath);
      configs.set(extension, config);
    }
    return prettier.format(text, { ...(await config), filepath });
  };
}

export async function loadBuildInputs(
  repoRoot: string,
  banks: LoadedBanks,
): Promise<BuildInputs> {
  return {
    bank: banks.bank,
    fixtures: banks.fixtures,
    compositions: readJson(join(repoRoot, "content", "compositions.json")),
    shared: (readJson(join(repoRoot, "src", "config", "shared.json")) ??
      {}) as Record<string, unknown>,
    previousPracticeSql: readText(join(repoRoot, PRACTICE_SEED_PATH)),
    names: {
      adjectives: parseLineFile(
        readText(join(repoRoot, "content", "names", "adjectives.txt")),
      ),
      animals: parseLineFile(
        readText(join(repoRoot, "content", "names", "animals.txt")),
      ),
    },
    moderation: {
      terms: parseLineFile(
        readText(join(repoRoot, "content", "safety", "slur-terms.txt")),
      ),
      allowlist: parseLineFile(
        readText(join(repoRoot, "content", "safety", "allowlist.txt")),
      ),
    },
    categoryIntros: await categoryIntros(repoRoot),
    format: prettierFormatter(repoRoot),
  };
}
