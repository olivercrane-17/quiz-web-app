/**
 * Loads content/reference/*.json and turns them into matchers for the lint.
 *
 * The slur list is ROT13-encoded on disk and decoded only in memory. Its
 * matcher answers yes or no and never reveals which term matched, so no
 * message, log or JSON output can repeat a term.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ZodType } from "zod";

import {
  MythsFileSchema,
  SlursFileSchema,
  SpellingFileSchema,
  StopwordsFileSchema,
} from "../schema/reference.ts";
import { readJsonFile } from "./json.ts";
import { containsPhrase, foldName, foldedWords, rot13 } from "./text.ts";

export interface SpellingEntry {
  right: string;
  kind: "us" | "ise";
}

export interface Myth {
  id: string;
  claim: string;
  groups: string[][];
}

export interface SlurMatcher {
  /** True when the text contains a listed term. */
  test(text: string): boolean;
  readonly size: number;
}

export interface References {
  stopwords: Set<string>;
  spelling: Map<string, SpellingEntry>;
  properNouns: string[];
  myths: Myth[];
  slurs: SlurMatcher;
  /** Missing or invalid reference files, as messages. */
  problems: { file: string; message: string }[];
}

/** Terms of up to this many letters match whole words only (PRD §3.9.4). */
const SHORT_TERM = 5;

export function buildSlurMatcher(
  terms: string[],
  allowlist: string[],
): SlurMatcher {
  const folded = terms
    .map((term) => foldName(term))
    .filter((term) => term !== "");
  const allowed = allowlist
    .map((entry) => foldedWords(entry))
    .filter((entry) => entry.length > 0);
  return {
    size: folded.length,
    test(text: string): boolean {
      const words = foldedWords(text);
      const keep = words.map(() => true);
      for (const entry of allowed) {
        for (let i = 0; i + entry.length <= words.length; i += 1) {
          if (entry.every((word, j) => words[i + j] === word)) {
            for (let j = 0; j < entry.length; j += 1) keep[i + j] = false;
          }
        }
      }
      // Allowlisted words split the text, so no match can span them.
      const segments: string[][] = [[]];
      words.forEach((word, i) => {
        if (keep[i]) segments.at(-1)?.push(word);
        else segments.push([]);
      });
      const kept = segments.flat();
      for (const term of folded) {
        if (term.includes(" ")) {
          if (
            segments.some((segment) => containsPhrase(segment.join(" "), term))
          )
            return true;
          const joined = term.replace(/ /g, "");
          if (kept.some((word) => word === joined || word === `${joined}s`))
            return true;
        } else if (term.length <= SHORT_TERM) {
          if (
            kept.some(
              (word) =>
                word === term || word === `${term}s` || word === `${term}es`,
            )
          ) {
            return true;
          }
        } else if (kept.some((word) => word.includes(term))) {
          return true;
        }
      }
      return false;
    },
  };
}

/** True when a claim text contains at least one phrase of every group. */
export function mythMatches(myth: Myth, claimText: string): boolean {
  const folded = foldName(claimText);
  return myth.groups.every((group) =>
    group.some(
      (phrase) =>
        containsPhrase(folded, phrase) || containsPhrase(folded, `${phrase}s`),
    ),
  );
}

async function readReference<T>(
  dir: string,
  name: string,
  schema: ZodType<T>,
  problems: References["problems"],
): Promise<T | null> {
  const path = join(dir, name);
  if (!existsSync(path)) {
    problems.push({ file: path, message: `missing reference file ${name}` });
    return null;
  }
  try {
    const { data } = await readJsonFile(path);
    const parsed = schema.safeParse(data);
    if (parsed.success) return parsed.data;
    const first = parsed.error.issues[0];
    problems.push({
      file: path,
      message: `${name} is invalid at ${first?.path.join(".") ?? ""}: ${first?.message ?? ""}`,
    });
  } catch (error) {
    problems.push({ file: path, message: (error as Error).message });
  }
  return null;
}

export async function loadReferences(
  referenceDir: string,
): Promise<References> {
  const problems: References["problems"] = [];
  const safetyDir = join(dirname(referenceDir), "safety");
  const [stopwords, spelling, myths, slurs] = await Promise.all([
    readReference(
      referenceDir,
      "stopwords.json",
      StopwordsFileSchema,
      problems,
    ),
    readReference(referenceDir, "spelling.json", SpellingFileSchema, problems),
    readReference(referenceDir, "myths.json", MythsFileSchema, problems),
    readReference(referenceDir, "slurs.json", SlursFileSchema, problems),
  ]);
  const spellingMap = new Map<string, SpellingEntry>();
  for (const [wrong, right] of Object.entries(spelling?.usToOxford ?? {})) {
    spellingMap.set(wrong, { right, kind: "us" });
  }
  for (const [wrong, right] of Object.entries(spelling?.iseToIze ?? {})) {
    spellingMap.set(wrong, { right, kind: "ise" });
  }
  return {
    stopwords: new Set(stopwords?.words ?? []),
    spelling: spellingMap,
    properNouns: spelling?.properNounAllowlist ?? [],
    myths: (myths?.myths ?? []).map((myth) => ({
      id: myth.id,
      claim: myth.claim,
      groups: myth.match.map((group) =>
        group.map((phrase) => foldName(phrase)),
      ),
    })),
    slurs: buildSlurMatcher(
      [
        ...(slurs?.terms ?? []).map(rot13),
        ...(await readLines(join(safetyDir, "slur-terms.txt"))),
      ],
      [
        ...(slurs?.allowlist ?? []).map(rot13),
        ...(await readLines(join(safetyDir, "allowlist.txt"))),
      ],
    ),
    problems,
  };
}

/**
 * The player-facing filter's list (content/safety/, owned by MOD-1,
 * ARCHITECTURE §8.13) is merged in when it exists, so both filters share one
 * list as PRD §3.9.4 asks. One term per line; # starts a comment.
 */
async function readLines(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line !== "");
}

/** References with nothing in them, for tests and fallbacks. */
export function emptyReferences(): References {
  return {
    stopwords: new Set(),
    spelling: new Map(),
    properNouns: [],
    myths: [],
    slurs: buildSlurMatcher([], []),
    problems: [],
  };
}

/** Folded words of a text minus stopwords. */
export function significantWords(
  text: string,
  stopwords: Set<string>,
  minLength = 4,
): string[] {
  return foldedWords(text).filter(
    (word) => word.length >= minLength && !stopwords.has(word),
  );
}
