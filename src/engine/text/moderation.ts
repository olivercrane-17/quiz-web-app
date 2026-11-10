/**
 * The slur filter (PRD §3.9.4, ARCHITECTURE §4.12, §8.13): one matcher that
 * the client runs for instant feedback and that SQL runs again as the
 * authority, `private.text_is_blocked`. Both must return the same verdict for
 * every text (AC-LNT-03), so this module is a short list of steps that
 * plpgsql repeats one for one, and its tables exist once:
 * scripts/codegen/moderation-sql.ts writes them into `private.fold_text`,
 * `private.moderation_swaps` and the other generated functions.
 *
 * How a text is read (`normalizeForFilter`), in ten passes (`PASSES`),
 * because a digit or symbol may stand for a letter or be just a digit or a
 * mark: "n3wt", "newt1", "@n3wt", "n3wt!", "new7!" and "@n3w71" each hide
 * the same word.
 *
 * 1. NFKD, which turns fullwidth, styled, circled and superscript letters
 *    and ligatures into plain ones and splits every mark from its letter.
 *    The flips pass first reads each capital I as l, since the two look
 *    alike in most fonts.
 * 2. Everything nobody sees is removed (`REMOVED_RANGES`): every combining
 *    mark and default-ignorable character (zero-width and tag characters,
 *    variation selectors, fillers) and the controls, so none of them can
 *    split a word.
 * 3. The folding table, one character at a time (`foldText`): case,
 *    letters with no decomposition (ø, ł, ß), look-alike letters from
 *    Cyrillic, Greek and Armenian, small capitals and the negative circled
 *    and squared letters that NFKD leaves alone.
 * 4. The swaps (`FOLD_SWAPS`): 0 reads as o, 1 ! and ¡ as i, | as l, 3 and
 *    € as e, 4 and @ as a, 5 and $ as s, 6 and 9 as g, 7 and + as t, 8 as
 *    b. The `swaps` pass reads every one as a letter. The `bangs` pass first
 *    turns the exclamation marks that end a word into separators ("new7!"
 *    reads "newt"); `edges` does that for every swap character that ends a
 *    word ("h3ns!1" reads "hens"), `leads` for every one that starts a word
 *    ("@n3wt" reads "newt") and `trims` for both. The `starts` pass turns
 *    only the text's first character into a separator when it is a swap
 *    character touching a word, `finishes` only its last, and `ends`
 *    both, so a letter written as a swap survives the decoration beside
 *    it ("@n3w7", "n3w71" and "@n3w71" read "newt"). The `flips` pass reads
 *    the i and l look-alikes the other way round (1 ! ¡ as l, | as i), and
 *    the `plain` pass reads no swap at all ("newt1" reads "newt").
 * 5. Everything that is not a to z separates words.
 * 6. A run of single letters joins into one word ("n e w t", "n.e.w.t").
 *
 * How a term matches (`moderationPatterns`, `isBlocked`), against the words
 * of each pass with one space between and around them:
 *
 * - Letter by letter, as runs: a term's run of k equal letters matches a
 *   run of k or more in the text, so "heeeen" still holds "hen" while a
 *   term's own double letter is never read as a single one.
 * - A term of 5 letters or fewer is a word term. It matches whole words
 *   only, so an innocent word that contains it never hits (the allowlist
 *   fixture of AC-LNT-03); a term of several words also matches with its
 *   words run together, and every word term matches a text whose words,
 *   all run together, are the term ("ne wt"). A run of i and a run of l
 *   stand for each other in a word term, and a double i or l may mix them
 *   ("lI").
 * - A longer term is a substring term. It matches inside any one word, or
 *   split across whole words ("she male" as two words), but never from
 *   inside one word into the next. Its letters are read as they are, so an
 *   innocent l never stands for its i.
 * - Either kind may end in a plural: s, or es after s, x, z, h or o.
 * - An allowlisted word is set aside before matching, and no match spans
 *   it.
 *
 * A list compiles to two regular expressions (`moderationPatterns`) whose
 * sources SQL builds the same way, character for character. Reading a text
 * never needs the list, and nothing here prints a term: callers show one
 * neutral message for every hit and log nothing about the text. Every step
 * gives the same verdict before and after `cleanText`, which the server
 * runs first, so the client may check what is typed while the server
 * checks what it stores.
 */

/** What a term matches: whole words, or inside a word too. */
export type TermMatch = "word" | "substring";

/** A listed term with how it matches (`termMatchOf` gives the default). */
export interface ModerationTerm {
  readonly term: string;
  readonly match: TermMatch;
}

