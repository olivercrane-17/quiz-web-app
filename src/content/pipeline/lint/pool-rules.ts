/**
 * Pool rules across items: batch balance (X03, X06), room packs (X04, X05),
 * the category true/false share (X07), the schedule (X10 to X14) and where
 * a pool's ascending keys sit (X34).
 */
import { dirname } from "node:path";

import { ascendingOrder } from "../../../engine/text/metrics.ts";
import type {
  AnyItem,
  Encore,
  McItem,
  Mystery,
  RoomQuestion,
} from "../../schema/items.ts";
import type { Bank, BankItem, PackInfo } from "../bank.ts";
import { batchForItem, parseItemId } from "../ids.ts";
import { repoRelative } from "../layout.ts";
import type { Finding } from "./types.ts";

function finding(
  rule: string,
  severity: Finding["severity"],
  file: string,
  message: string,
  extra: Partial<Finding> = {},
): Finding {
  return { rule, severity, file, message, sealed: false, ...extra };
}

const inPlay = (item: AnyItem) =>
  item.status !== "cut" && item.status !== "retired";

/** Groups bank items by their register batch. */
export function itemsByBatch(bank: Bank): Map<string, BankItem[]> {
  const out = new Map<string, BankItem[]>();
  if (!bank.register) return out;
  for (const record of bank.items) {
    const parsed = parseItemId(record.id);
    if (!parsed) continue;
    const batch = batchForItem(bank.register, parsed);
    if (!batch) continue;
    const list = out.get(batch.batchId) ?? [];
    list.push(record);
    out.set(batch.batchId, list);
  }
  return out;
}

/**
 * The difficulty band of an item: mysteries by slot; encores by
 * predicted.pClose (easy at 0.5 or more, medium 0.2 to 0.49, hard below 0.2,
 * §8.4); practice and room items by predicted.p (§8.2); the seed otherwise.
 */
export function bandOf(item: AnyItem): "easy" | "medium" | "hard" {
  if ("kind" in item && item.kind === "mystery") {
    return item.slot === 1 ? "easy" : item.slot === 2 ? "medium" : "hard";
  }
  if ("kind" in item && item.kind === "encore" && item.predicted) {
    const close = item.predicted.pClose;
    return close >= 0.5 ? "easy" : close >= 0.2 ? "medium" : "hard";
  }
  const predicted = "predicted" in item ? item.predicted : undefined;
  if (predicted && "p" in predicted) {
    return predicted.p >= 0.75
      ? "easy"
      : predicted.p >= 0.45
        ? "medium"
        : "hard";
  }
  return item.seededDifficulty <= 2
    ? "easy"
    : item.seededDifficulty <= 4
      ? "medium"
      : "hard";
}

export function poolFindings(bank: Bank): Finding[] {
  const out: Finding[] = [];
  const byBatch = itemsByBatch(bank);

  for (const [batchId, records] of byBatch) {
    const batch = bank.register?.batches.find(
      (entry) => entry.batchId === batchId,
    );
    const live = records.filter((record) => inPlay(record.item));
    // X03: true/false split within one of even.
    const tf = live.flatMap((record) =>
      !("kind" in record.item) && record.item.format === "tf"
        ? [record.item.answer]
        : [],
    );
    const trues = tf.filter(Boolean).length;
    if (Math.abs(trues - (tf.length - trues)) > 1) {
      out.push(
        finding(
          "X03",
          "warn",
          "content/batches.json",
          `${batchId}: ${trues} true and ${tf.length - trues} false true/false items; keep them within one of an even split (§2.5)`,
        ),
      );
    }
    // X06: year encores at most a quarter, or the plan's cap.
    const encores = live.flatMap((record) =>
      "kind" in record.item && record.item.kind === "encore"
        ? [record.item as Encore]
        : [],
    );
    if (encores.length > 0) {
      const years = encores.filter(
        (encore) => encore.valueKind === "year",
      ).length;
      const cap = batch?.plan.maxYearEncores ?? Math.floor(encores.length / 4);
      if (years > cap) {
        out.push(
          finding(
            "X06",
            "warn",
            "content/batches.json",
            `${batchId}: ${years} year encores; the cap is ${cap} (§6 rule 9)`,
          ),
        );
      }
    }
  }

  for (const pack of bank.packs) out.push(...packFindings(bank, pack));

  // X07: at most 10% true/false among a category's active practice items.
  const perCategory = new Map<string, { all: number; tf: number }>();
  for (const record of bank.items) {
    if (record.pool !== "practice" || record.item.status !== "active") continue;
    const entry = perCategory.get(record.item.category) ?? { all: 0, tf: 0 };
    entry.all += 1;
    if (!("kind" in record.item) && record.item.format === "tf") entry.tf += 1;
    perCategory.set(record.item.category, entry);
  }
  for (const [category, { all, tf }] of perCategory) {
    if (all >= 20 && tf / all > 0.1) {
      out.push(
        finding(
          "X07",
          "warn",
          "content/practice",
          `${category}: ${tf} of ${all} active items are true/false; packs allow at most 10% (ARCHITECTURE §5.2)`,
        ),
      );
    }
  }

  out.push(...ascendingKeyFindings(bank));
  out.push(...scheduleFindings(bank));
  return out;
}

