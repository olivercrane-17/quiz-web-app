/**
 * The slur filter (PRD §3.9.4, ARCHITECTURE §4.12, §8.13): one matcher that
 * the client runs for instant feedback and that SQL runs again as the
 * authority, `private.text_is_blocked`. Both must return the same verdict for
 * every text (AC-LNT-03), so this module is a short list of steps that
 * plpgsql repeats one for one, and its folding table exists once:
 * scripts/codegen/moderation-sql.ts writes it into `private.fold_text` and
 * `private.moderation_words` as translate() maps.
 *
 * How a text is read (`normalizeForFilter`), in four passes (`PASSES`),
 * because a digit or symbol may stand for a letter or be just a digit or a
 * mark: "s1ur", "slur1", "s1ur!" and "slu7!" each hide the same word.
 *
 * 1. NFKC, which turns fullwidth, styled, circled and superscript letters
 *    and ligatures into plain ones.
 * 2. The folding table, one character at a time (`foldText`): case, marks,
 *    look-alike letters from Cyrillic and Greek, and characters nobody sees
 *    (zero-width spaces, soft hyphens, combining marks, controls) removed.
 * 3. The swaps (`FOLD_SWAPS`): 0 reads as o, 1 ! and ¡ as i, | as l, 3 and
 *    € as e, 4 and @ as a, 5 and $ as s, 7 as t. The `swaps` pass reads
 *    every one as a letter; the `bangs` pass first turns the exclamation
 *    marks that end a word into separators ("slu7!" reads "slut"); the
 *    `edges` pass does that for every swap character that ends a word
 *    ("h3ns!1" reads "hens"); the `plain` pass reads none ("slur1" reads
 *    "slur").
 * 4. Everything that is not a to z separates words.
 * 5. A run of single letters joins into one word ("s l u r", "s.l.u.r").
 *
 * How a term matches (`createModerationList`, `isBlocked`):
 *
 * - Letter by letter, as runs: a term's run of k equal letters matches a
 *   run of k or more in the text, so "heeeen" still holds "hen" while a
 *   term's own double letter is never read as a single one. A run of i and
 *   a run of l stand for each other, since 1, I, l and | look alike.
 * - A term of 5 letters or fewer is a word term. It matches whole words
 *   only, plus a plural s or es, so an innocent word that contains it never
 *   hits (the allowlist fixture of AC-LNT-03). A term of several words also
 *   matches with its words run together.
 * - A longer term is a substring term. It matches anywhere once separators
 *   are removed, inside words and across them.
 * - An allowlisted word (an innocent word that holds a substring term) is
 *   set aside before matching, and no match spans it.
 *
 * A list compiles to two regular expressions (`moderationPatterns`) whose
 * sources SQL builds the same way, character for character. Reading a text
 * never needs the list, and nothing here prints a term: callers show one
 * neutral message for every hit and log nothing about the text. Every step
 * gives the same verdict before and after `cleanText`, which the server
 * runs first, so the client may check what is typed while the server
 * checks what it stores.
 */

/** What a term matches: whole words, or anywhere once separators go. */
export type TermMatch = "word" | "substring";

/** A listed term with how it matches (`termMatchOf` gives the default). */
export interface ModerationTerm {
  readonly term: string;
  readonly match: TermMatch;
}