/** The two expressions a list compiles to, as sources SQL builds identically. */
export interface ModerationPatterns {
  /** Word terms, as whole words; null without word terms. */
  readonly word: string | null;
  /** Substring terms, inside a word or as whole words; null without substring terms. */
  readonly substring: string | null;
}

/** A list ready to match: built once, then used for every text. */
export interface ModerationList {
  readonly word: RegExp | null;
  readonly substring: RegExp | null;
  /** Allowlisted words, as the filter reads them. */
  readonly allow: ReadonlySet<string>;
  /** How many terms the list holds. */
  readonly size: number;
}

/** One character of a table and the letter (or digit) it becomes. */
export interface FoldEntry {
  readonly from: string;
  readonly to: string;
}

/** How a pass reads digit and symbol swaps (step 4). */
export type FilterPass =
  | "swaps"
  | "bangs"
  | "edges"
  | "leads"
  | "trims"
  | "starts"
  | "finishes"
  | "ends"
  | "flips"
  | "plain";

/** Every text is read in these passes; a hit in any one blocks it. */
export const PASSES: readonly FilterPass[] = [
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
];

/** Terms of this many letters or fewer match whole words only (PRD §3.9.4). */
export const SHORT_TERM_LETTERS = 5;

/** The letters the filter reads, spelled out so no range or locale can widen them. */
export const FILTER_LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Digits and symbols that can stand for a letter (step 4), by that letter. */
const SWAP_PAIRS: readonly (readonly [string, string])[] = [
  ["a", "4@"],
  ["b", "8"],
  ["e", "3€"],
  ["g", "69"],
  ["i", "1!¡"],
  ["l", "|"],
  ["o", "0"],
  ["s", "5$"],
  ["t", "7+"],
];

/** The flips pass reads the i and l look-alikes the other way round. */
const FLIP_PAIRS: readonly (readonly [string, string])[] = [
  ["l", "1!¡"],
  ["i", "|"],
];

/** The characters a swap can read as a letter (step 4). */
export const SWAP_CHARACTERS = SWAP_PAIRS.map(([, from]) => from).join("");

/** What the flips pass reads before folding: a capital I as l. */
export const FLIP_CAPITAL: FoldEntry = { from: "I", to: "l" };

/** A plural may be es after these letters, and s after any. */
export const PLURAL_ES_AFTER = "sxzho";

const NOT_LETTERS = new RegExp(`[^${FILTER_LETTERS}]+`, "g");
/** A letter or a swap character: what a word is made of before the swaps. */
const IN_WORD = `[${FILTER_LETTERS}${SWAP_CHARACTERS}]`;
/** The `bangs` pass: exclamation marks that end a run of letters and swaps. */
export const TRAILING_BANGS = `!+(?!${IN_WORD})`;
/** The `edges` pass: swap characters that end a run of letters and swaps. */
export const TRAILING_SWAPS = `[${SWAP_CHARACTERS}]+(?!${IN_WORD})`;
/** The `leads` pass: swap characters that start a run of letters and swaps. */
export const LEADING_SWAPS = `(?<!${IN_WORD})[${SWAP_CHARACTERS}]+`;
/** Anything but a letter or a swap character. */
const OUT_OF_WORD = `[^${FILTER_LETTERS}${SWAP_CHARACTERS}]`;
/**
 * The `starts` and `ends` passes: the text's first letter or swap
 * character, when it is a swap touching a word, with what comes before it
 * kept as group 1.
 */
export const FIRST_SWAP = `^(${OUT_OF_WORD}*)[${SWAP_CHARACTERS}](?=${IN_WORD})`;
/** The `finishes` and `ends` passes: the text's last letter or swap character, likewise. */
export const LAST_SWAP = `(?<=${IN_WORD})[${SWAP_CHARACTERS}](${OUT_OF_WORD}*)$`;

/** One step of a separating pass: a pattern, and what replaces each match. */
export interface PassSeparator {
  readonly source: string;
  /** A space; or group 1 kept before ("before") or after ("after") it. */
  readonly keep: "" | "before" | "after";
}

/**
 * What each separating pass turns into spaces before the swaps, in order:
 * `trims` takes the leading runs, then the trailing ones; `ends` the first
 * character, then the last. A replacement keeps the pattern's group 1.
 */
export const PASS_SEPARATORS: Readonly<
  Record<
    "bangs" | "edges" | "leads" | "trims" | "starts" | "finishes" | "ends",
    readonly PassSeparator[]
  >
