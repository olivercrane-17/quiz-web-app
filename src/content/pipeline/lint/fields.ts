/**
 * The player-facing text of each item kind, with the role each field plays.
 * Text rules run over these; claims and notes are checked separately.
 */
import type { AnyItem } from "../../schema/items.ts";

export type FieldRole =
  | "stem"
  | "statement"
  | "question"
  | "option"
  | "label"
  | "display"
  | "measure"
  | "unit"
  | "clue"
  | "explanation"
  | "learnMore";

export interface TextField {
  path: string;
  value: string;
  role: FieldRole;
}

export function playerTextFields(item: AnyItem): TextField[] {
  const out: TextField[] = [];
  const push = (path: string, value: string, role: FieldRole) =>
    out.push({ path, value, role });
  if ("kind" in item && item.kind === "mystery") {
    item.clues.forEach((clue, i) => push(`clues[${i}]`, clue, "clue"));
  } else if ("kind" in item && item.kind === "encore") {
    push("question", item.question, "question");
    if (item.unit !== "") push("unit", item.unit, "unit");
  } else if (item.format === "mc") {
    push("stem", item.stem, "stem");
    push("answer", item.answer, "option");
    item.wrong.forEach((option, i) => push(`wrong[${i}]`, option, "option"));
  } else if (item.format === "tf") {
    push("stem", item.stem, "statement");
  } else {
    push("stem", item.stem, "stem");
    push("a", item.a, "label");
    push("b", item.b, "label");
    push("valueDisplay.a", item.valueDisplay.a, "display");
    push("valueDisplay.b", item.valueDisplay.b, "display");
    push("measure", item.measure, "measure");
    push("unit", item.unit, "unit");
  }
  push("explanation", item.explanation, "explanation");
  push("learnMore", item.learnMore, "learnMore");
  return out;
}

/** Every string an item holds that a person could read, notes and claims included. */
export function allItemStrings(item: AnyItem): TextField[] {
  const out = playerTextFields(item);
  item.claims.forEach((claim, i) =>
    out.push({
      path: `claims[${i}].text`,
      value: claim.text,
      role: "explanation",
    }),
  );
  if (item.writerNotes)
    out.push({
      path: "writerNotes",
      value: item.writerNotes,
      role: "explanation",
    });
  if ("giveawayTerms" in item) {
    item.giveawayTerms.forEach((term, i) =>
      out.push({
        path: `giveawayTerms[${i}]`,
        value: term,
        role: "explanation",
      }),
    );
  }
  if ("sourceLabels" in item) {
    item.sourceLabels.forEach((label, i) =>
      out.push({
        path: `sourceLabels[${i}]`,
        value: label,
        role: "explanation",
      }),
    );
  }
  return out;
}

export function isSealedItem(item: AnyItem): boolean {
  return "kind" in item;
}

export function isRoomQuestion(item: AnyItem): boolean {
  return "kind" in item && item.kind === "choice";
}

/** mc or room question: the options as written, key first. */
export function choiceOptions(item: AnyItem): string[] | null {
  if ("kind" in item && item.kind !== "choice") return null;
  if (item.format !== "mc") return null;
  return [item.answer, ...item.wrong];
}
