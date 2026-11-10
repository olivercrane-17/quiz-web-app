/**
 * What a comparison measures, as the size rule X33 reads it (CONTENT_GUIDE
 * §2.6): mass, length or area, from the item's `unit` on the measured lists
 * of content/reference/units.json, or failing that from the words of its
 * `measure`. Anything else (speed, a count, a year, a duration with no
 * length word) is null, because a bare "bigger" there is not what this
 * rule is about.
 *
 * units.json belongs to CNT-2's lint, which validates it
 * (scripts/content/lint/reference.ts). This reads only its `measured`
 * lists, once per reference folder, and takes a missing or malformed file
 * as empty, so the measure's words still decide.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type SizeMeasure = "mass" | "length" | "area";

const SIZE_MEASURES: readonly SizeMeasure[] = ["mass", "length", "area"];

/** Words of a `measure` that name each kind. "long" is left out: it is time too. */
const MEASURE_WORDS: Readonly<Record<SizeMeasure, RegExp>> = {
  area: /\barea\b/i,
  mass: /\b(?:mass|weight|weighs?)\b/i,
  length:
    /\b(?:length|height|tall|width|depth|diameter|radius|distance|span|wingspan|circumference|girth|thickness)\b/i,
};

const unitsByDir = new Map<string, ReadonlyMap<string, SizeMeasure>>();

/** The measured units of `referenceDir`/units.json, case folded, by kind. */
export function sizeUnits(
  referenceDir: string,
): ReadonlyMap<string, SizeMeasure> {
  const cached = unitsByDir.get(referenceDir);
  if (cached !== undefined) return cached;
  const out = new Map<string, SizeMeasure>();
  const path = join(referenceDir, "units.json");
  try {
    if (existsSync(path)) {
      const file = JSON.parse(readFileSync(path, "utf8")) as {
        measured?: Partial<Record<string, unknown>>;
      };
      for (const kind of SIZE_MEASURES) {
        const units = file.measured?.[kind];
        if (!Array.isArray(units)) continue;
        for (const unit of units) {
          if (typeof unit === "string")
            out.set(unit.trim().toLowerCase(), kind);
        }
      }
    }
  } catch {
    // CNT-2's reference check reports a broken file; the words still decide.
  }
  unitsByDir.set(referenceDir, out);
  return out;
}

/** Mass, length or area for a comparison's measure and unit, or null. */
export function sizeMeasureOf(
  measure: string,
  unit: string,
  units: ReadonlyMap<string, SizeMeasure>,
): SizeMeasure | null {
  const byUnit = units.get(unit.trim().toLowerCase());
  if (byUnit !== undefined) return byUnit;
  return (
    SIZE_MEASURES.find((kind) => MEASURE_WORDS[kind].test(measure)) ?? null
  );
}