> = {
  bangs: [{ source: TRAILING_BANGS, keep: "" }],
  edges: [{ source: TRAILING_SWAPS, keep: "" }],
  leads: [{ source: LEADING_SWAPS, keep: "" }],
  trims: [
    { source: LEADING_SWAPS, keep: "" },
    { source: TRAILING_SWAPS, keep: "" },
  ],
  starts: [{ source: FIRST_SWAP, keep: "before" }],
  finishes: [{ source: LAST_SWAP, keep: "after" }],
  ends: [
    { source: FIRST_SWAP, keep: "before" },
    { source: LAST_SWAP, keep: "after" },
  ],
};
type SeparatingPass = keyof typeof PASS_SEPARATORS;
const SEPARATORS = new Map<
  FilterPass,
  readonly { pattern: RegExp; replacement: string }[]
>(
  (Object.keys(PASS_SEPARATORS) as SeparatingPass[]).map((pass) => [
    pass,
    PASS_SEPARATORS[pass].map(({ source, keep }) => ({
      pattern: new RegExp(source, "g"),
      replacement: keep === "before" ? "$1 " : keep === "after" ? " $1" : " ",
    })),
  ]),
);

/**
 * Latin letters with no decomposition, by the letter they read as. Every
 * letter with a mark that NFKD splits off (é, ñ, ǻ) needs no row: the mark
 * goes in step 2.
 */
const LATIN: readonly (readonly [string, string])[] = [
  ["a", "æÆɑ"],
  ["b", "ƀɓƁ"],
  ["c", "ƈƇȼȻ"],
  ["d", "đĐðÐɗƊɖƉȡ"],
  ["e", "ɇɆɛƐ"],
  ["f", "ƒƑ"],
  ["g", "ǥǤɠƓɡ"],
  ["h", "ħĦ"],
  ["i", "ıɨƗɩƖ"],
  ["j", "ɉɈȷ"],
  ["k", "ƙƘĸ"],
  ["l", "łŁƚȽɫⱢȴɬɭ"],
  ["m", "ɱ"],
  ["n", "ŋŊɲƝƞȠȵ"],
  ["o", "øØœŒɵƟ"],
  ["p", "ƥƤ"],
  ["q", "ɋɊ"],
  ["r", "ɍɌɽ"],
  ["s", "ßẞʂȿ"],
  ["t", "ŧŦƭƬʈƮȶþÞ"],
  ["u", "ʉɄ"],
  ["v", "ʋƲ"],
  ["y", "ɏɎƴƳ"],
  ["z", "ƶƵȥȤʐʑɀ"],
];

/**
 * Letters from Cyrillic, Greek and Armenian that look like Latin ones on
 * screen, as code points, since in source they would look like the Latin
 * letters too. Accented forms need no row: NFKD splits their marks off.
 */
const LOOKALIKES: readonly (readonly [string, readonly number[]])[] = [
  ["a", [0x0430, 0x0410, 0x03b1, 0x0391]],
  ["b", [0x0432, 0x0412, 0x044c, 0x042c, 0x03b2, 0x0392]],
  // NFKD turns the lunate sigma (which looks like c) into the final sigma.
  ["c", [0x0441, 0x0421, 0x03c2]],
  ["d", [0x0501, 0x0500]],
  ["e", [0x0435, 0x0415, 0x0454, 0x0404, 0x03b5, 0x0395]],
  ["g", [0x0581]],
  ["h", [0x04bb, 0x04ba, 0x043d, 0x041d, 0x0397]],
  ["i", [0x0456, 0x0406, 0x04c0, 0x04cf, 0x03b9, 0x0399]],
  ["j", [0x0458, 0x0408, 0x03f3]],
  ["k", [0x043a, 0x041a, 0x03ba, 0x039a]],
  ["m", [0x043c, 0x041c, 0x039c]],
  ["n", [0x039d, 0x03b7, 0x043f, 0x0438, 0x0418, 0x0578]],
  ["o", [0x043e, 0x041e, 0x03bf, 0x039f, 0x0585]],
  ["p", [0x0440, 0x0420, 0x03c1, 0x03a1]],
  ["q", [0x051b, 0x051a]],
  ["r", [0x0433]],
  ["s", [0x0455, 0x0405]],
  ["t", [0x0442, 0x0422, 0x03c4, 0x03a4]],
  ["u", [0x03c5, 0x057d]],
  ["v", [0x03bd, 0x0475, 0x0474]],
  ["w", [0x051d, 0x051c, 0x03c9, 0x0448, 0x0428]],
  ["x", [0x0445, 0x0425, 0x03c7, 0x03a7]],
  ["y", [0x0443, 0x0423, 0x04af, 0x04ae, 0x03b3, 0x03a5]],
  ["z", [0x0396]],
];

/**
 * Small capitals, which nickname generators use and NFKD leaves alone, by
 * letter (x has none).
 */
