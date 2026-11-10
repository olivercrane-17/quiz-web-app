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
  CLEAN_REMOVED,
  FILTER_LETTERS,
  FOLD_BASE,
  FOLD_FLIPS,
  FOLD_SWAPS,
  NEWER_COMPATIBILITY,
  PASSES,
  REMOVED_RANGES,
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
  passText,
  pluralSuffix,
  rot13,
  runsPattern,
  spacedPattern,
  termMatchOf,
  termPatterns,
  wordPattern,
  type ModerationTerm,
} from "./moderation.ts";

const char = (code: number) => String.fromCodePoint(code);
const terms = fixture.terms as ModerationTerm[];
const list = createModerationList(terms, fixture.allowlist);

const inRemoved = (code: number) =>
  REMOVED_RANGES.some(([first, last]) => code >= first && code <= last);
const newer = new Set(
  NEWER_COMPATIBILITY.flatMap(([first, last]) =>
    Array.from({ length: last - first + 1 }, (_, i) =>
      String.fromCodePoint(first + i),
    ),
  ),
);

describe("the folding table", () => {
  it("folds each character once, a single code point to one letter, or a digit for the newer outlined digits", () => {
    for (const table of [FOLD_BASE, FOLD_SWAPS, FOLD_FLIPS]) {
      const sources = table.map((entry) => entry.from);
      expect(new Set(sources).size).toBe(sources.length);
      for (const { from, to } of table) {
        expect([...from]).toHaveLength(1);
        expect(to).toHaveLength(1);
        expect(
          FILTER_LETTERS.includes(to) || (/[0-9]/.test(to) && newer.has(from)),
          `U+${(from.codePointAt(0) as number).toString(16)}`,
        ).toBe(true);
      }
    }
  });

  it("names no character that NFKD would change first, unless its NFKD image folds the same (the newer ones)", () => {
    const dead = FOLD_BASE.filter(({ from, to }) => {
      const image = from.normalize("NFKD");
      if (image === from) return false;
      return !(newer.has(from) && foldText(image) === to);
    });
    expect(dead).toEqual([]);
  });

  it("removes no character it names, and names no swap character", () => {
    expect(
      FOLD_BASE.filter((e) => inRemoved(e.from.codePointAt(0) as number)),
    ).toEqual([]);
    const base = new Set(FOLD_BASE.map((entry) => entry.from));
    expect(FOLD_SWAPS.every((entry) => !base.has(entry.from))).toBe(true);
    expect(new Set(FOLD_SWAPS.map((entry) => entry.from))).toEqual(
      new Set(SWAP_CHARACTERS),
    );
    expect(
      FOLD_FLIPS.every((entry) => SWAP_CHARACTERS.includes(entry.from)),
    ).toBe(true);
  });

  it("lowers every capital", () => {
    for (const letter of FILTER_LETTERS) {
      expect(foldText(letter.toUpperCase())).toBe(letter);
      expect(foldText(letter)).toBe(letter);
    }
  });
});

describe("the removals", () => {
  it("hold every combining mark and default-ignorable character the runtime knows, and the controls", () => {
    const missing: string[] = [];
    const hidden = /[\p{Default_Ignorable_Code_Point}\p{M}]/u;
    for (let code = 1; code <= 0x10ffff; code += 1) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const char = String.fromCodePoint(code);
      const control =
        (code < 0x20 || (code >= 0x7f && code <= 0x9f)) &&
        !(code >= 0x09 && code <= 0x0d) &&
        code !== 0x85;
      if ((control || hidden.test(char)) && !inRemoved(code)) {
        missing.push(code.toString(16));
      }
    }
    expect(missing).toEqual([]);
  });

  it("keep tab, line breaks and next line, which separate words", () => {
    for (const code of [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x20]) {
      expect(inRemoved(code)).toBe(false);
    }
  });

  it("cover everything clean_text removes, so cleaning first changes no verdict", () => {
    for (const [first, last] of CLEAN_REMOVED) {
      for (let code = first; code <= last; code += 1) {
        expect(inRemoved(code), code.toString(16)).toBe(true);
      }
    }
  });

  it("are ascending and apart", () => {
    REMOVED_RANGES.forEach(([first, last], index) => {
      expect(first).toBeLessThanOrEqual(last);
      if (index > 0) {
        expect(first).toBeGreaterThan(
          (REMOVED_RANGES[index - 1] as [number, number])[1] + 1,
        );
      }
    });
  });
});