/** The two expressions a list compiles to, as sources SQL builds identically. */
export interface ModerationPatterns {
  /** Word terms, between spaces, with the plural forms; null without word terms. */
  readonly word: string | null;
  /** Substring terms; null without substring terms. */
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

/** One character of the folding table and what it becomes ("" removes it). */
export interface FoldEntry {
  readonly from: string;
  readonly to: string;
}

/** How a pass reads digit and symbol swaps (step 3). */
export type FilterPass = "swaps" | "bangs" | "edges" | "plain";

/** Every text is read in these passes; a hit in any one blocks it. */
export const PASSES: readonly FilterPass[] = [
  "swaps",
  "bangs",
  "edges",
  "plain",
];

/** Terms of this many letters or fewer match whole words only (PRD §3.9.4). */
export const SHORT_TERM_LETTERS = 5;

/** The letters the filter reads, spelled out so no range or locale can widen them. */
export const FILTER_LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** The characters a swap can read as a letter (step 3). */
export const SWAP_CHARACTERS = "4@3€1!|¡05$7";

/** What a word term may add: a plural s or es. */
export const PLURAL_SUFFIX = "(?:s+|e+s+)?";

const NOT_LETTERS = new RegExp(`[^${FILTER_LETTERS}]+`, "g");
/** What a swap character before the end of a word is followed by. */
const IN_WORD = `[${FILTER_LETTERS}${SWAP_CHARACTERS}]`;
/** The `bangs` pass: exclamation marks that end a run of letters and swaps. */
export const TRAILING_BANGS = `!+(?!${IN_WORD})`;
/** The `edges` pass: swap characters that end a run of letters and swaps. */
export const TRAILING_SWAPS = `[${SWAP_CHARACTERS}]+(?!${IN_WORD})`;
const TRAILING: Readonly<Record<"bangs" | "edges", RegExp>> = {
  bangs: new RegExp(TRAILING_BANGS, "g"),
  edges: new RegExp(TRAILING_SWAPS, "g"),
};

/**
 * Letters with marks by the letter they fold to: the precomposed forms that
 * NFKC keeps (their canonical decompositions start with that letter), then
 * the letters with no decomposition that read as it.
 */
const LATIN: readonly (readonly [string, string])[] = [
  ["a", "ÀÁÂÃÄÅàáâãäåĀāĂăĄąǍǎǞǟǠǡǺǻȀȁȂȃȦȧḀḁẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặæÆǣǢǽǼɑ"],
  ["b", "ḂḃḄḅḆḇƀɓƁ"],
  ["c", "ÇçĆćĈĉĊċČčḈḉƈƇȼȻ"],
  ["d", "ĎďḊḋḌḍḎḏḐḑḒḓđĐðÐɗƊɖƉȡ"],
  ["e", "ÈÉÊËèéêëĒēĔĕĖėĘęĚěȄȅȆȇȨȩḔḕḖḗḘḙḚḛḜḝẸẹẺẻẼẽẾếỀềỂểỄễỆệɇɆɛƐ"],
  ["f", "ḞḟƒƑ"],
  ["g", "ĜĝĞğĠġĢģǦǧǴǵḠḡǥǤɠƓɡ"],
  ["h", "ĤĥȞȟḢḣḤḥḦḧḨḩḪḫẖħĦ"],
  ["i", "ÌÍÎÏìíîïĨĩĪīĬĭĮįİǏǐȈȉȊȋḬḭḮḯỈỉỊịıɨƗɩƖ"],
  ["j", "ĴĵǰɉɈȷ"],
  ["k", "ĶķǨǩḰḱḲḳḴḵƙƘĸ"],
  ["l", "ĹĺĻļĽľḶḷḸḹḺḻḼḽłŁƚȽɫⱢȴɬɭ"],
  ["m", "ḾḿṀṁṂṃɱ"],
  ["n", "ÑñŃńŅņŇňǸǹṄṅṆṇṈṉṊṋŋŊɲƝƞȠȵ"],
  [
    "o",
    "ÒÓÔÕÖòóôõöŌōŎŏŐőƠơǑǒǪǫǬǭȌȍȎȏȪȫȬȭȮȯȰȱṌṍṎṏṐṑṒṓỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợøØǿǾœŒɵƟ",
  ],
  ["p", "ṔṕṖṗƥƤ"],
  ["q", "ɋɊ"],
  ["r", "ŔŕŖŗŘřȐȑȒȓṘṙṚṛṜṝṞṟɍɌɽ"],
  ["s", "ŚśŜŝŞşŠšȘșṠṡṢṣṤṥṦṧṨṩßẞʂȿ"],
  ["t", "ŢţŤťȚțṪṫṬṭṮṯṰṱẗŧŦƭƬʈƮȶþÞ"],
  ["u", "ÙÚÛÜùúûüŨũŪūŬŭŮůŰűŲųƯưǓǔǕǖǗǘǙǚǛǜȔȕȖȗṲṳṴṵṶṷṸṹṺṻỤụỦủỨứỪừỬửỮữỰựʉɄ"],
  ["v", "ṼṽṾṿʋƲ"],
  ["w", "ŴŵẀẁẂẃẄẅẆẇẈẉẘ"],
  ["x", "ẊẋẌẍ"],
  ["y", "ÝýÿŶŷŸȲȳẎẏẙỲỳỴỵỶỷỸỹɏɎƴƳ"],
  ["z", "ŹźŻżŽžẐẑẒẓẔẕƶƵȥȤʐʑɀ"],
];

/**
 * Letters from Cyrillic and Greek that look like Latin ones on screen, as
 * code points, since in source they would look like the Latin letters too.
 */
const LOOKALIKES: readonly (readonly [string, readonly number[]])[] = [
  ["a", [0x0430, 0x0410, 0x03b1, 0x0391]],
  ["b", [0x0432, 0x0412, 0x044c, 0x042c, 0x03b2, 0x0392]],
  // NFKC turns the lunate sigma (which looks like c) into the final sigma.
  ["c", [0x0441, 0x0421, 0x03c2]],
  ["d", [0x0501, 0x0500]],
  [
    "e",
    [0x0435, 0x0415, 0x0451, 0x0401, 0x0454, 0x0404, 0x03b5, 0x0395, 0x03ad],
  ],
  ["h", [0x04bb, 0x04ba, 0x043d, 0x041d, 0x0397]],
  [
    "i",
    [
      0x0456, 0x0406, 0x0457, 0x0407, 0x04c0, 0x04cf, 0x03b9, 0x0399, 0x03af,
      0x03ca, 0x03aa,
    ],
  ],
  ["j", [0x0458, 0x0408, 0x03f3]],
  ["k", [0x043a, 0x041a, 0x03ba, 0x039a]],
  ["m", [0x043c, 0x041c, 0x039c]],
  ["n", [0x039d, 0x03b7, 0x03ae]],
  ["o", [0x043e, 0x041e, 0x03bf, 0x039f, 0x03cc, 0x038c]],
  ["p", [0x0440, 0x0420, 0x03c1, 0x03a1]],
  ["q", [0x051b, 0x051a]],
  ["s", [0x0455, 0x0405]],
  ["t", [0x0442, 0x0422, 0x03c4, 0x03a4]],
  ["u", [0x03c5, 0x03cd, 0x03cb]],
  ["v", [0x03bd, 0x0475, 0x0474]],
  ["w", [0x051d, 0x051c, 0x03c9, 0x03ce]],
  ["x", [0x0445, 0x0425, 0x03c7, 0x03a7]],
  ["y", [0x0443, 0x0423, 0x04af, 0x04ae, 0x03b3, 0x03a5]],
  ["z", [0x0396]],
];

/**
 * Characters removed outright, so they never split a word: every control
 * and invisible character `private.clean_text` removes (which keeps the
 * verdict the same before and after cleaning), soft hyphens, joiners,
 * invisible operators, variation selectors and combining marks.
 */
const REMOVED_RANGES: readonly (readonly [number, number])[] = [
  [0x0001, 0x0008],
  [0x000e, 0x001f],
  [0x007f, 0x0084],
  [0x0086, 0x009f],
  [0x00ad, 0x00ad],
  [0x0300, 0x036f],
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0x20d0, 0x20f0],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0xfeff, 0xfeff],
];