const SMALL_CAPITALS: readonly (readonly [string, number])[] = [
  ["a", 0x1d00],
  ["b", 0x0299],
  ["c", 0x1d04],
  ["d", 0x1d05],
  ["e", 0x1d07],
  ["f", 0xa730],
  ["g", 0x0262],
  ["h", 0x029c],
  ["i", 0x026a],
  ["j", 0x1d0a],
  ["k", 0x1d0b],
  ["l", 0x029f],
  ["m", 0x1d0d],
  ["n", 0x0274],
  ["o", 0x1d0f],
  ["p", 0x1d18],
  ["q", 0xa7af],
  ["r", 0x0280],
  ["s", 0xa731],
  ["t", 0x1d1b],
  ["u", 0x1d1c],
  ["v", 0x1d20],
  ["w", 0x1d21],
  ["y", 0x028f],
  ["z", 0x1d22],
];

/**
 * Runs of code points that read as consecutive letters or digits from the
 * first one given: the negative circled and negative squared capitals,
 * which NFKD leaves alone, and the compatibility characters newer than the
 * server's Unicode (`NEWER_COMPATIBILITY`).
 */
const ALPHABETS: readonly (readonly [number, number, string])[] = [
  [0x1f150, 0x1f169, "a"],
  [0x1f170, 0x1f189, "a"],
];

/**
 * Compatibility characters that the runtime's NFKD folds but the server's
 * does not: PostgreSQL 17's normalize() follows Unicode 15.1, while Node 22
 * and current browsers follow 16 or 17. The table names each one outright
 * (as [first, last, first target]), so both sides read the same letter or
 * digit: U+A7F1 MODIFIER LETTER CAPITAL S, the outlined capitals A to Z and
 * the outlined digits 0 to 9 (Unicode 16, 17). scripts/codegen/moderation-sql.ts
 * fails when the runtime folds a newer one.
 */
export const NEWER_COMPATIBILITY: readonly (readonly [
  number,
  number,
  string,
])[] = [
  [0xa7f1, 0xa7f1, "s"],
  [0x1ccd6, 0x1ccef, "a"],
  [0x1ccf0, 0x1ccf9, "0"],
];

/**
 * Step 2, frozen from /[\p{Default_Ignorable_Code_Point}\p{M}]/u under
 * Unicode 17 plus the C0 and C1 controls (but not tab, line breaks or next
 * line, which separate): hex code points and ranges. It covers everything
 * `private.clean_text` removes, so the verdict is the same before and after
 * cleaning. The tests fail when the runtime knows a mark or an ignorable
 * character it lacks; add it here and in a new migration's block.
 */
