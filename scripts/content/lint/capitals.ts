/**
 * C27, the capital rule (CONTENT_GUIDE §2.13, §3.4). No stem, clue or claim
 * may ask for or state the capital of a country that has no single, settled
 * capital: one with several or none in law, one whose capital moved or was
 * renamed since 1990, or one with a move announced or under way. Those
 * countries live in content/reference/capitals-excluded.json.
 *
 * - The word "capital" (or "capitals") in the same stem, encore question,
 *   clue or claim as a listed country, by the name the file gives or by any
 *   name or alias of its entry in the country list (joined on iso_a2), is an
 *   error.
 * - So is any clue holding "capital" in a mystery whose answer is a listed
 *   country, whether or not the clue names it.
 *
 * "Capital" in its other senses (a capital letter, capital punishment,
 * venture capital) doesn't count.
 */
import type { AnyItem } from "../../../src/content/schema/items.ts";
import type { Bank } from "../../../src/content/pipeline/bank.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";
import {
  containsPhrase,
  foldName,
} from "../../../src/content/pipeline/text.ts";
import type { CapitalsExcludedEntry } from "./reference.ts";

const CAPITAL = /\bcapitals?\b/gi;
/** Senses of "capital" that have nothing to do with a seat of government. */
const AFTER =
  /^(?:'s)?\s+(?:letters?|punishment|gains?|offen[cs]es?|crimes?|ships?|goods|markets?|expenditure|investment)\b/i;
const BEFORE =
  /\b(?:venture|share|working|human|social|political|cultural|start-up|startup|private|foreign)\s+$/i;

/** True when the text uses "capital" for a seat of government. */
export function mentionsCapital(textValue: string): boolean {
  for (const match of textValue.matchAll(CAPITAL)) {
    const before = textValue.slice(0, match.index);
    const after = textValue.slice(match.index + match[0].length);
    if (AFTER.test(after) || BEFORE.test(before)) continue;
    return true;
  }
  return false;
}

export interface ExcludedCountry {
  entry: CapitalsExcludedEntry;
  /** Folded names: the file's, then the list entity's name, display and aliases. */
  phrases: string[];
  /** The country list's entity id, when the list holds one. */
  entityId: string | null;
}

/** The excluded countries with every name a text might use for them. */
export function excludedCountries(
  bank: Bank,
  entries: readonly CapitalsExcludedEntry[],
): ExcludedCountry[] {
  const list = bank.lists.get("country");
  const byIso = new Map<string, { id: string; names: string[] }>();
  for (const entity of list?.entities.values() ?? []) {
    const iso = (entity.qualifier as { iso_a2?: unknown }).iso_a2;
    if (typeof iso !== "string") continue;
    byIso.set(iso, {
      id: entity.id,
      names: [entity.name, entity.display, ...entity.aliases],
    });
  }
  return entries.map((entry) => {
    const listed = byIso.get(entry.iso_a2);
    const names = [entry.country, ...(listed?.names ?? [])];
    const phrases = new Set<string>();
    for (const name of names) {
      const folded = foldName(name);
      if (folded === "") continue;
      phrases.add(folded);
      // "the Netherlands" is "Netherlands" in most sentences.
      if (folded.startsWith("the ")) phrases.add(folded.slice(4));
    }
    return { entry, phrases: [...phrases], entityId: listed?.id ?? null };
  });
}

interface Field {
  path: string;
  value: string;
  clue: boolean;
}

/** The stems, encore questions, clues and claims C27 reads. */
function capitalFields(item: AnyItem): Field[] {
  const fields: Field[] = [];
  if ("kind" in item && item.kind === "mystery") {
    item.clues.forEach((clue, i) =>
      fields.push({ path: `clues[${i}]`, value: clue, clue: true }),
    );
  } else if ("kind" in item && item.kind === "encore") {
    fields.push({ path: "question", value: item.question, clue: false });
  } else {
    fields.push({ path: "stem", value: item.stem, clue: false });
  }
  item.claims.forEach((claim, i) =>
    fields.push({ path: `claims[${i}].text`, value: claim.text, clue: false }),
  );
  return fields;
}

/** C27 for one item. */
export function ruleC27(
  item: AnyItem,
  countries: readonly ExcludedCountry[],
): RuleHit[] {
  if (countries.length === 0) return [];
  const hits: RuleHit[] = [];
  let answerCountry: ExcludedCountry | undefined;
  if (
    "kind" in item &&
    item.kind === "mystery" &&
    item.answerType === "country"
  )
    answerCountry = countries.find(
      (country) =>
        country.entityId !== null && country.entityId === item.answer,
    );
  for (const field of capitalFields(item)) {
    if (!mentionsCapital(field.value)) continue;
    const folded = foldName(field.value);
    const named = countries.find((country) =>
      country.phrases.some((phrase) => containsPhrase(folded, phrase)),
    );
    if (named) {
      hits.push({
        rule: "C27",
        severity: "error",
        path: field.path,
        message: `"capital" beside a country with no single, settled capital (${named.entry.reason}, content/reference/capitals-excluded.json, §3.4)`,
        excerpt: named.entry.country,
      });
    } else if (field.clue && answerCountry) {
      hits.push({
        rule: "C27",
        severity: "error",
        path: field.path,
        message: `a clue holds "capital" and the answer is a country with no single, settled capital (${answerCountry.entry.reason}, §3.4)`,
      });
    }
  }
  return hits;
}
