/**
 * Item rules about lengths and structure: C02, C03, C04, C07, C15, C16,
 * C17 and C18, and the comparison's size wording (X33).
 */
import {
  RELATION_WINS,
  type AnyItem,
  type ComparisonItem,
  type Encore,
} from "../../schema/items.ts";
import { charCount, wordCount } from "../text.ts";
import { choiceOptions, isRoomQuestion } from "./fields.ts";
import { sizeMeasureOf, type SizeMeasure } from "./measures.ts";
import type { RuleHit } from "./types.ts";

/** C02: explanations of 35 words or fewer; rooms aim for 25 (§2.9, §7). */
export function ruleC02(item: AnyItem): RuleHit[] {
  const words = wordCount(item.explanation);
  if (words > 35) {
    return [
      {
        rule: "C02",
        severity: "error",
        path: "explanation",
        message: `explanation has ${words} words; the limit is 35 (§7)`,
      },
    ];
  }
  if (isRoomQuestion(item) && words > 25) {
    return [
      {
        rule: "C02",
        severity: "warn",
        path: "explanation",
        message: `room explanation has ${words} words; aim for 25 or fewer (§2.9)`,
      },
    ];
  }
  return [];
}

/**
 * C03: stems of 120 characters or fewer, 100 in rooms; an mc or room stem is
 * a question ending in "?" (§2.4); an encore question of 120 or fewer (§2.8).
 */
export function ruleC03(item: AnyItem): RuleHit[] {
  if ("kind" in item && item.kind === "encore") {
    const length = charCount(item.question);
    return length > 120
      ? [
          {
            rule: "C03",
            severity: "error",
            path: "question",
            message: `encore question has ${length} characters; the limit is 120 (§2.8)`,
          },
        ]
      : [];
  }
  if ("kind" in item && item.kind !== "choice") return [];
  const hits: RuleHit[] = [];
  const limit = isRoomQuestion(item) ? 100 : 120;
  const length = charCount(item.stem);
  if (length > limit) {
    hits.push({
      rule: "C03",
      severity: "error",
      path: "stem",
      message: `stem has ${length} characters; the limit is ${limit} (§3.8)`,
    });
  }
  if (item.format === "mc" && !item.stem.endsWith("?")) {
    hits.push({
      rule: "C03",
      severity: "error",
      path: "stem",
      message: 'a multiple-choice stem is a question ending in "?" (§2.4)',
    });
  }
  return hits;
}

/** C04: option length; comparison labels of 40 characters or fewer (§2.6). */
export function ruleC04(item: AnyItem): RuleHit[] {
  if (!("kind" in item) && item.format === "comparison") {
    return (["a", "b"] as const).flatMap((side): RuleHit[] => {
      const length = charCount(item[side]);
      return length > 40
        ? [
            {
              rule: "C04",
              severity: "error",
              path: side,
              message: `label has ${length} characters; the limit is 40 (§2.6)`,
              excerpt: item[side],
            },
          ]
        : [];
    });
  }
  const options = choiceOptions(item);
  if (!options) return [];
  const room = isRoomQuestion(item);
  const hardLimit = room ? 30 : 60;
  const hits: RuleHit[] = [];
  options.forEach((option, i) => {
    const path = i === 0 ? "answer" : `wrong[${i - 1}]`;
    const length = charCount(option);
    if (length > hardLimit) {
      hits.push({
        rule: "C04",
        severity: "error",
        path,
        message: `option has ${length} characters; the limit is ${hardLimit} (§2.4)`,
        excerpt: option,
      });
    } else if (length > 24) {
      hits.push({
        rule: "C04",
        severity: "warn",
        path,
        message: `option has ${length} characters; aim for 24 or fewer so the 2 by 2 grid works (§2.4)`,
        excerpt: option,
      });
    }
  });
  return hits;
}