const REMOVED_SOURCE = [
  "0001-0008 000E-001F 007F-0084 0086-009F 00AD 0300-036F 0483-0489",
  "0591-05BD 05BF 05C1-05C2 05C4-05C5 05C7 0610-061A 061C 064B-065F 0670",
  "06D6-06DC 06DF-06E4 06E7-06E8 06EA-06ED 0711 0730-074A 07A6-07B0",
  "07EB-07F3 07FD 0816-0819 081B-0823 0825-0827 0829-082D 0859-085B",
  "0897-089F 08CA-08E1 08E3-0903 093A-093C 093E-094F 0951-0957 0962-0963",
  "0981-0983 09BC 09BE-09C4 09C7-09C8 09CB-09CD 09D7 09E2-09E3 09FE",
  "0A01-0A03 0A3C 0A3E-0A42 0A47-0A48 0A4B-0A4D 0A51 0A70-0A71 0A75",
  "0A81-0A83 0ABC 0ABE-0AC5 0AC7-0AC9 0ACB-0ACD 0AE2-0AE3 0AFA-0AFF",
  "0B01-0B03 0B3C 0B3E-0B44 0B47-0B48 0B4B-0B4D 0B55-0B57 0B62-0B63 0B82",
  "0BBE-0BC2 0BC6-0BC8 0BCA-0BCD 0BD7 0C00-0C04 0C3C 0C3E-0C44 0C46-0C48",
  "0C4A-0C4D 0C55-0C56 0C62-0C63 0C81-0C83 0CBC 0CBE-0CC4 0CC6-0CC8",
  "0CCA-0CCD 0CD5-0CD6 0CE2-0CE3 0CF3 0D00-0D03 0D3B-0D3C 0D3E-0D44",
  "0D46-0D48 0D4A-0D4D 0D57 0D62-0D63 0D81-0D83 0DCA 0DCF-0DD4 0DD6",
  "0DD8-0DDF 0DF2-0DF3 0E31 0E34-0E3A 0E47-0E4E 0EB1 0EB4-0EBC 0EC8-0ECE",
  "0F18-0F19 0F35 0F37 0F39 0F3E-0F3F 0F71-0F84 0F86-0F87 0F8D-0F97",
  "0F99-0FBC 0FC6 102B-103E 1056-1059 105E-1060 1062-1064 1067-106D",
  "1071-1074 1082-108D 108F 109A-109D 115F-1160 135D-135F 1712-1715",
  "1732-1734 1752-1753 1772-1773 17B4-17D3 17DD 180B-180F 1885-1886 18A9",
  "1920-192B 1930-193B 1A17-1A1B 1A55-1A5E 1A60-1A7C 1A7F 1AB0-1ADD",
  "1AE0-1AEB 1B00-1B04 1B34-1B44 1B6B-1B73 1B80-1B82 1BA1-1BAD 1BE6-1BF3",
  "1C24-1C37 1CD0-1CD2 1CD4-1CE8 1CED 1CF4 1CF7-1CF9 1DC0-1DFF 200B-200F",
  "202A-202E 2060-206F 20D0-20F0 2CEF-2CF1 2D7F 2DE0-2DFF 302A-302F",
  "3099-309A 3164 A66F-A672 A674-A67D A69E-A69F A6F0-A6F1 A802 A806 A80B",
  "A823-A827 A82C A880-A881 A8B4-A8C5 A8E0-A8F1 A8FF A926-A92D A947-A953",
  "A980-A983 A9B3-A9C0 A9E5 AA29-AA36 AA43 AA4C-AA4D AA7B-AA7D AAB0",
  "AAB2-AAB4 AAB7-AAB8 AABE-AABF AAC1 AAEB-AAEF AAF5-AAF6 ABE3-ABEA",
  "ABEC-ABED FB1E FE00-FE0F FE20-FE2F FEFF FFA0 FFF0-FFF8 101FD 102E0",
  "10376-1037A 10A01-10A03 10A05-10A06 10A0C-10A0F 10A38-10A3A 10A3F",
  "10AE5-10AE6 10D24-10D27 10D69-10D6D 10EAB-10EAC 10EFA-10EFF",
  "10F46-10F50 10F82-10F85 11000-11002 11038-11046 11070 11073-11074",
  "1107F-11082 110B0-110BA 110C2 11100-11102 11127-11134 11145-11146",
  "11173 11180-11182 111B3-111C0 111C9-111CC 111CE-111CF 1122C-11237",
  "1123E 11241 112DF-112EA 11300-11303 1133B-1133C 1133E-11344",
  "11347-11348 1134B-1134D 11357 11362-11363 11366-1136C 11370-11374",
  "113B8-113C0 113C2 113C5 113C7-113CA 113CC-113D0 113D2 113E1-113E2",
  "11435-11446 1145E 114B0-114C3 115AF-115B5 115B8-115C0 115DC-115DD",
  "11630-11640 116AB-116B7 1171D-1172B 1182C-1183A 11930-11935",
  "11937-11938 1193B-1193E 11940 11942-11943 119D1-119D7 119DA-119E0",
  "119E4 11A01-11A0A 11A33-11A39 11A3B-11A3E 11A47 11A51-11A5B",
  "11A8A-11A99 11B60-11B67 11C2F-11C36 11C38-11C3F 11C92-11CA7",
  "11CA9-11CB6 11D31-11D36 11D3A 11D3C-11D3D 11D3F-11D45 11D47",
  "11D8A-11D8E 11D90-11D91 11D93-11D97 11EF3-11EF6 11F00-11F01 11F03",
  "11F34-11F3A 11F3E-11F42 11F5A 13440 13447-13455 1611E-1612F",
  "16AF0-16AF4 16B30-16B36 16F4F 16F51-16F87 16F8F-16F92 16FE4",
  "16FF0-16FF1 1BC9D-1BC9E 1BCA0-1BCA3 1CF00-1CF2D 1CF30-1CF46",
  "1D165-1D169 1D16D-1D182 1D185-1D18B 1D1AA-1D1AD 1D242-1D244",
  "1DA00-1DA36 1DA3B-1DA6C 1DA75 1DA84 1DA9B-1DA9F 1DAA1-1DAAF",
  "1E000-1E006 1E008-1E018 1E01B-1E021 1E023-1E024 1E026-1E02A 1E08F",
  "1E130-1E136 1E2AE 1E2EC-1E2EF 1E4EC-1E4EF 1E5EE-1E5EF 1E6E3 1E6E6",
  "1E6EE-1E6EF 1E6F5 1E8D0-1E8D6 1E944-1E94A E0000-E0FFF",
].join(" ");