/** X34: the most of a pool's ascending keys one display position may hold. */
export const ASCENDING_KEY_SHARE = 0.4;
/** X34 reads a pool once it ships this many ascending keys: below it, one key is 100% somewhere. */
export const ASCENDING_KEY_MIN = 5;

const LETTERS = "ABCDEFGH";

/**
 * The display position of an ascending multiple-choice item's key, 0 for
 * A: the engine sorts the options by sortKey (ARCHITECTURE §4.12), so the
 * writer's distractors decide it. Null for any other item, or for a set
 * C18 refuses because it can't be sorted.
 */
export function ascendingKeyPosition(item: AnyItem): number | null {
  const mc: McItem | RoomQuestion | null =
    "kind" in item
      ? item.kind === "choice"
        ? item
        : null
      : item.format === "mc"
        ? item
        : null;
  if (mc === null || mc.order !== "ascending") return null;
  const order = ascendingOrder([mc.answer, ...mc.wrong]);
  return order === null ? null : order.indexOf(0);
}

/**
 * X34 (RITE round 2, R2-23): no display position holds more than 40% of a
 * pool's ascending keys. Shuffled options move every serve, but ascending
 * ones sort the same way each time, so a writer's habit of putting the key
 * second shows up as a tally anyone can keep (Dee's A 4, B 8, C 1, D 1;
 * CONTENT_GUIDE §4 rule 7 asks writers to vary it, and nothing checked).
 *
 * A pool is what ships together, as its build sees it: a content tree's
 * active practice items, or its room questions, and a fixture tree's items
 * in play, which every mock build serves. The rule waits for 5 keys, and
 * never asks for a spread no pool could have: seven keys over three
 * positions may put three at one. A warning, as the other pool rules are;
 * the practice pool's finding names the items at the crowded position,
 * and a sealed pool's names none, because a key's position beside its
 * sorted options is the key.
 */
function ascendingKeyFindings(bank: Bank): Finding[] {
  const fixtures = bank.layout.kind === "fixtures";
  const pools = new Map<
    string,
    { ids: string[][]; slots: number; sealed: boolean; file: string }
  >();
  for (const record of bank.items) {
    const ships = fixtures
      ? inPlay(record.item)
      : record.item.status === "active";
    if (!ships) continue;
    const position = ascendingKeyPosition(record.item);
    if (position === null) continue;
    const options =
      "wrong" in record.item ? record.item.wrong.length + 1 : position + 1;
    const pool = pools.get(record.pool) ?? {
      ids: [],
      slots: 0,
      sealed: record.file.sealed,
      file:
        record.pool === "practice"
          ? repoRelative(bank.layout, bank.layout.practiceDir)
          : dirname(record.file.rel),
    };
    (pool.ids[position] ??= []).push(record.id);
    pool.slots = Math.max(pool.slots, options);
    pools.set(record.pool, pool);
  }

  const out: Finding[] = [];
  for (const [name, pool] of pools) {
    const total = pool.ids.reduce((sum, ids) => sum + (ids?.length ?? 0), 0);
    if (total < ASCENDING_KEY_MIN) continue;
    const limit = Math.max(
      total * ASCENDING_KEY_SHARE,
      Math.ceil(total / pool.slots),
    );
    pool.ids.forEach((ids, position) => {
      if (ids === undefined || ids.length <= limit + 1e-9) return;
      const letter = LETTERS[position] ?? String(position + 1);
      const share = Math.round((ids.length / total) * 100);
      const named = pool.sealed ? "" : `: ${[...ids].sort().join(", ")}`;
      out.push(
        finding(
          "X34",
          "warn",
          pool.file,
          `${name}: ${ids.length} of ${total} ascending keys sit at ${letter} (${share}%); keep every position at ${ASCENDING_KEY_SHARE * 100}% or less, so where the key sits never hints at it (§4 rule 7)${named}`,
          { sealed: pool.sealed },
        ),
      );
    });
  }
  return out;
}

