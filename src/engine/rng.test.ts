// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createRng, cyrb128 } from "./rng.ts";

/**
 * The published cyrb128 and sfc32 (bryc, "PRNGs in JavaScript"), written out
 * independently here so the module is checked against the algorithm and
 * not only against itself.
 */
function referenceStream(seed: string): () => number {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0, k; i < seed.length; i++) {
    k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  let a = h1 >>> 0,
    b = h2 >>> 0,
    c = h3 >>> 0,
    d = h4 >>> 0;
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

describe("rng", () => {
  it("matches the recorded sequence fixture for a literal seed", () => {
    expect(cyrb128("qz")).toEqual([
      4172073590, 2605379498, 3358747325, 1156057416,
    ]);
    const rng = createRng("qz");
    expect(Array.from({ length: 8 }, () => rng.next())).toEqual([
      0.8471643570810556, 0.9129193301778287, 0.015751059167087078,
      0.1138025012332946, 0.4257320954930037, 0.41419703396968544,
      0.24492048053070903, 0.9028084308374673,
    ]);
    const ints = createRng("attempt:42");
    expect(Array.from({ length: 12 }, () => ints.int(10))).toEqual([
      8, 9, 8, 3, 2, 2, 5, 0, 6, 6, 5, 1,
    ]);
    expect(
      createRng("shuffle-seed").shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ).toEqual([8, 2, 9, 6, 4, 7, 5, 3, 0, 1]);
  });

  it("follows the published cyrb128 and sfc32 algorithm", () => {
    for (const seed of ["", "qz", "p.geo.0142", "Ünïcødé 🙂 seed"]) {
      const ours = createRng(seed);
      const reference = referenceStream(seed);
      for (let i = 0; i < 1000; i += 1) {
        expect(ours.next()).toBe(reference());
      }
    }
  });

  it("is deterministic per seed and differs between seeds", () => {
    const a = createRng("same");
    const b = createRng("same");
    const c = createRng("other");
    const draw = (r: ReturnType<typeof createRng>) =>
      Array.from({ length: 20 }, () => r.next());
    const first = draw(a);
    expect(draw(b)).toEqual(first);
    expect(draw(c)).not.toEqual(first);
  });

  it("keeps next() in [0, 1) and int() inside its bound", () => {
    const rng = createRng("bounds");
    for (let i = 0; i < 5000; i += 1) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = rng.int(7);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it("reaches every value of a small bound", () => {
    const rng = createRng("coverage");
    const seen = new Set(Array.from({ length: 400 }, () => rng.int(6)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("refuses a bound that is not a positive integer", () => {
    const rng = createRng("bad");
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(-3)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it("shuffles into a permutation and leaves the input untouched", () => {
    const input = Object.freeze(["a", "b", "c", "d", "e"]);
    const rng = createRng("perm");
    for (let i = 0; i < 50; i += 1) {
      const out = rng.shuffle(input);
      expect(out).not.toBe(input);
      expect([...out].sort()).toEqual([...input]);
    }
    expect(input).toEqual(["a", "b", "c", "d", "e"]);
    expect(rng.shuffle([])).toEqual([]);
  });

  it("produces every ordering of three items with similar frequency", () => {
    const rng = createRng("fisher-yates");
    const counts = new Map<string, number>();
    for (let i = 0; i < 6000; i += 1) {
      const key = rng.shuffle([1, 2, 3]).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });

  it("picks only from the items", () => {
    const rng = createRng("pick");
    for (let i = 0; i < 100; i += 1) {
      expect(["x", "y", "z"]).toContain(rng.pick(["x", "y", "z"]));
    }
  });

  it("forks streams that are stable per label and independent of use", () => {
    const parent = createRng("qz");
    const early = parent.fork("attempt:a:round:1");
    for (let i = 0; i < 25; i += 1) parent.next();
    const late = parent.fork("attempt:a:round:1");
    const draw = (r: ReturnType<typeof createRng>) =>
      Array.from({ length: 4 }, () => r.int(1000));
    const recorded = [629, 827, 13, 938];
    expect(draw(early)).toEqual(recorded);
    expect(draw(late)).toEqual(recorded);
    expect(draw(createRng("qz").fork("attempt:a:round:2"))).not.toEqual(
      recorded,
    );
  });

  it("keeps fork seeds from colliding across a separator", () => {
    const a = createRng("a/b").fork("c");
    const b = createRng("a").fork("b/c");
    expect(a.next()).not.toBe(b.next());
  });
});
