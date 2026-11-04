/**
 * The practice results' share (PRD §3.5.4, DESIGN §12.11, RITE round 1
 * R1-01): text only, the run's line and then a path-only link to
 * /practice, never a challenge link (AC-SHR-08, AC-PRA-11) and never an
 * answer. "Knewt Practice · Geography · Hard · 8/10"; Mixed difficulty, the
 * default, adds nothing, so Quick play reads "Knewt Practice · Mixed ·
 * 7/10". The Share button itself is the share feature's extension point.
 */
import type { SharePayload } from "@/features/share/share-button";
import { SHELL_COPY } from "@/features/shell";

import { PRACTICE_CLIENT_COPY as COPY } from "./client-copy";
import type { PracticeHistoryEntry } from "./model/storage";

export interface PracticeShareOptions {
  /** The category's name as the results show it, or "Mixed". */
  category: string;
  /** `getSiteUrl()`: absolute, with or without a trailing slash. */
  siteUrl: string;
}

/** The exact text the player shares: the run's line, then the link. */
export function practiceShareText(
  entry: Pick<PracticeHistoryEntry, "request" | "score" | "maxPoints">,
  { category, siteUrl }: PracticeShareOptions,
): string {
  const { difficulty } = entry.request;
  return [
    COPY.share.line({
      brand: SHELL_COPY.brand,
      category,
      difficulty: difficulty === "mixed" ? null : COPY.difficulty[difficulty],
      score: entry.score,
      max: entry.maxPoints,
    }),
    `${siteUrl.replace(/\/+$/, "")}/practice`,
  ].join("\n");
}

export function practiceSharePayload(
  entry: Pick<PracticeHistoryEntry, "request" | "score" | "maxPoints">,
  options: PracticeShareOptions,
): SharePayload {
  return {
    text: practiceShareText(entry, options),
    mode: "practice",
    grid: null,
  };
}