function packFindings(bank: Bank, pack: PackInfo): Finding[] {
  const out: Finding[] = [];
  const questions = pack.questionIds
    .map((id) => bank.itemsById.get(id)?.item as RoomQuestion | undefined)
    .filter((q): q is RoomQuestion => q !== undefined);
  const live = questions.filter(inPlay);
  const batch = bank.register?.batches.find(
    (entry) => entry.packId === pack.id && entry.status !== "planned",
  );
  const closed = batch?.status === "closed";
  const file = pack.file.rel;
  if (live.length !== 15) {
    out.push(
      finding(
        "X04",
        closed ? "error" : "warn",
        file,
        `pack ${pack.id} has ${live.length} questions in play; a finished pack holds exactly 15 in play order (§2.9)`,
        { sealed: true },
      ),
    );
    return out;
  }
  const bands = live.map(bandOf);
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const band of bands) counts[band] += 1;
  const problems: string[] = [];
  if (counts.easy !== 6 || counts.medium !== 6 || counts.hard !== 3) {
    problems.push(
      `${counts.easy} easy, ${counts.medium} medium, ${counts.hard} hard instead of 6, 6 and 3`,
    );
  }
  if (bands.slice(0, 3).some((band) => band !== "easy"))
    problems.push("positions 1 to 3 are not all easy");
  if (bands[14] !== "medium")
    problems.push("the finale (position 15) is not medium");
  if (bands.some((band, i) => band === "hard" && bands[i + 1] === "hard"))
    problems.push("two hard questions in a row");
  if (!bands.slice(7).includes("hard"))
    problems.push("no hard question at position 8 or later");
  const answers = live.map((q) => q.answer.toLowerCase());
  if (new Set(answers).size !== answers.length)
    problems.push("an answer repeats inside the pack");
  for (const problem of problems) {
    out.push(
      finding("X05", "warn", file, `pack ${pack.id}: ${problem} (§10.9)`, {
        sealed: true,
      }),
    );
  }
  return out;
}

/** Mystery and encore ids by the dates they are scheduled on (main track). */
export function scheduledDates(bank: Bank): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { month } of bank.schedules) {
    if (month.track !== "main") continue;
    for (const daily of month.dailies) {
      for (const round of daily.rounds) {
        const list = out.get(round.contentId) ?? [];
        list.push(daily.date);
        out.set(round.contentId, list);
      }
    }
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

const SLOT_FOR: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

function scheduleFindings(bank: Bank): Finding[] {
  const out: Finding[] = [];
  const lastUsed = new Map<string, string>();
  const lastAnswer = new Map<string, string>();
  const dailies = bank.schedules
    .filter(({ month }) => month.track === "main")
    .flatMap(({ file, month }) =>
      month.dailies.map((daily) => ({ file, daily })),
    )
    .sort((x, y) => x.daily.date.localeCompare(y.daily.date));

  for (const { file, daily } of dailies) {
    const add = (rule: string, message: string) =>
      out.push(
        finding(rule, "error", file.rel, `${daily.date}: ${message}`, {
          sealed: true,
        }),
      );
    const mysteries: Mystery[] = [];
    for (const round of daily.rounds) {
      const record = bank.itemsById.get(round.contentId);
      if (!record) {
        if (!bank.invalidIds.has(round.contentId))
          add("X10", `round ${round.contentId} names no item`);
        continue;
      }
      const item = record.item;
      const kind = "kind" in item ? item.kind : "practice";
      // mc, tf and comparison rounds name sealed choice items of that format
      // (ARCHITECTURE §3.3 RoundType, §5.6).
      const wanted =
        round.type === "mystery" || round.type === "encore"
          ? round.type
          : "choice";
      if (kind !== wanted) {
        add(
          "X10",
          `round ${round.contentId} is a ${kind} item in a ${round.type} round`,
        );
      } else if (
        wanted === "choice" &&
        "format" in item &&
        item.format !== round.type
      ) {
        add(
          "X10",
          `round ${round.contentId} is a ${item.format} choice item in a ${round.type} round`,
        );
      }
      if (item.status !== "active")
        add(
          "X10",
          `round ${round.contentId} is ${item.status}, not active (§0.2)`,
        );
      if (item.region !== "global")
        add(
          "X14",
          `round ${round.contentId} is ${item.region}; launch Dailies are global (§10.3)`,
        );
      if (kind === "mystery") {
        const mystery = item as Mystery;
        mysteries.push(mystery);
        const slot =
          round.difficulty === null ? undefined : SLOT_FOR[round.difficulty];
        if (slot !== mystery.slot)
          add(
            "X11",
            `round ${round.contentId} is slot ${mystery.slot} but the round is ${String(round.difficulty)}`,
          );
        const previousAnswer = lastAnswer.get(mystery.answer);
        if (previousAnswer && daysBetween(previousAnswer, daily.date) < 60) {
          add(
            "X13",
            `a mystery answer repeats within 60 days of ${previousAnswer} (§10.5)`,
          );
        }
        lastAnswer.set(mystery.answer, daily.date);
      }
      const previous = lastUsed.get(round.contentId);
      if (previous && daysBetween(previous, daily.date) < 365) {
        add(
          "X13",
          `round ${round.contentId} repeats within 365 days of ${previous} (§10.5)`,
        );
      }
      lastUsed.set(round.contentId, daily.date);
    }
    if (mysteries.length >= 2) {
      if (new Set(mysteries.map((m) => m.category)).size !== mysteries.length) {
        add(
          "X12",
          "the mysteries do not come from different categories (§10.3)",
        );
      }
      if (
        new Set(mysteries.map((m) => m.answerType)).size !== mysteries.length
      ) {
        add("X12", "the mysteries do not have different answer types (§10.3)");
      }
    }
  }
  return out;
}