/** Step 2's code points as [first, last] ranges, ascending. */
export const REMOVED_RANGES: readonly (readonly [number, number])[] =
  REMOVED_SOURCE.split(" ").map((item) => {
    const [first, last = first] = item.split("-") as [string, string?];
    return [parseInt(first, 16), parseInt(last, 16)] as const;
  });

const REMOVED = new RegExp(
  `[${REMOVED_RANGES.map(([first, last]) =>
    first === last
      ? `\\u{${first.toString(16)}}`
      : `\\u{${first.toString(16)}}-\\u{${last.toString(16)}}`,
  ).join("")}]`,
  "gu",
);

function range(first: number, last: number): number[] {
  const out: number[] = [];
  for (let code = first; code <= last; code += 1) out.push(code);
  return out;
}

function alphabet(first: number, last: number, target: string): FoldEntry[] {
  const base = target.charCodeAt(0);
  return range(first, last).map((code) => ({
    from: String.fromCodePoint(code),
    to: String.fromCharCode(base + code - first),
  }));
}

function buildBase(): FoldEntry[] {
  const entries: FoldEntry[] = [];
  for (const upper of FILTER_LETTERS.toUpperCase()) {
    entries.push({ from: upper, to: upper.toLowerCase() });
  }
  for (const [to, sources] of LATIN) {
    for (const from of sources) entries.push({ from, to });
  }
  for (const [to, codes] of LOOKALIKES) {
    for (const code of codes) {
      entries.push({ from: String.fromCodePoint(code), to });
    }
  }
  for (const [to, code] of SMALL_CAPITALS) {
    entries.push({ from: String.fromCodePoint(code), to });
  }
  for (const [first, last, target] of [...ALPHABETS, ...NEWER_COMPATIBILITY]) {
    entries.push(...alphabet(first, last, target));
  }
  return entries;
}

function buildPairs(
  pairs: readonly (readonly [string, string])[],
): FoldEntry[] {
  const entries: FoldEntry[] = [];
  for (const [to, sources] of pairs) {
    for (const from of sources) entries.push({ from, to });
  }
  return entries;
}

/**
 * The folding table (step 3), applied after NFKD and the removals. SQL's
 * fold_text holds the same entries. A target is a letter, or a digit for
 * the newer outlined digits, which the swaps then read.
 */
export const FOLD_BASE: readonly FoldEntry[] = buildBase();

/** The swaps (step 4). No swap character is in FOLD_BASE. */
export const FOLD_SWAPS: readonly FoldEntry[] = buildPairs(SWAP_PAIRS);

/** The flips pass's readings, applied before the other swaps. */
export const FOLD_FLIPS: readonly FoldEntry[] = buildPairs(FLIP_PAIRS);

// Each character folds once: the tests hold every table to that, as
// translate() would silently keep only the first of two entries.
const BASE_MAP = new Map(FOLD_BASE.map(({ from, to }) => [from, to]));
const SWAP_MAP = new Map(FOLD_SWAPS.map(({ from, to }) => [from, to]));
const FLIP_MAP = new Map(FOLD_FLIPS.map(({ from, to }) => [from, to]));

function translateWith(text: string, map: ReadonlyMap<string, string>): string {
  let out = "";
  for (const char of text) out += map.get(char) ?? char;
  return out;
}

/**
 * Steps 1 to 3 (`private.fold_text`): NFKD, the removals, then the folding
 * table, one code point at a time. Characters the table doesn't name are
 * kept, and read as separators later.
 */
export function foldText(text: string): string {
  return translateWith(text.normalize("NFKD").replace(REMOVED, ""), BASE_MAP);
}

/**
 * What a pass folds (`private.moderation_pass_text`): the text itself, or
 * for the flips pass the text with each capital I read as l.
 */
export function passText(text: string, pass: FilterPass): string {
  return pass === "flips"
    ? text.replaceAll(FLIP_CAPITAL.from, FLIP_CAPITAL.to)
    : text;
}

/** Step 4 for one pass, on folded text (`private.moderation_swaps`). */
export function applySwaps(folded: string, pass: FilterPass): string {
  if (pass === "plain") return folded;
  if (pass === "flips") {
    return translateWith(translateWith(folded, FLIP_MAP), SWAP_MAP);
  }
  let kept = folded;
  for (const { pattern, replacement } of SEPARATORS.get(pass) ?? []) {
    kept = kept.replace(pattern, replacement);
  }
  return translateWith(kept, SWAP_MAP);
}