/** Digits and symbols that can stand for a letter (step 3), by that letter. */
const SWAP_PAIRS: readonly (readonly [string, string])[] = [
  ["a", "4@"],
  ["e", "3€"],
  ["i", "1!¡"],
  ["l", "|"],
  ["o", "0"],
  ["s", "5$"],
  ["t", "7"],
];

function range(first: number, last: number): number[] {
  const out: number[] = [];
  for (let code = first; code <= last; code += 1) out.push(code);
  return out;
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
  for (const [first, last] of REMOVED_RANGES) {
    for (const code of range(first, last)) {
      entries.push({ from: String.fromCodePoint(code), to: "" });
    }
  }
  return entries;
}

function buildSwaps(): FoldEntry[] {
  const entries: FoldEntry[] = [];
  for (const [to, sources] of SWAP_PAIRS) {
    for (const from of sources) entries.push({ from, to });
  }
  return entries;
}

/**
 * The folding table (step 2), applied after NFKC. Removals ("" targets)
 * come last, as translate() wants them. SQL's fold_text holds the same
 * entries.
 */
export const FOLD_BASE: readonly FoldEntry[] = buildBase();

/** The swaps (step 3). No swap character is in FOLD_BASE. */
export const FOLD_SWAPS: readonly FoldEntry[] = buildSwaps();

// Each character folds once: the tests hold both tables to that, as
// translate() would silently keep only the first of two entries.
const BASE_MAP = new Map(FOLD_BASE.map(({ from, to }) => [from, to]));
const SWAP_MAP = new Map(FOLD_SWAPS.map(({ from, to }) => [from, to]));

