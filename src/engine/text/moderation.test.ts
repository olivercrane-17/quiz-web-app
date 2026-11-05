/**
 * The slur filter's matcher (PRD §3.9.4, ARCHITECTURE §4.12): the folding
 * table, each reading step, the compiled patterns, and every row of
 * src/engine/fixtures/moderation.json (AC-LNT-03), whose stand-in list holds
 * no real term. The same rows run through SQL in
 * supabase/tests/generated/moderation.test.sql; the real list is held to
 * the same rules in src/features/nickname/filter.test.ts.
 */
import { describe, expect, it } from "vitest";

import fixture from "../fixtures/moderation.json";
import {
  FILTER_LETTERS,
  FOLD_BASE,
  FOLD_SWAPS,
  PASSES,
  PLURAL_SUFFIX,
  SHORT_TERM_LETTERS,
  SWAP_CHARACTERS,
  allowedWords,
  applySwaps,
  cleanText,
  createModerationList,
  foldText,
  isBlocked,
  moderationPatterns,
  normalizeForFilter,
  rot13,
  runsPattern,
  termAlternatives,
  termMatchOf,
  type ModerationTerm,
} from "./moderation.ts";

const char = (code: number) => String.fromCodePoint(code);
const terms = fixture.terms as ModerationTerm[];
const list = createModerationList(terms, fixture.allowlist);