/**
 * Steps 5 and 6 on swapped text (`private.moderation_split`): the words of
 * a to z, with each run of single letters joined into one word.
 */
export function splitWords(swapped: string): string[] {
  const spaced = swapped.replace(NOT_LETTERS, " ").trim();
  if (spaced === "") return [];
  const words: string[] = [];
  let run = "";
  for (const word of spaced.split(" ")) {
    if (word.length === 1) {
      run += word;
      continue;
    }
    if (run !== "") {
      words.push(run);
      run = "";
    }
    words.push(word);
  }
  if (run !== "") words.push(run);
  return words;
}

/**
 * The words the filter reads in a text in one pass (steps 1 to 6), in
 * order (`private.moderation_words`). An empty array for a text with no
 * letters.
 */
export function normalizeForFilter(
  text: string,
  pass: FilterPass = "swaps",
): string[] {
  return splitWords(applySwaps(foldText(passText(text, pass)), pass));
}

/** A term's letters as the filter reads them, its words run together. */
export function termLetters(term: string): string {
  return normalizeForFilter(term, "swaps").join("");
}

/** How a term matches by default: by its letters once folded (PRD §3.9.4). */
export function termMatchOf(term: string): TermMatch {
  return termLetters(term).length <= SHORT_TERM_LETTERS ? "word" : "substring";
}

/** A term's runs of equal letters, in order. */
function runsOf(letters: string): { letter: string; count: number }[] {
  const runs: { letter: string; count: number }[] = [];
  let at = 0;
  while (at < letters.length) {
    const letter = letters.charAt(at);
    let count = 1;
    while (letters.charAt(at + count) === letter) count += 1;
    runs.push({ letter, count });
    at += count;
  }
  return runs;
}

/** At least `count` of the letter before it. */
function bound(count: number): string {
  return count === 1 ? "+" : `{${count},}`;
}

/** What a term may add (`private.moderation_plural`): s, or es after s, x, z, h or o. */
export function pluralSuffix(letters: string): string {
  const last = letters.charAt(letters.length - 1);
  return last !== "" && PLURAL_ES_AFTER.includes(last)
    ? "(?:s+|e+s+)?"
    : "(?:s+)?";
}

/**
 * A string of letters run by run (`private.moderation_runs`): each run of
 * k equal letters wants k or more. With `lookalike` (word terms) a lone i
 * or l reads as a run of either, and a run of k i's or l's as k or more of
 * both mixed ("lI"); without it (substring terms) every letter reads as
 * itself.
 */
export function runsPattern(letters: string, lookalike = false): string {
  return runsOf(letters)
    .map(({ letter, count }) => {
      if (lookalike && (letter === "i" || letter === "l")) {
        return count === 1 ? "(?:i+|l+)" : `[il]${bound(count)}`;
      }
      return `${letter}${bound(count)}`;
    })
    .join("");
}

/**
 * A word term as whole words (`private.moderation_list`), between the
 * spaces the caller adds: each of its words run by run with lookalikes,
 * an optional space between them, then the plural.
 */
export function wordPattern(words: readonly string[]): string {
  return `${words.map((word) => runsPattern(word, true)).join(" ?")}${pluralSuffix(words.join(""))}`;
}

/**
 * A substring term split across whole words (`private.moderation_spaced`),
 * between the spaces the caller adds: one unit per letter with an optional
 * space between units, then the plural. So a match across separators
 * starts at a word's first letter and ends at a word's last.
 */
export function spacedPattern(letters: string): string {
  const units: string[] = [];
  for (const { letter, count } of runsOf(letters)) {
    for (let k = 0; k < count; k += 1) units.push(`${letter}+`);
  }
  return `${units.join(" ?")}${pluralSuffix(letters)}`;
}

/**
 * The alternatives a term adds to its list's expressions: `whole` (as
 * whole words) for both kinds, `inside` (within one word) for substring
 * terms. Null for a term with no letters.
 */
export function termPatterns(
  term: string,
  match: TermMatch,
): { inside: string | null; whole: string } | null {
  const words = normalizeForFilter(term, "swaps");
  const letters = words.join("");
  if (letters === "") return null;
  return match === "word"
    ? { inside: null, whole: wordPattern(words) }
    : { inside: runsPattern(letters), whole: spacedPattern(letters) };
}

