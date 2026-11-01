// @vitest-environment node
/**
 * The suggestion budget (ARCHITECTURE §4.7): every keystroke on the largest
 * list, people at its 3,000-entity target with aliases and some namesakes'
 * qualifiers, takes under 4 ms, and the typical one well under. The list is
 * synthetic (seeded syllable names, which spread worse than real ones), the
 * queries replay typing 60 names letter by letter, typos included, and each
 * query keeps its fastest of three runs, so a busy shared machine can't fail
 * the guard on noise alone. The test's own time limit is generous for the
 * same reason: about 2,400 timed scans take a second or two on an idle
 * machine, several times that on a loaded one.
 *
 * The timer comes from node:perf_hooks: the test measures the engine, it is
 * not part of it.
 */
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { createRng } from "../rng.ts";
import type { AnswerEntity, AnswerList } from "../types/content.ts";
import { parseEntityId, type EntityId } from "../types/ids.ts";
import { createSuggestionIndex, normalizeName, suggest } from "./index.ts";

const BUDGET_MS = 4;
const ENTITIES = 3000;
const RUNS = 3;
const TIME_LIMIT_MS = 30_000;

const SYLLABLES = [
  "ka",
  "lo",
  "ver",
  "an",
  "mi",
  "ra",
  "son",
  "el",
  "do",
  "ri",
  "ta",
  "bel",
  "mor",
  "en",
  "li",
  "sa",
  "ton",
  "va",
  "ber",
  "de",
  "ni",
  "ol",
  "gar",
  "is",
  "ma",
  "ry",
  "ch",
  "wen",
  "fi",
  "zo",
  "hal",
  "ste",
  "pha",
  "nie",
  "ju",
  "ke",
];

const QUALIFIERS = ["painter", "sculptor", "poet", "chemist", "composer"];

function syntheticPeople(): AnswerList {
  const rng = createRng("suggest-benchmark");
  const word = (parts: number) => {
    let out = "";
    for (let i = 0; i < parts; i += 1) out += rng.pick(SYLLABLES);
    return out.charAt(0).toUpperCase() + out.slice(1);
  };
  const entities: AnswerEntity[] = [];
  for (let i = 0; i < ENTITIES; i += 1) {
    const name = `${word(2 + rng.int(2))} ${word(2 + rng.int(3))}`;
    const aliases: string[] = [];
    const aliasCount = rng.int(3);
    for (let a = 0; a < aliasCount; a += 1) {
      aliases.push(`${word(2)} ${name.split(" ")[1] ?? ""}`);
    }
    const id = parseEntityId(`x.person.p${i}`) as EntityId;
    // One in eight carries a namesake's qualifier, so the display key is
    // scanned too (CONTENT_GUIDE §2.10).
    const qualifier = QUALIFIERS[i % QUALIFIERS.length] ?? "poet";
    entities.push({
      id,
      display: i % 8 === 0 ? `${name} (${qualifier})` : name,
      keys: [...new Set([name, ...aliases].map(normalizeName))],
      popularity: rng.int(200),
    });
  }
  return { type: "person", version: "bench", entities };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe("the suggestion benchmark", () => {
  it(
    `answers a keystroke on a ${ENTITIES}-person list in under ${BUDGET_MS} ms`,
    () => {
      const list = syntheticPeople();
      const index = createSuggestionIndex(list);
      const rng = createRng("suggest-benchmark-queries");
      const queries: string[] = [];
      for (let i = 0; i < 60; i += 1) {
        const target = rng.pick(list.entities).display;
        // Type the name letter by letter; every third name with a slip in it.
        const typed =
          i % 3 === 0 ? target.slice(0, 3) + "x" + target.slice(4) : target;
        for (let n = 1; n <= Math.min(typed.length, 14); n += 1) {
          queries.push(typed.slice(0, n));
        }
      }
      const guessed = new Set<EntityId>(
        list.entities.slice(0, 3).map((e) => e.id),
      );

      // Warm the JIT, as a player's first few keystrokes do.
      for (const query of queries.slice(0, 50)) {
        suggest(index, query, { limit: 6, alreadyGuessed: guessed });
      }

      const times = queries.map((query) => {
        let best = Number.POSITIVE_INFINITY;
        for (let run = 0; run < RUNS; run += 1) {
          const start = performance.now();
          suggest(index, query, { limit: 6, alreadyGuessed: guessed });
          best = Math.min(best, performance.now() - start);
        }
        return best;
      });
      const sorted = [...times].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      expect(queries.length).toBeGreaterThan(500);
      // The budget holds for every keystroke, not just most of them.
      expect(sorted.at(-1) ?? 0).toBeLessThan(BUDGET_MS);
      expect(p95).toBeLessThan(BUDGET_MS);
      expect(median(times)).toBeLessThan(BUDGET_MS / 2);
    },
    TIME_LIMIT_MS,
  );
});