describe("the folding table", () => {
  it("folds each character once, a single code point to one letter or to nothing", () => {
    for (const table of [FOLD_BASE, FOLD_SWAPS]) {
      const sources = table.map((entry) => entry.from);
      expect(new Set(sources).size).toBe(sources.length);
      for (const { from, to } of table) {
        expect([...from]).toHaveLength(1);
        expect(to === "" || FILTER_LETTERS.includes(to)).toBe(true);
        expect(to.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("names no character that NFKC would change first, except among the removals", () => {
    const dead = FOLD_BASE.filter(
      ({ from, to }) => to !== "" && from.normalize("NFKC") !== from,
    );
    expect(dead).toEqual([]);
  });

  it("puts the removals last, as translate() wants them", () => {
    const firstRemoval = FOLD_BASE.findIndex((entry) => entry.to === "");
    expect(firstRemoval).toBeGreaterThan(0);
    expect(FOLD_BASE.slice(firstRemoval).every((e) => e.to === "")).toBe(true);
  });

  it("lowers every capital and keeps the swaps out of the base table", () => {
    for (const letter of FILTER_LETTERS) {
      expect(foldText(letter.toUpperCase())).toBe(letter);
      expect(foldText(letter)).toBe(letter);
    }
    const base = new Set(FOLD_BASE.map((entry) => entry.from));
    expect(FOLD_SWAPS.every((entry) => !base.has(entry.from))).toBe(true);
    expect(new Set(FOLD_SWAPS.map((entry) => entry.from))).toEqual(
      new Set(SWAP_CHARACTERS),
    );
  });
});

describe("foldText", () => {
  it("folds case, marks, look-alike letters and NFKC forms", () => {
    expect(foldText("Crème BRÛLÉE")).toBe("creme brulee");
    expect(foldText("Øresund Łódź Straße")).toBe("oresund lodz strase");
    // Cyrillic a, e, o and Greek omicron that look like Latin ones.
    expect(foldText(`h${char(0x0435)}ll${char(0x043e)}`)).toBe("hello");
    expect(foldText(`${char(0x0391)}${char(0x03bf)}`)).toBe("ao");
    // Fullwidth letters and a ligature, through NFKC.
    expect(foldText(`${char(0xff28)}${char(0xff49)} ${char(0xfb01)}ne`)).toBe(
      "hi fine",
    );
  });

  it("removes what nobody sees, so it never splits a word", () => {
    const hidden = [0x200b, 0x200d, 0x00ad, 0x2060, 0xfeff, 0x202e, 0x0007];
    for (const code of hidden) {
      expect(foldText(`ab${char(code)}cd`)).toBe("abcd");
    }
    // A combining mark with no precomposed letter is dropped.
    expect(foldText(`a${char(0x0336)}b`)).toBe("ab");
  });

  it("keeps digits, symbols and other scripts for the passes to read", () => {
    expect(foldText("h3llo!")).toBe("h3llo!");
    expect(foldText(`${char(0x0416)}x`)).toBe(`${char(0x0416)}x`);
  });
});

describe("the passes", () => {
  it("reads every swap as a letter in the swaps pass", () => {
    expect(applySwaps("h3ll0 w0r1d! $|@7", "swaps")).toBe("hello woridi slat");
  });

  it("turns trailing exclamation marks into separators in the bangs pass", () => {
    expect(applySwaps("r07! sh!t h3n!1", "bangs")).toBe("rot  shit henii");
  });

  it("turns every trailing swap character into a separator in the edges pass", () => {
    expect(applySwaps("h3n!1 b0b5 5ad", "edges")).toBe("hen  bob  sad");
  });

  it("reads no swap in the plain pass", () => {
    expect(applySwaps("hen1 h3n", "plain")).toBe("hen1 h3n");
  });

  it("runs the passes in a fixed order", () => {
    expect(PASSES).toEqual(["swaps", "bangs", "edges", "plain"]);
  });
});

describe("normalizeForFilter", () => {
  it("splits on everything that is not a to z and joins runs of single letters", () => {
    expect(normalizeForFilter("H.E.N and Heeeen, h e n!", "plain")).toEqual([
      "hen",
      "and",
      "heeeen",
      "hen",
    ]);
    expect(normalizeForFilter("a b cd e f", "plain")).toEqual([
      "ab",
      "cd",
      "ef",
    ]);
    expect(normalizeForFilter("I am a b", "plain")).toEqual(["i", "am", "ab"]);
  });

  it("keeps repeated letters, which matching reads as runs", () => {
    expect(normalizeForFilter("Quibbbler")).toEqual(["quibbbler"]);
  });

  it("reads a text with no letters as no words", () => {
    expect(normalizeForFilter("")).toEqual([]);
    expect(normalizeForFilter(" ** ## ", "plain")).toEqual([]);
    expect(normalizeForFilter("2026", "plain")).toEqual([]);
  });

  it("reads digits as letters only in the passes that swap them", () => {
    expect(normalizeForFilter("hen1", "swaps")).toEqual(["heni"]);
    expect(normalizeForFilter("hen1", "edges")).toEqual(["hen"]);
    expect(normalizeForFilter("hen1", "plain")).toEqual(["hen"]);
  });
});

describe("terms", () => {
  it("matches whole words up to 5 letters and anywhere from 6", () => {
    expect(SHORT_TERM_LETTERS).toBe(5);
    expect(termMatchOf("abcde")).toBe("word");
    expect(termMatchOf("abcdef")).toBe("substring");
    // Letters count, not spaces: two words of 3 and 3 letters are 6.
    expect(termMatchOf("abc def")).toBe("substring");
    expect(termMatchOf("no go")).toBe("word");
  });

  it("declares in the fixture the match the rule gives", () => {
    for (const term of terms) expect(termMatchOf(term.term)).toBe(term.match);
  });

  it("compiles letters run by run, with i and l standing for each other", () => {
    expect(runsPattern("hen")).toBe("h+e+n+");
    expect(runsPattern("quibbler")).toBe("q+u+(?:i+|l+)b{2,}(?:i+|l+)e+r+");
    expect(runsPattern("ill")).toBe("(?:i+|l+)(?:i{2,}|l{2,})");
    expect(runsPattern("")).toBe("");
  });

  it("adds a word term's phrase, and its words run together", () => {
    expect(termAlternatives("hen", "word")).toEqual(["h+e+n+"]);
    expect(termAlternatives("no go", "word")).toEqual([
      "n+o+ g+o+",
      "n+o+g+o+",
    ]);
    expect(termAlternatives("bad wolf", "substring")).toEqual([
      "b+a+d+w+o+(?:i+|l+)f+",
    ]);
    expect(termAlternatives("%%", "word")).toEqual([]);
  });

  it("AC-LNT-03 compiles the fixture list to exactly the sources SQL builds", () => {
    const patterns = moderationPatterns(terms);
    expect(patterns.word).toBe(fixture.patterns.word);
    expect(patterns.substring).toBe(fixture.patterns.substring);
    expect(patterns.size).toBe(terms.length);
    expect(patterns.word?.endsWith(`${PLURAL_SUFFIX} `)).toBe(true);
  });

  it("compiles an empty kind to null and ignores a term with no letters", () => {
    expect(moderationPatterns([])).toEqual({
      word: null,
      substring: null,
      size: 0,
    });
    expect(moderationPatterns(["hen", "%%"])).toMatchObject({
      substring: null,
      size: 1,
    });
    // A bare string takes the rule's match.
    expect(moderationPatterns(["zorblax"]).word).toBeNull();
  });

  it("keeps allowlist entries that read as one word", () => {
    expect(
      allowedWords(["Zorblaxton", "two words", "%%", "zorblaxton"]),
    ).toEqual(["zorblaxton"]);
  });
});

describe("isBlocked", () => {
  it.each(fixture.cases.map((row, index) => [index, row] as const))(
    "AC-LNT-03 case %i gets its verdict",
    (_index, row) => {
      expect(
        { why: row.why, blocked: isBlocked(row.text, list) },
        row.why,
      ).toEqual({ why: row.why, blocked: row.blocked });
    },
  );

  it("AC-LNT-03 passes the allowlist fixture of 100 innocent words that hold a short listed string", () => {
    expect(fixture.innocent.length).toBeGreaterThanOrEqual(100);
    const shorts = terms
      .filter((term) => term.match === "word")
      .map((term) => term.term.replace(/ /g, ""));
    for (const word of fixture.innocent) {
      expect(
        shorts.some((short) => word.toLowerCase().includes(short)),
        word,
      ).toBe(true);
      expect(isBlocked(word, list), word).toBe(false);
    }
  });

  it("AC-LNT-03 catches every listed term under each normalization", () => {
    const leet: Record<string, string> = {
      a: "4",
      e: "3",
      i: "1",
      o: "0",
      s: "$",
      t: "7",
      l: "|",
    };
    const marks: Record<string, string> = {
      a: "á",
      e: "é",
      i: "í",
      o: "ö",
      u: "ü",
      n: "ñ",
    };
    const each = (term: string, f: (c: string, i: number) => string) =>
      [...term].map((c, i) => (c === " " ? c : f(c, i))).join("");
    const normalizations: Record<string, (term: string) => string> = {
      case: (t) => t.toUpperCase(),
      mixedCase: (t) => each(t, (c, i) => (i % 2 ? c.toUpperCase() : c)),
      diacritics: (t) => each(t, (c) => marks[c] ?? c),
      swaps: (t) => each(t, (c) => leet[c] ?? c),
      repeats: (t) => each(t, (c) => c.repeat(3)),
      separators: (t) =>
        t
          .split(" ")
          .map((w) => [...w].join("."))
          .join(" "),
      spacedLetters: (t) =>
        t
          .split(" ")
          .map((w) => [...w].join(" "))
          .join("   "),
      hidden: (t) => [...t].join(char(0x200b)),
      plural: (t) => `${t}s`,
      trailingMarks: (t) => `${each(t, (c) => leet[c] ?? c)}!`,
      sentence: (t) => `Hello ${t} there`,
    };
    for (const [name, normalize] of Object.entries(normalizations)) {
      for (const { term } of terms) {
        expect(isBlocked(normalize(term), list), `${name}: ${term}`).toBe(true);
      }
    }
  });

  it("blocks nothing with an empty list, and checks each kind on its own", () => {
    const empty = createModerationList([], []);
    expect(empty.size).toBe(0);
    expect(isBlocked("hen zorblax", empty)).toBe(false);
    const words = createModerationList(["hen"], []);
    expect(isBlocked("hen", words)).toBe(true);
    expect(isBlocked("zorblax", words)).toBe(false);
    const substrings = createModerationList(["zorblax"], []);
    expect(isBlocked("XzorblaxX", substrings)).toBe(true);
    expect(isBlocked("hen", substrings)).toBe(false);
  });

  it("gives the same verdict before and after cleanText, as the server cleans first", () => {
    const tricky = [
      `h${char(0x0007)}en`,
      `h${char(0x202e)}en`,
      `he${char(0x2028)}n`,
      `zorb${char(0x00a0)}lax`,
      `  hen  `,
      `h${char(0xfeff)}e${char(0x200b)}n`,
      "Zorblaxton",
      `no${char(0x3000)}go`,
    ];
    for (const text of tricky) {
      expect(isBlocked(cleanText(text), list), text).toBe(
        isBlocked(text, list),
      );
    }
  });
});

describe("cleanText", () => {
  // The cases of supabase/tests/baseline/text.test.sql for private.clean_text.
  it("normalizes, strips controls and invisible characters, and collapses whitespace", () => {
    expect(cleanText(`  Cafe${char(0x0301)}  `)).toBe("Café");
    expect(cleanText("one\ttwo\nthree\r\nfour")).toBe("one two three four");
    expect(cleanText(`a${char(0x00a0)}${char(0x2003)}${char(0x3000)}b`)).toBe(
      "a b",
    );
    expect(cleanText(`be${char(0x0007)}ll`)).toBe("bell");
    expect(cleanText(`zero${char(0x200b)}width`)).toBe("zerowidth");
    expect(cleanText(`${char(0x202e)}evil${char(0x202c)} name`)).toBe(
      "evil name",
    );
    expect(cleanText(`${char(0xfeff)}bom`)).toBe("bom");
    const coder = `${char(0x1f469)}${char(0x200d)}${char(0x1f4bb)} coder`;
    expect(cleanText(coder)).toBe(coder);
    expect(cleanText("   ")).toBe("");
    expect(cleanText("Plucky Otter")).toBe("Plucky Otter");
  });

  it("treats a next-line character as a space and keeps other text as typed", () => {
    expect(cleanText(`a${char(0x0085)}b`)).toBe("a b");
    expect(cleanText("Dee 2")).toBe("Dee 2");
  });
});

describe("rot13", () => {
  it("turns ASCII letters 13 places and leaves the rest", () => {
    expect(rot13("Hello, World 42")).toBe("Uryyb, Jbeyq 42");
    expect(rot13(rot13("Zorblax é"))).toBe("Zorblax é");
  });
});