/** Byte order, as SQL's `collate "C"` sorts ASCII. */
function byCode(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The two expression sources for a list (`private.moderation_list`), to
 * test against a pass's words with one space between and around them. A
 * bare string takes `termMatchOf`'s match; a term with no letters adds
 * nothing.
 */
export function moderationPatterns(
  terms: readonly (string | ModerationTerm)[],
): ModerationPatterns & { size: number } {
  const word = new Set<string>();
  const inside = new Set<string>();
  const whole = new Set<string>();
  let size = 0;
  for (const entry of terms) {
    const term = typeof entry === "string" ? entry : entry.term;
    const match = typeof entry === "string" ? termMatchOf(entry) : entry.match;
    const patterns = termPatterns(term, match);
    if (patterns === null) continue;
    size += 1;
    if (patterns.inside === null) word.add(patterns.whole);
    else {
      inside.add(patterns.inside);
      whole.add(patterns.whole);
    }
  }
  const any = (set: Set<string>) => [...set].sort(byCode).join("|");
  return {
    word: word.size === 0 ? null : ` (?:${any(word)}) `,
    substring:
      inside.size === 0 ? null : `(?:${any(inside)})|(?: (?:${any(whole)}) )`,
    size,
  };
}

/** The allowlisted words as the filter reads them; an entry counts only when it reads as one word. */
export function allowedWords(allowlist: readonly string[]): string[] {
  const allow = new Set<string>();
  for (const entry of allowlist) {
    const words = normalizeForFilter(entry, "swaps");
    if (words.length === 1) allow.add(words[0] as string);
  }
  return [...allow].sort(byCode);
}

/** A list ready to match. */
export function createModerationList(
  terms: readonly (string | ModerationTerm)[],
  allowlist: readonly string[],
): ModerationList {
  const patterns = moderationPatterns(terms);
  return {
    word: patterns.word === null ? null : new RegExp(patterns.word),
    substring:
      patterns.substring === null ? null : new RegExp(patterns.substring),
    allow: new Set(allowedWords(allowlist)),
    size: patterns.size,
  };
}

/**
 * True when the text holds a listed term, in any pass. The same verdict as
 * `private.text_blocked_by` for the same list (AC-LNT-03). Each pass's
 * words are tested with one space between and around them, an allowlisted
 * word standing as a | that no match can span; word terms are tested
 * again against all the words run together, so a text that is only a
 * split word term ("ne wt") hits while "pi keys" in a sentence does not
 * become one word.
 */
export function isBlocked(text: string, list: ModerationList): boolean {
  if (list.word === null && list.substring === null) return false;
  const folded = foldText(text);
  const flipped = text.includes(FLIP_CAPITAL.from)
    ? foldText(passText(text, "flips"))
    : folded;
  for (const pass of PASSES) {
    const words = splitWords(
      applySwaps(pass === "flips" ? flipped : folded, pass),
    );
    if (words.length === 0) continue;
    const marked = words.map((word) => (list.allow.has(word) ? "|" : word));
    if (list.word !== null) {
      if (list.word.test(` ${marked.join(" ")} `)) return true;
      if (marked.length > 1 && list.word.test(` ${marked.join("")} `)) {
        return true;
      }
    }
    if (list.substring?.test(` ${marked.join(" ")} `) === true) return true;
  }
  return false;
}

/** What `private.clean_text` removes: controls and invisible characters (emoji joiners stay). */
export const CLEAN_REMOVED: readonly (readonly [number, number])[] = [
  [0x0001, 0x0008],
  [0x000e, 0x001f],
  [0x007f, 0x0084],
  [0x0086, 0x009f],
  [0x200b, 0x200b],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2060],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

/** What `private.clean_text` collapses to one space. */
const CLEAN_SPACES: readonly (readonly [number, number])[] = [
  [0x0009, 0x000d],
  [0x0020, 0x0020],
  [0x0085, 0x0085],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
];

function inRanges(
  code: number,
  ranges: readonly (readonly [number, number])[],
): boolean {
  return ranges.some(([first, last]) => code >= first && code <= last);
}

/**
 * `private.clean_text` (§8.4), which every text RPC runs before it
 * validates: NFC, controls and invisible characters removed, whitespace
 * collapsed to one space, trimmed. So a field can count and show what the
 * server will store.
 */
export function cleanText(text: string): string {
  let out = "";
  let space = false;
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0) as number;
    if (inRanges(code, CLEAN_REMOVED)) continue;
    if (inRanges(code, CLEAN_SPACES)) {
      space = true;
      continue;
    }
    if (space && out !== "") out += " ";
    space = false;
    out += char;
  }
  return out;
}

/** ROT13 on ASCII letters, everything else unchanged: the term lists are kept this way on disk. */
export function rot13(text: string): string {
  return text.replace(/[a-z]/gi, (letter) => {
    const base = letter <= "Z" ? 65 : 97;
    return String.fromCharCode(
      ((letter.charCodeAt(0) - base + 13) % 26) + base,
    );
  });
}