/** C07 (L3): the key is not the longest by more than 50% and 15 characters. */
export function ruleC07(item: AnyItem): RuleHit[] {
  const options = choiceOptions(item);
  if (!options) return [];
  const [answer = 0, ...wrong] = options.map(charCount);
  const longestWrong = Math.max(0, ...wrong);
  if (answer > longestWrong * 1.5 && answer - longestWrong > 15) {
    return [
      {
        rule: "C07",
        severity: "error",
        path: "answer",
        message:
          "the answer is much longer than every other option, which gives it away (L3, §4)",
      },
    ];
  }
  return [];
}

/**
 * The value of a formula that is plain arithmetic (numbers, + - × * / ÷ ^ ²
 * ³ and brackets, thousands commas allowed, optionally followed by a
 * bracketed comment in words), or null for anything else, such as
 * "(695,700 km / 6,371 km) cubed". Never evaluates code.
 */
export function evaluateFormula(formula: string): number | null {
  const text = formula
    .replace(/\s*\([^()]*[A-Za-z][^()]*\)\s*$/, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[×*]/g, "*")
    .replace(/[÷/]/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
  if (!/^[\d\s.+\-*/^()]+$/.test(text)) return null;
  const tokens = text.match(/\d+(?:\.\d+)?|[-+*/^()]/g) ?? [];
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  const primary = (): number => {
    const token = take();
    if (token === "(") {
      const value = sum();
      if (take() !== ")") throw new Error("bracket");
      return value;
    }
    if (token === "-") return -primary();
    if (token === undefined || !/^\d/.test(token)) throw new Error("token");
    return Number(token);
  };
  const power = (): number => {
    const base = primary();
    if (peek() === "^") {
      take();
      return base ** power();
    }
    return base;
  };
  const product = (): number => {
    let value = power();
    while (peek() === "*" || peek() === "/") {
      const op = take();
      const right = power();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const op = take();
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  try {
    const value = sum();
    return at === tokens.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function decimalPlacesOk(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return (
    Math.abs(scaled - Math.round(scaled)) < 1e-9 * Math.max(1, Math.abs(scaled))
  );
}

/** C15: encore numbers. */
export function ruleC15(item: AnyItem): RuleHit[] {
  if (!("kind" in item) || item.kind !== "encore") return [];
  const encore: Encore = item;
  const hits: RuleHit[] = [];
  const add = (path: string, message: string) =>
    hits.push({ rule: "C15", severity: "error", path, message });
  if (!(encore.answer > 0)) add("answer", "the answer must be positive (§2.8)");
  if (encore.valueKind === "year") {
    if (
      !Number.isInteger(encore.answer) ||
      encore.answer < 1 ||
      encore.answer > 9999
    ) {
      add("answer", "a year is a whole number from 1 to 9999 (PRD §4.2.1)");
    }
    if (encore.decimals !== 0) add("decimals", "years take 0 decimals (§2.8)");
    if (encore.unit !== "")
      add("unit", "the unit is an empty string for years (§2.8)");
  } else {
    if (encore.answer < 20 && encore.bands === null) {
      add(
        "answer",
        "quantities under 20 need a bands override with a reason, or a different question (§6 rule 5)",
      );
    }
    if (encore.unit.trim() === "")
      add("unit", "a quantity names its unit (§2.8)");
  }
  if (!decimalPlacesOk(encore.answer, encore.decimals)) {
    add(
      "answer",
      `the answer has more decimals than decimals: ${encore.decimals} allows (§2.8)`,
    );
  }
  for (const field of ["unit", "unitShort", "unitLabel"] as const) {
    const value = encore[field];
    if (
      value !== undefined &&
      /°|\bdegrees?\b|celsius|fahrenheit|kelvin/i.test(value)
    ) {
      add(
        field,
        "no temperature units: percentage bands need a true zero (§6 rule 4)",
      );
    }
  }
  for (const field of ["unitShort", "unitLabel"] as const) {
    const value = encore[field];
    if (value === undefined) continue;
    if (encore.valueKind === "year" && value !== "")
      add(field, `${field} is an empty string for years (§2.8)`);
    if (encore.valueKind === "quantity" && value.trim() === "")
      add(field, `a quantity names its ${field} (§2.8)`);
  }
  if (encore.derivation) {
    // ARCHITECTURE §5.2: the derivation's arithmetic reproduces unrounded,
    // and rounding never moves the answer outside the bullseye, so an exact
    // guess always scores one. No number from the item is ever printed.
    const { formula, unrounded, rounding } = encore.derivation;
    const computed = evaluateFormula(formula);
    if (
      computed !== null &&
      Math.abs(computed - unrounded) >
        Math.max(0.005, 5e-4 * Math.abs(unrounded))
    ) {
      add(
        "derivation.formula",
        "the formula's arithmetic does not reproduce unrounded (ARCHITECTURE §5.2)",
      );
    }
    const gap = Math.abs(encore.answer - unrounded);
    if (/^\s*none\s*$/i.test(rounding)) {
      if (gap > 1e-9 * Math.max(1, Math.abs(unrounded)))
        add(
          "derivation.unrounded",
          "with rounding none the answer equals unrounded (§2.8)",
        );
    } else if (encore.valueKind === "quantity") {
      const bullseye = encore.bands?.bullseye ?? 0.05;
      if (!(unrounded > 0) || gap / unrounded > bullseye)
        add(
          "derivation.unrounded",
          "the rounded answer sits outside the bullseye around unrounded (§6 rule 10)",
        );
    } else if (gap > (encore.bands?.bullseye ?? 2)) {
      add(
        "derivation.unrounded",
        "the rounded year sits outside the bullseye around unrounded (§6 rule 10)",
      );
    }
  }
  if (encore.bands) {
    const { bullseye, close } = encore.bands;
    if (!(bullseye < close))
      add("bands", "bullseye must be narrower than close (ARCHITECTURE §5.2)");
    if (encore.valueKind === "quantity") {
      if (bullseye > 0.1)
        add("bands.bullseye", "never widen a bullseye beyond 10% (§6 rule 10)");
      if (close >= 1)
        add(
          "bands.close",
          "quantity bands are fractions, such as 0.15 for 15%",
        );
    } else if (!Number.isInteger(bullseye) || !Number.isInteger(close)) {
      add("bands", "year bands are whole numbers of years");
    }
  }
  return hits;
}

/** C16: tfKind matches the answer, and a statement is not a question. */
export function ruleC16(item: AnyItem): RuleHit[] {
  if ("kind" in item || item.format !== "tf") return [];
  const hits: RuleHit[] = [];
  if (item.tfKind === "myth" && item.answer !== false) {
    hits.push({
      rule: "C16",
      severity: "error",
      path: "answer",
      message:
        "a myth is a widely believed falsehood, so the answer must be false (§2.5)",
    });
  }
  if (item.tfKind === "surprising_truth" && item.answer !== true) {
    hits.push({
      rule: "C16",
      severity: "error",
      path: "answer",
      message: "a surprising truth must have the answer true (§2.5)",
    });
  }
  if (item.stem.includes("?")) {
    hits.push({
      rule: "C16",
      severity: "error",
      path: "stem",
      message: "a true/false item is a statement, not a question (§2.5)",
    });
  }
  return hits;
}

const DATE_RELATIONS = new Set(["earlier", "later"]);
const LATITUDE_RELATIONS = new Set(["further_north", "further_south"]);
/** Units of measurement; integer values in any other unit count as exact counts. */
const MEASUREMENT_UNIT =
  /^(?:k?m|cm|mm|nm|µm|km²|m²|km2|m2|ha|km\/h|m\/s|mph|kg|g|mg|t|tonnes?|l|ml|litres?|metres?|kilometres?|kilograms?|grams?|seconds?|minutes?|hours?|days?|years?|°\s?[CFK]|k|kelvin|ly|au|light[- ]years?|pa|hpa|kpa|w|kw|mw|gw|hz|khz|mhz|v|a|j|kj|cal)$/i;

const STEM_WORDS: Record<string, RegExp> = {
  earlier: /\b(?:first|earlier|older|before)\b/i,
  later: /\b(?:later|after|newer|younger)\b/i,
  larger: /\b(?:bigger|larger|greater)\b/i,
  smaller: /\b(?:smaller|less)\b/i,
  more: /\b(?:more)\b/i,
  fewer: /\b(?:fewer|less)\b/i,
  heavier: /\bheavier\b/i,
  lighter: /\blighter\b/i,
  longer: /\blonger\b/i,
  shorter: /\bshorter\b/i,
  taller: /\b(?:taller|higher)\b/i,
  further_north: /\b(?:further|farther) north\b/i,
  further_south: /\b(?:further|farther) south\b/i,
  faster: /\b(?:faster|quicker)\b/i,
  slower: /\bslower\b/i,
  hotter: /\b(?:hotter|warmer)\b/i,
  colder: /\b(?:colder|cooler)\b/i,
};

/** C17: the answer wins under the relation, and the separation guard holds. */
export function ruleC17(item: AnyItem): RuleHit[] {
  if ("kind" in item || item.format !== "comparison") return [];
  const c: ComparisonItem = item;
  const hits: RuleHit[] = [];
  const add = (severity: RuleHit["severity"], path: string, message: string) =>
    hits.push({ rule: "C17", severity, path, message });
  const { a, b } = c.values;
  if (a === b) {
    add("error", "values", "the two values tie, so neither side wins (§2.6)");
    return hits;
  }
  const higher = a > b ? "a" : "b";
  const winner =
    RELATION_WINS[c.relation] === "higher"
      ? higher
      : higher === "a"
        ? "b"
        : "a";
  if (c.answer !== winner) {
    add(
      "error",
      "answer",
      `under ${c.relation} the winner is ${winner}, not ${c.answer} (§2.6)`,
    );
  }
  const diff = Math.abs(a - b);
  if (DATE_RELATIONS.has(c.relation) || c.unit.toLowerCase() === "year") {
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      add("error", "values", "dates are signed whole years (§2.6)");
    } else if (diff < 10) {
      // An error the editor may waive with a C17 lintAllow whose reason
      // states both exact, undisputed days (§2.6); no other C17 error is
      // waivable.
      hits.push({
        rule: "C17",
        severity: "error",
        path: "values",
        message:
          "dates under 10 years apart pass only when both are exact, undisputed days at least a calendar year apart; the editor records that in a C17 lintAllow (§2.6)",
        waivable: true,
      });
    }
  } else if (LATITUDE_RELATIONS.has(c.relation)) {
    if (Math.abs(a) > 90 || Math.abs(b) > 90)
      add(
        "error",
        "values",
        "latitudes are decimal degrees from -90 to 90 (§2.6)",
      );
    if (diff < 0.5)
      add("error", "values", "latitudes must be at least 0.5° apart (§2.6)");
  } else if (a <= 0 || b <= 0) {
    add(
      "warn",
      "values",
      "the 1.1 times guard needs positive values; check the separation by hand (§2.6)",
    );
  } else {
    const exactCount =
      Number.isInteger(a) &&
      Number.isInteger(b) &&
      !MEASUREMENT_UNIT.test(c.unit.trim());
    if (!exactCount && Math.max(a, b) / Math.min(a, b) < 1.1) {
      add(
        "error",
        "values",
        "the larger value must be at least 1.1 times the smaller (§2.6)",
      );
    }
  }
  const words = STEM_WORDS[c.relation];
  if (words && !words.test(c.stem)) {
    add(
      "warn",
      "stem",
      `the stem does not name the relation ${c.relation} (§2.6)`,
    );
  }
  return hits;
}

/** A size word that says "bigger" without saying by what (§2.6). */
const SIZE_WORD = /\b(?:bigger|larger|greater|smaller)\b/i;
/** Words that name what is measured, so a stem with one says by what: "bigger by area". */
const NAMED_MEASURE =
  /\b(?:mass|weight|length|height|width|depth|diameter|radius|distance|span|wingspan|circumference|girth|thickness|area|volume)\b/i;
/** A stem that names the measure, for each kind (§2.6's standard stems). */
const NAMED_STEM: Readonly<Record<SizeMeasure, string>> = {
  mass: '"Which is heavier?"',
  length: '"Which is longer?" or "Which is taller?"',
  area: '"Which is bigger by area?"',
};

/**
 * X33 (RITE round 2, R2-15): a comparison of mass, length or area may not
 * ask a bare "Which is bigger?". By mass or by size? Each gives a
 * different fight (§2.6: the stem names the measure when "bigger" could
 * mean several things; §12.6's fourth bad example). `units` are the
 * measured units of content/reference/units.json (`sizeUnits`).
 */
export function ruleX33(
  item: AnyItem,
  units: ReadonlyMap<string, SizeMeasure>,
): RuleHit[] {
  if ("kind" in item || item.format !== "comparison") return [];
  const size = SIZE_WORD.exec(item.stem);
  if (size === null || NAMED_MEASURE.test(item.stem)) return [];
  const measure = sizeMeasureOf(item.measure, item.unit, units);
  if (measure === null) return [];
  return [
    {
      rule: "X33",
      severity: "error",
      path: "stem",
      message: `a comparison of ${measure} asks a bare "${size[0].toLowerCase()}": name the measure, as ${NAMED_STEM[measure]} does (§2.6, §12.6)`,
      excerpt: item.stem,
    },
  ];
}

const STARTS_WITH_NUMBER = /^\s*-?\d/;
const LEADING_NUMBER = /^\s*(-?\d[\d,]*(?:\.\d+)?)/;

/** C18: ascending options start with a number; no duplicate options. */
export function ruleC18(item: AnyItem): RuleHit[] {
  const options = choiceOptions(item);
  if (!options || !("order" in item)) return [];
  const hits: RuleHit[] = [];
  const normalized = options.map((option) =>
    option.toLowerCase().replace(/\s+/g, " ").trim(),
  );
  normalized.forEach((option, i) => {
    if (normalized.indexOf(option) !== i) {
      hits.push({
        rule: "C18",
        severity: "error",
        path: i === 0 ? "answer" : `wrong[${i - 1}]`,
        message: "duplicate option (case and spacing ignored) (§2.4)",
        excerpt: options[i] ?? "",
      });
    }
  });
  const numeric = options.map((option) => STARTS_WITH_NUMBER.test(option));
  if (item.order === "ascending") {
    numeric.forEach((ok, i) => {
      if (!ok) {
        hits.push({
          rule: "C18",
          severity: "error",
          path: i === 0 ? "answer" : `wrong[${i - 1}]`,
          message:
            "with order ascending every option starts with a number (§2.4)",
          excerpt: options[i] ?? "",
        });
      }
    });
    const leading = options.map((option) =>
      LEADING_NUMBER.exec(option)?.[1]?.replace(/,/g, ""),
    );
    if (leading.every(Boolean) && new Set(leading).size !== leading.length) {
      hits.push({
        rule: "C18",
        severity: "error",
        path: "wrong",
        message:
          "two options start with the same number, so they cannot be sorted (§2.4)",
      });
    }
  } else if (numeric.every(Boolean)) {
    hits.push({
      rule: "C18",
      severity: "warn",
      path: "order",
      message: "numbers and dates use order: ascending (§2.4)",
    });
  }
  return hits;
}