function translateWith(text: string, map: ReadonlyMap<string, string>): string {
  let out = "";
  for (const char of text) out += map.get(char) ?? char;
  return out;
}

/**
 * Steps 1 and 2 (`private.fold_text`): NFKC, then the folding table, one
 * code point at a time. Characters the table doesn't name are kept, and
 * read as separators later.
 */
export function foldText(text: string): string {
  return translateWith(text.normalize("NFKC"), BASE_MAP);
}

/** Step 3 for one pass, on folded text. */
export function applySwaps(folded: string, pass: FilterPass): string {
  if (pass === "plain") return folded;
  const kept = pass === "swaps" ? folded : folded.replace(TRAILING[pass], " ");
  return translateWith(kept, SWAP_MAP);
}

/**
 * The words the filter reads in a text in one pass (steps 1 to 5), in
 * order. An empty array for a text with no letters.
 */
export function normalizeForFilter(
  text: string,
  pass: FilterPass = "swaps",
): string[] {
  const spaced = applySwaps(foldText(text), pass)
    .replace(NOT_LETTERS, " ")
    .trim();
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

/** How a term matches by default: by its letters once folded (PRD §3.9.4). */
export function termMatchOf(term: string): TermMatch {
  const letters = applySwaps(foldText(term), "swaps").replace(
    NOT_LETTERS,
    "",
  ).length;
  return letters <= SHORT_TERM_LETTERS ? "word" : "substring";
}

/** At least `count` of the letter before it. */
function bound(count: number): string {
  return count === 1 ? "+" : `{${count},}`;
}

/**
 * A run-by-run pattern for letters (`private.moderation_runs`): each run
 * of k equal letters wants k or more, and a run of i or l either letter.
 */
export function runsPattern(letters: string): string {
  let out = "";
  let at = 0;
  while (at < letters.length) {
    const letter = letters.charAt(at);
    let count = 1;
    while (letters.charAt(at + count) === letter) count += 1;
    out +=
      letter === "i" || letter === "l"
        ? `(?:i${bound(count)}|l${bound(count)})`
        : `${letter}${bound(count)}`;
    at += count;
  }
  return out;
}

/**
 * The alternatives a term adds to its expression: a word term's words,
 * and its words run together when it has several; a substring term's
 * letters. None for a term with no letters.
 */
export function termAlternatives(term: string, match: TermMatch): string[] {
  const words = normalizeForFilter(term, "swaps");
  if (words.length === 0) return [];
  const joined = runsPattern(words.join(""));
  if (match === "substring") return [joined];
  const phrase = words.map(runsPattern).join(" ");
  return words.length > 1 ? [phrase, joined] : [phrase];
}

/** Byte order, as SQL's `collate "C"` sorts ASCII. */
function byCode(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The two expression sources for a list (`private.moderation_list`). A
 * bare string takes `termMatchOf`'s match; a term with no letters adds
 * nothing.
 */
export function moderationPatterns(
  terms: readonly (string | ModerationTerm)[],
): ModerationPatterns & { size: number } {
  const word = new Set<string>();
  const substring = new Set<string>();
  let size = 0;
  for (const entry of terms) {
    const term = typeof entry === "string" ? entry : entry.term;
    const match = typeof entry === "string" ? termMatchOf(entry) : entry.match;
    const alternatives = termAlternatives(term, match);
    if (alternatives.length === 0) continue;
    size += 1;
    for (const alternative of alternatives) {
      (match === "word" ? word : substring).add(alternative);
    }
  }
  const any = (set: Set<string>) => [...set].sort(byCode).join("|");
  return {
    word: word.size === 0 ? null : ` (?:${any(word)})${PLURAL_SUFFIX} `,
    substring: substring.size === 0 ? null : `(?:${any(substring)})`,
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
 * `private.text_blocked_by` for the same list (AC-LNT-03).
 */
export function isBlocked(text: string, list: ModerationList): boolean {
  for (const pass of PASSES) {
    const words = normalizeForFilter(text, pass);
    if (words.length === 0) continue;
    const marked = words.map((word) => (list.allow.has(word) ? "|" : word));
    if (list.word?.test(` ${marked.join(" ")} `) === true) return true;
    if (list.substring?.test(marked.join("")) === true) return true;
  }
  return false;
}

/** What `private.clean_text` removes: controls and invisible characters (emoji joiners stay). */
const CLEAN_REMOVED: readonly (readonly [number, number])[] = [
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
