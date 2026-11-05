/**
 * The share preview image's alt text (ARCHITECTURE §4.10, PRD §3.5.3,
 * DESIGN §6.11), built from a decoded share code alone, so the stateless
 * preview route needs nothing else. ENG-2 writes the first version; SHR-2
 * owns it from Wave 12.
 *
 *   Knewt Daily number 42 result: 9 out of 12. Geography solved on clue 1.
 *   History solved on clue 2. Film and TV solved on clue 3. Encore 4% off,
 *   a bullseye.
 *
 * - "Daily number 42", because "#" is read inconsistently aloud.
 * - One sentence per Mystery ("solved on clue 2", "missed", "voided"), one
 *   per run of consecutive choice rounds ("Questions: 7 of 9 correct."),
 *   and the Encore with its band, in round order.
 * - Category labels read "&" as "and" ("Film and TV").
 * - Like the image, it never names an answer, a clue, a percentile or a time.
 */
import type { DecodedRound, DecodedShare } from "../share/code.ts";
import type { CategoryId } from "../types/content.ts";

export interface AltTextLabels {
  /** The product name, first in the text. */
  brand: string;
  /** A category's short name, as the share rows show it ("Film & TV"). */
  category(id: CategoryId): string;
  /** The label of a row of collapsed choice rounds, as the share text uses it. */
  choiceRow: string;
}

const spoken = (label: string) => label.replace(/\s*&\s*/g, " and ").trim();

function lowerFirst(text: string): string {
  return text.length === 0
    ? text
    : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function mysterySentence(
  round: Extract<DecodedRound, { family: "mystery" }>,
  labels: AltTextLabels,
): string {
  const label = spoken(labels.category(round.category));
  if (round.voided) return `${label} voided.`;
  return round.solvedOn === null
    ? `${label} missed.`
    : `${label} solved on clue ${round.solvedOn}.`;
}

function choiceSentence(
  run: Extract<DecodedRound, { family: "choice" }>[],
  labels: AltTextLabels,
): string {
  const correct = run.filter((round) => round.correct).length;
  const voided = run.filter((round) => round.voided).length;
  const counts = `${correct} of ${run.length} correct`;
  return voided === 0
    ? `${spoken(labels.choiceRow)}: ${counts}.`
    : `${spoken(labels.choiceRow)}: ${counts}, ${voided} voided.`;
}

function encoreSentence(
  round: Extract<DecodedRound, { family: "encore" }>,
): string {
  if (round.voided || round.display === null) return "Encore voided.";
  const band =
    round.band === "bullseye"
      ? ", a bullseye"
      : round.band === "close"
        ? ", close"
        : "";
  return `Encore ${lowerFirst(round.display)}${band}.`;
}

export function shareAltText(
  decoded: DecodedShare,
  labels: AltTextLabels,
): string {
  const sentences = [
    `${labels.brand} Daily number ${decoded.dailyNumber} result${decoded.archive ? " (archive)" : ""}: ${decoded.points} out of ${decoded.maxPoints}.`,
  ];
  let choices: Extract<DecodedRound, { family: "choice" }>[] = [];
  const flush = () => {
    if (choices.length > 0) sentences.push(choiceSentence(choices, labels));
    choices = [];
  };
  for (const round of decoded.rounds) {
    if (round.family === "choice") {
      choices.push(round);
      continue;
    }
    flush();
    sentences.push(
      round.family === "mystery"
        ? mysterySentence(round, labels)
        : encoreSentence(round),
    );
  }
  flush();
  return sentences.join(" ");
}
