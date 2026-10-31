// @vitest-environment node
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./__fixtures__/builders.ts";
import { buildSlurMatcher, loadReferences, mythMatches } from "./references.ts";
import { charCount, foldName, rot13, wordCount } from "./text.ts";

describe("text helpers", () => {
  it("count words and characters the way the guide does", () => {
    expect(wordCount("  Seven  bridges cross it.  ")).toBe(4);
    expect(wordCount("")).toBe(0);
    expect(charCount("Čapek")).toBe(5);
  });

  it("fold case, accents, apostrophes and punctuation", () => {
    expect(foldName("Côte d'Ivoire")).toBe("cote divoire");
    expect(foldName("Björk Guðmundsdóttir")).toBe("bjork gudmundsdottir");
    expect(foldName("Straße & Œuvre")).toBe("strasse oeuvre");
    expect(rot13(rot13("Fixture"))).toBe("Fixture");
  });
});

describe("the slur matcher", () => {
  const matcher = buildSlurMatcher(
    ["zorb", "quixlat", "blee bop"],
    ["zorb island"],
  );

  it("matches short terms as whole words, long terms inside words, and phrases", () => {
    expect(matcher.test("A ZORB appears.")).toBe(true);
    expect(matcher.test("Two zorbs appear.")).toBe(true);
    expect(matcher.test("A zorbing contest.")).toBe(false);
    expect(matcher.test("An antiquixlation device.")).toBe(true);
    expect(matcher.test("Blee-bop and bleebop.")).toBe(true);
    expect(matcher.test("Ziggy Stardust.")).toBe(false);
  });

  it("removes allowlisted phrases first, and folds accents", () => {
    expect(matcher.test("We sailed to Zorb Island.")).toBe(false);
    expect(matcher.test("We sailed to Zörb.")).toBe(true);
  });

  it("leaves innocent words alone with the real list", async () => {
    const refs = await loadReferences(join(REPO_ROOT, "content", "reference"));
    expect(refs.slurs.size).toBeGreaterThan(20);
    const innocent = [
      "Niger and Nigeria border each other, and the Niger river runs through both.",
      "Montenegro, Pakistan and Santiago.",
      "Spice, spick and span, and a niggardly sum.",
      "Yiddish literature and the Rio Negro.",
      "A cocoon, a raccoon, Maine Coon cats and a golliwog doll.",
      "Scunthorpe, Penistone and Middlesex.",
      "The retarded potential in physics, and flame retardant.",
      "Kafka wrote in German.",
    ];
    const hits = innocent.filter((sentence) =>
      refs.slurs.test(sentence),
    ).length;
    expect(hits).toBe(0);
  });
});

describe("myth matching", () => {
  it("needs a phrase from every group", async () => {
    const refs = await loadReferences(join(REPO_ROOT, "content", "reference"));
    const wall = refs.myths.find(
      (myth) => myth.id === "great-wall-visible-from-space",
    );
    if (!wall) throw new Error("missing myth");
    expect(
      mythMatches(wall, "The Great Wall of China is visible from space."),
    ).toBe(true);
    expect(
      mythMatches(
        wall,
        "The Great Wall cannot be seen from the Moon with the naked eye.",
      ),
    ).toBe(true);
    expect(mythMatches(wall, "The Great Wall is over 20,000 km long.")).toBe(
      false,
    );
  });
});
