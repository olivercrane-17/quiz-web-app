/**
 * Generated names (MOD-1): Shuffle's draws, and the reviewed lists held to
 * the ticket's rule that no friendly name holds a listed term, checked
 * here through the filter the client really loads. A finding names the
 * pair by its positions in the lists, never by its text.
 */
import { describe, expect, it, vi } from "vitest";

import { NAME_ADJECTIVES, NAME_ANIMALS } from "@/content/generated/names";

import { NICKNAME_MAX_LENGTH } from "./copy";
import { loadNameFilter } from "./filter";
import { randomUnit, shuffleName } from "./names";

/** A random source that returns `units` in turn. */
function draws(...units: number[]): () => number {
  let next = 0;
  return () => units[next++ % units.length] as number;
}

const firstPair = `${NAME_ADJECTIVES[0]} ${NAME_ANIMALS[0]}`;

describe("shuffleName", () => {
  it("draws an adjective, then an animal, from the reviewed lists", () => {
    expect(shuffleName("Plucky Otter", draws(0, 0))).toBe(firstPair);
    expect(shuffleName("Plucky Otter", draws(0.999_999, 0.999_999))).toBe(
      `${NAME_ADJECTIVES.at(-1)} ${NAME_ANIMALS.at(-1)}`,
    );
  });

  it("never gives back the current name: the next animal stands in, wrapping at the end", () => {
    expect(shuffleName(firstPair, draws(0, 0))).toBe(
      `${NAME_ADJECTIVES[0]} ${NAME_ANIMALS[1]}`,
    );
    const lastPair = `${NAME_ADJECTIVES[0]} ${NAME_ANIMALS.at(-1)}`;
    expect(shuffleName(lastPair, draws(0, 0.999_999))).toBe(firstPair);
  });

  it("draws from crypto.getRandomValues by default", () => {
    const getRandomValues = vi.spyOn(globalThis.crypto, "getRandomValues");
    const name = shuffleName("Plucky Otter");
    expect(getRandomValues).toHaveBeenCalledTimes(2);
    const [adjective, animal] = name.split(" ");
    expect(NAME_ADJECTIVES).toContain(adjective);
    expect(NAME_ANIMALS).toContain(animal);
    for (let i = 0; i < 200; i += 1) {
      const unit = randomUnit();
      expect(unit).toBeGreaterThanOrEqual(0);
      expect(unit).toBeLessThan(1);
    }
  });
});

describe("the reviewed name lists", () => {
  it("MOD-1 no friendly name holds a listed term (every pair of content/names/, through the client filter)", async () => {
    const filter = await loadNameFilter();
    const blocked: string[] = [];
    NAME_ADJECTIVES.forEach((adjective, a) => {
      NAME_ANIMALS.forEach((animal, b) => {
        if (filter.isBlocked(`${adjective} ${animal}`)) {
          blocked.push(`adjective ${a + 1}, animal ${b + 1}`);
        }
      });
    });
    expect(NAME_ADJECTIVES.length * NAME_ANIMALS.length).toBeGreaterThan(
      20_000,
    );
    expect(blocked).toEqual([]);
  });

  it("fits every pair in a nickname's 24 characters, so set_nickname takes each one", () => {
    const longest = (list: readonly string[]) =>
      Math.max(...list.map((word) => word.length));
    expect(
      longest(NAME_ADJECTIVES) + 1 + longest(NAME_ANIMALS),
    ).toBeLessThanOrEqual(NICKNAME_MAX_LENGTH);
  });
});