describe("foldText", () => {
  it("folds case, marks, look-alike letters and NFKD forms", () => {
    expect(foldText("Crème BRÛLÉE")).toBe("creme brulee");
    expect(foldText("Øresund Łódź Straße")).toBe("oresund lodz strase");
    // Cyrillic a, e, o and Greek omicron that look like Latin ones.
    expect(foldText(`h${char(0x0435)}ll${char(0x043e)}`)).toBe("hello");
    expect(foldText(`${char(0x0391)}${char(0x03bf)}`)).toBe("ao");
    // Cyrillic pe, i, sha, ghe and Armenian oh, vo, seh, co.
    expect(
      foldText(
        [0x043f, 0x0438, 0x0448, 0x0433, 0x0585, 0x0578, 0x057d, 0x0581]
          .map(char)
          .join(""),
      ),
    ).toBe("nnwronug");
    // Fullwidth letters and a ligature, through NFKD.
    expect(foldText(`${char(0xff28)}${char(0xff49)} ${char(0xfb01)}ne`)).toBe(
      "hi fine",
    );
  });

  it("folds small capitals and the negative circled and squared letters, which NFKD leaves alone", () => {
    expect(foldText([0x029c, 0x1d07, 0x0274].map(char).join(""))).toBe("hen");
    expect(foldText([0x1f157, 0x1f154, 0x1f15d].map(char).join(""))).toBe(
      "hen",
    );
    expect(foldText([0x1f177, 0x1f174, 0x1f17d].map(char).join(""))).toBe(
      "hen",
    );
  });

  it("names the compatibility characters newer than the server's Unicode", () => {
    expect(foldText([0x1ccdd, 0x1ccda, 0x1cce3].map(char).join(""))).toBe(
      "hen",
    );
    expect(foldText(`${char(0x1ccf0)}${char(0x1ccf9)}`)).toBe("09");
    expect(foldText(char(0xa7f1))).toBe("s");
  });

  it("removes what nobody sees, so it never splits a word", () => {
    const hidden = [
      0x200b, 0x200d, 0x00ad, 0x2060, 0xfeff, 0x202e, 0x0007, 0xe0020, 0xe0061,
      0xe0100, 0x180b, 0x3164, 0x115f, 0xffa0, 0x17b4, 0x1d173, 0x1dc0, 0x1ab0,
      0x0483,
    ];
    for (const code of hidden) {
      expect(foldText(`ab${char(code)}cd`), code.toString(16)).toBe("abcd");
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
    expect(applySwaps("h3ll0 w0r1d! $|@7 8a9 6+", "swaps")).toBe(
      "hello woridi slat bag gt",
    );
  });

  it("turns trailing exclamation marks into separators in the bangs pass", () => {
    expect(applySwaps("r07! sh!t h3n!1", "bangs")).toBe("rot  shit henii");
  });

  it("turns every trailing swap character into a separator in the edges pass", () => {
    expect(applySwaps("h3n!1 b0b5 5ad", "edges")).toBe("hen  bob  sad");
  });

  it("turns every leading swap character into a separator in the leads pass, and both in trims", () => {
    expect(applySwaps("@n3wt x $$h3n", "leads")).toBe(" newt x  hen");
    expect(applySwaps("@n3wt! 1h3n1", "trims")).toBe(" newt   hen ");
  });

  it("turns only the text's first swap character, its last or both into separators in the starts, finishes and ends passes", () => {
    expect(applySwaps("@r071", "ends")).toBe(" rot ");
    expect(applySwaps("  @r07 x1  ", "ends")).toBe("   rot x   ");
    expect(applySwaps("@ x !", "ends")).toBe("a x i");
    expect(applySwaps("@0r8", "starts")).toBe(" orb");
    expect(applySwaps("0r81", "finishes")).toBe("orb ");
  });

  it("reads the i and l look-alikes the other way round in the flips pass, after a capital I became l", () => {
    expect(applySwaps("g1immer k|t s7a!", "flips")).toBe("glimmer kit stal");
    expect(passText("GIimmer", "flips")).toBe("Glimmer");
    expect(passText("GIimmer", "swaps")).toBe("GIimmer");
    expect(normalizeForFilter("quibbIer", "flips")).toEqual(["quibbler"]);
  });

  it("reads no swap in the plain pass", () => {
    expect(applySwaps("hen1 h3n", "plain")).toBe("hen1 h3n");
  });

  it("runs the passes in a fixed order", () => {
    expect(PASSES).toEqual([
      "swaps",
      "bangs",
      "edges",
      "leads",
      "trims",
      "starts",
      "finishes",
      "ends",
      "flips",
      "plain",
    ]);
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
    expect(normalizeForFilter("hen1", "ends")).toEqual(["hen"]);
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

  it("compiles letters run by run, with i and l standing for each other only in word terms", () => {
    expect(runsPattern("hen")).toBe("h+e+n+");
    expect(runsPattern("quibbler")).toBe("q+u+i+b{2,}l+e+r+");
    expect(runsPattern("quibbler", true)).toBe(
      "q+u+(?:i+|l+)b{2,}(?:i+|l+)e+r+",
    );
    expect(runsPattern("ill", true)).toBe("(?:i+|l+)[il]{2,}");
    expect(runsPattern("")).toBe("");
  });

  it("adds a plural: s, or es after s, x, z, h or o", () => {
    expect(pluralSuffix("hen")).toBe("(?:s+)?");
    expect(pluralSuffix("nogo")).toBe("(?:s+|e+s+)?");
    expect(pluralSuffix("box")).toBe("(?:s+|e+s+)?");
    expect(pluralSuffix("")).toBe("(?:s+)?");
  });

  it("spells a word term's words with an optional space between, and a substring term letter by letter", () => {
    expect(wordPattern(["no", "go"])).toBe("n+o+ ?g+o+(?:s+|e+s+)?");
    expect(spacedPattern("quibbler")).toBe(
      "q+ ?u+ ?i+ ?b+ ?b+ ?l+ ?e+ ?r+(?:s+)?",
    );
    expect(termPatterns("hen", "word")).toEqual({
      inside: null,
      whole: "h+e+n+(?:s+)?",
    });
    expect(termPatterns("bad wolf", "substring")).toEqual({
      inside: "b+a+d+w+o+l+f+",
      whole: "b+ ?a+ ?d+ ?w+ ?o+ ?l+ ?f+(?:s+)?",
    });
    expect(termPatterns("%%", "word")).toBeNull();
  });

  it("AC-LNT-03 compiles the fixture list to exactly the sources SQL builds", () => {
    const patterns = moderationPatterns(terms);
    expect(patterns.word).toBe(fixture.patterns.word);
    expect(patterns.substring).toBe(fixture.patterns.substring);
    expect(patterns.size).toBe(terms.length);
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
      b: "8",
      g: "9",
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
      tagCharacter: (t) => [...t].join(char(0xe0020)),
      leadingAt: (t) => `@${each(t, (c) => leet[c] ?? c)}1`,
      capitalI: (t) => t.replaceAll("l", "I"),
      negativeSquared: (t) =>
        each(t, (c) => char(0x1f170 + c.charCodeAt(0) - 0x61)),
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
      `h${char(0x2066)}e${char(0x0085)}n`,
      " @r071 ",
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
