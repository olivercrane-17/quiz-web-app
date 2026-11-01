/**
 * The Encore round's words (PRD §3.1.5, §4.2; DESIGN §1.4, §6.5, §12.2).
 * DESIGN's polished strings win where it has one; PRD wording fills the
 * rest. `encoreAnnouncementText` words the plugin's announcement for every
 * controller that runs an Encore.
 */
import type { EncoreParseError } from "@/engine/encore";
import type { Announcement } from "@/engine/rounds";
import type { EncoreBand } from "@/engine/types";

/** A band limit as people say it: 0.05 is "5%", 2 years is "2 years". */
export function bandWords(
  limit: number,
  valueKind: "quantity" | "year",
): string {
  if (valueKind === "year")
    return limit === 1 ? "1 year" : `${String(limit)} years`;
  return `${String(Number((limit * 100).toFixed(2)))}%`;
}

export const ENCORE_COPY = {
  kicker: "Encore · one number, the tiebreak",
  label: "Encore",
  tiebreak: "Closest guess wins the tiebreak.",
  field: "Your number",
  /** "You're answering 1,250 km": the amount is set in bold. */
  previewLead: "You're answering",
  hints: {
    bullseye: (limit: number, kind: "quantity" | "year") =>
      `Within ${bandWords(limit, kind)} is a bullseye`,
    close: (limit: number, kind: "quantity" | "year") =>
      `Within ${bandWords(limit, kind)} is close`,
    group: "How the Encore is judged",
  },
  lockIn: "Lock in",
  errors: {
    not_number: "Numbers only, please.",
    not_positive: "Positive numbers only.",
    bad_separator: "Check the dots and commas.",
    too_many_decimals: (decimals: number) =>
      decimals === 1
        ? "Up to 1 decimal place, please."
        : `Up to ${String(decimals)} decimal places, please.`,
    too_many_digits: "That's more digits than we can take.",
    year_range: "Years run from 1 to 9999.",
    lockIn: "We couldn't lock that in. Try again.",
    retry: "Try again",
    offline:
      "You're offline. Your progress is saved, and we'll pick up where you left off.",
  },
  result: {
    /** "Your guess 1,200 km · Answer 1,250 km · 4% off" */
    line: (guess: string, answer: string, error: string) =>
      `Your guess ${guess} · Answer ${answer} · ${error}`,
    band: { bullseye: "Bullseye", close: "Close" } satisfies Record<
      Exclude<EncoreBand, null>,
      string
    >,
    crowd: (median: string, bullseye: number, close: number) =>
      `Median guess ${median}. ${String(bullseye)}% hit the bullseye and ${String(close)}% were close.`,
  },
  numberLine: {
    /** The line's text equivalent (PRD §3.1.5, AC-DLY-35). */
    text: (parts: {
      guess: string;
      answer: string;
      median: string | null;
      bullseye: string;
      close: string;
    }) =>
      [
        `Your guess ${parts.guess}.`,
        `Answer ${parts.answer}.`,
        parts.median === null ? null : `Median guess ${parts.median}.`,
        `Bullseye means within ${parts.bullseye}, close within ${parts.close}.`,
      ]
        .filter((part) => part !== null)
        .join(" "),
    half: "half",
    double: "double",
  },
  withdrawn: "The Encore was withdrawn, so ties fall to time.",
} as const;

/** The inline message for a parse failure (PRD §4.2.1). */
export function parseErrorText(
  error: EncoreParseError,
  decimals: number,
): string {
  const errors = ENCORE_COPY.errors;
  return error === "too_many_decimals"
    ? errors.too_many_decimals(decimals)
    : errors[error];
}

/**
 * The status message for an Encore announcement (DESIGN §1.4: "Bullseye.
 * 4% off.", "Close. 12% off.", "28% off. The answer was 1,250 km.", "Spot
 * on."), or null for another family's.
 */
export function encoreAnnouncementText(
  announcement: Announcement,
): string | null {
  if (announcement.kind !== "encore_result") return null;
  // Empty fields mark a withdrawal (the plugin's convention).
  if (announcement.answer === "") return ENCORE_COPY.withdrawn;
  if (announcement.error === "Spot on") {
    return `Spot on. The answer was ${announcement.answer}.`;
  }
  const band =
    announcement.band === null
      ? ""
      : `${ENCORE_COPY.result.band[announcement.band]}. `;
  const error =
    announcement.error.charAt(0).toUpperCase() + announcement.error.slice(1);
  return `${band}${error}. You said ${announcement.guess}. The answer was ${announcement.answer}.`;
}
