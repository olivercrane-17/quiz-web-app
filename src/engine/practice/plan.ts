/**
 * Practice selection: `planPracticeRun` (ARCHITECTURE §4.8, PRD §3.3.1 to
 * §3.3.3). Pure and deterministic: the same pool, request and seed give the
 * same plan on every machine, whatever order the pool arrives in.
 *
 * 1. Eligible pool: the category (or all), minus the pulled-item denylist,
 *    minus items past `reviewBy`, and the monthly pack's tags if any.
 * 2. Bands by predicted rate p (./bands.ts, AC-PRA-08).
 * 3. Freshness (./seen.ts): never seen, then seen 60 or more days ago, then
 *    repeats, least recently seen first, with the `repeats_mixed_in` note
 *    (AC-PRA-05, AC-PRA-06).
 * 4. Composition: at most 1 true/false and 2 comparisons; the first
 *    question is never true/false and is the easiest in the run
 *    (AC-PRA-03). Picks are drawn in a seeded order and any pick that would
 *    break a rule is passed over for the next one. When the easiest pick is
 *    a true/false, it gives way to another item, because it can be neither
 *    first nor anywhere else.
 * 5. Option order is the choice plugin's job when the round opens, from the
 *    round's fork of the run seed (AC-PRA-04).
 *
 * Shapes, by difficulty:
 * - Easy, Medium: ten from the band; the easiest first, the rest shuffled.
 *   A band never borrows from another ("We never change a chosen band
 *   behind the player's back", PRD §3.3.3); a filter too small even with
 *   repeats gives a shorter run and `pool_exhausted`.
 * - Hard: fresh Hard items first, then the hardest fresh Medium items of the
 *   same filter (`hard_filled`). When those run out too, the plan stops
 *   empty with `hard_exhausted` so the setup can offer Hard Mixed, and only
 *   `repeats: true` ("Play with repeats") lets repeats in (AC-PRA-14): Hard
 *   repeats, then Medium repeats, each least recently seen first.
 *   `hard_filled` names a fresh Medium fill only; repeats carry their own note.
 * - Mixed: 4 Easy, 4 Medium and 2 Hard in the PRD's peak-end shape
 *   (AC-PRA-13): positions 1 to 4 the Easy items and 5 to 7 three Mediums,
 *   in non-increasing p; 8 and 9 the Hard items, the hardest at 8 or 9 by
 *   seed; 10 the Medium with the highest p. A band that is empty even with
 *   repeats borrows from its neighbour so the run still has ten questions.
 * - Ramp (Survival's order, for a fixed-length plan): Easy through
 *   position 5, Medium through 12, then Hard, each group easiest first.
 */
import { createRng, type Rng } from "../rng.ts";
import type { DifficultyBand, PracticeItem } from "../types/content.ts";
import type { ItemId } from "../types/ids.ts";
import {
  DEFAULT_PRACTICE_BANDS,
  DEFAULT_PRACTICE_RAMP,
  difficultyBandOf,
  rampBandAt,
} from "./bands.ts";
import { dayNumberOf, freshnessTier, type FreshnessTier } from "./seen.ts";
import type {
  PlanOptions,
  PracticeNote,
  PracticePlan,
  PracticeRequest,
} from "./types.ts";

/** Composition limits per run (PRD §3.3.1, §3.3.2). */
export const MAX_TRUE_FALSE = 1;
export const MAX_COMPARISONS = 2;

/** Mixed's share of each band: 4 Easy, 4 Medium and 2 Hard in ten. */
const MIXED_EASY_SHARE = 0.4;
const MIXED_HARD_SHARE = 0.2;

interface Candidate {
  item: PracticeItem;
  p: number;
  band: DifficultyBand;
  tier: FreshnessTier;
  /** The day last seen; -Infinity when never seen. */
  seenDay: number;
  /** The seeded tie-break. */
  draw: number;
}

type Order = (a: Candidate, b: Candidate) => number;

const isRepeat = (c: Candidate): boolean => c.tier === 2;
const isFresh = (c: Candidate): boolean => c.tier !== 2;

/** Freshness first; random within the fresh tiers, least recently seen among repeats. */
const preferred: Order = (a, b) => {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier === 2 && a.seenDay !== b.seenDay) return a.seenDay - b.seenDay;
  return a.draw - b.draw;
};

/** For borrowing and fills: fresh before repeats, then by p, easiest or hardest first. */
function byP(first: "easiest" | "hardest"): Order {
  return (a, b) => {
    const fresh = Number(isRepeat(a)) - Number(isRepeat(b));
    if (fresh !== 0) return fresh;
    const p = first === "easiest" ? b.p - a.p : a.p - b.p;
    return p !== 0 ? p : preferred(a, b);
  };
}

/** Highest p first; on a tie a true/false goes last, so it never opens a run it ties for. */
const easiestFirst: Order = (a, b) => {
  if (a.p !== b.p) return b.p - a.p;
  const tf = Number(a.item.format === "tf") - Number(b.item.format === "tf");
  return tf !== 0 ? tf : a.draw - b.draw;
};

const hardestFirst: Order = (a, b) =>
  a.p !== b.p ? a.p - b.p : a.draw - b.draw;

function sorted(cands: readonly Candidate[], order: Order): Candidate[] {
  return [...cands].sort(order);
}

/** Tracks what a run has taken, so no pick breaks the composition rules. */
interface Picker {
  fits(c: Candidate): boolean;
  take(c: Candidate): void;
  release(c: Candidate): void;
}

function createPicker(): Picker {
  const taken = new Set<ItemId>();
  let trueFalse = 0;
  let comparisons = 0;
  const count = (c: Candidate, delta: 1 | -1) => {
    if (c.item.format === "tf") trueFalse += delta;
    if (c.item.format === "comparison") comparisons += delta;
  };
  return {
    fits(c) {
      if (taken.has(c.item.id)) return false;
      if (c.item.format === "tf" && trueFalse >= MAX_TRUE_FALSE) return false;
      if (c.item.format === "comparison" && comparisons >= MAX_COMPARISONS) {
        return false;
      }
      return true;
    },
    take(c) {
      taken.add(c.item.id);
      count(c, 1);
    },
    release(c) {
      if (taken.delete(c.item.id)) count(c, -1);
    },
  };
}

/** Takes up to `count` candidates in the given order, passing over any that break a rule. */
function takeFrom(
  picker: Picker,
  ordered: readonly Candidate[],
  count: number,
  accept: (c: Candidate) => boolean = () => true,
): Candidate[] {
  const out: Candidate[] = [];
  for (const c of ordered) {
    if (out.length >= count) break;
    if (!accept(c) || !picker.fits(c)) continue;
    picker.take(c);
    out.push(c);
  }
  return out;
}

/**
 * Takes `target` out of `group` and puts the next acceptable item from
 * `refill` in its place. Used for a true/false that would open the run: the
 * composition rules allow one, so once it leaves, the run holds none.
 */
function replaceWith(
  group: readonly Candidate[],
  target: Candidate,
  picker: Picker,
  refill: readonly Candidate[],
  accept: (c: Candidate) => boolean = () => true,
): Candidate[] {
  picker.release(target);
  const rest = group.filter((c) => c !== target);
  const replacement = takeFrom(
    picker,
    refill,
    1,
    (c) => c.item.format !== "tf" && accept(c),
  );
  return [...rest, ...replacement];
}

/**
 * The run's easiest pick opens it, so it can't be a true/false (AC-PRA-03).
 * When it is (a tie never counts: true/false sorts last among equals), it
 * gives way to the next acceptable item from `refill`.
 */
function withoutTrueFalseOpener(
  group: Candidate[],
  picker: Picker,
  refill: readonly Candidate[],
  accept: (c: Candidate) => boolean = () => true,
): Candidate[] {
  const top = sorted(group, easiestFirst)[0];
  if (top === undefined || top.item.format !== "tf") return group;
  return replaceWith(group, top, picker, refill, accept);
}

/** The opener (the easiest, never a true/false), then the rest shuffled. */
function openerThenShuffled(
  group: readonly Candidate[],
  rng: Rng,
): Candidate[] {
  const opener = sorted(group, easiestFirst)[0];
  if (opener === undefined) return [];
  return [opener, ...rng.shuffle(group.filter((c) => c !== opener))];
}

function eligibleItems(
  pool: readonly PracticeItem[],
  req: PracticeRequest,
): PracticeItem[] {
  const tags =
    req.tags !== undefined && req.tags.length > 0 ? new Set(req.tags) : null;
  const byId = new Map<ItemId, PracticeItem>();
  for (const item of pool) {
    if (byId.has(item.id)) continue;
    if (req.category !== "mixed" && item.category !== req.category) continue;
    if (req.denylist.has(item.id)) continue;
    // LocalDate strings compare in calendar order.
    if (item.reviewBy !== null && item.reviewBy < req.today) continue;
    if (tags !== null && !item.tags.some((tag) => tags.has(tag))) continue;
    byId.set(item.id, item);
  }
  // Draws follow id order, never the order the packs arrived in.
  return [...byId.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

interface Shaped {
  picks: Candidate[];
  /** Hard only: the filter ran out before any repeat. */
  exhausted: boolean;
}

function planBand(
  cands: readonly Candidate[],
  band: DifficultyBand,
  length: number,
  rng: Rng,
): Shaped {
  const picker = createPicker();
  const ordered = sorted(
    cands.filter((c) => c.band === band),
    preferred,
  );
  const picks = withoutTrueFalseOpener(
    takeFrom(picker, ordered, length),
    picker,
    ordered,
  );
  return { picks: openerThenShuffled(picks, rng), exhausted: false };
}

function planHard(
  cands: readonly Candidate[],
  length: number,
  repeats: boolean,
  rng: Rng,
): Shaped {
  const picker = createPicker();
  const hard = sorted(
    cands.filter((c) => c.band === "hard"),
    preferred,
  );
  const medium = cands.filter((c) => c.band === "medium");
  // Before any repeat: fresh Hard, then the hardest fresh Medium.
  const freshOrder = [...hard, ...sorted(medium, byP("hardest"))];
  let picks = takeFrom(picker, freshOrder, length, isFresh);
  if (picks.length < length && !repeats) return { picks: [], exhausted: true };
  // "Play with repeats": after every fresh pick, Hard repeats and then
  // Medium repeats, each least recently seen first (AC-PRA-06), never the
  // hardest first.
  const repeatOrder = [
    ...freshOrder.filter(isFresh),
    ...hard.filter(isRepeat),
    ...sorted(medium, preferred).filter(isRepeat),
  ];
  if (picks.length < length) {
    picks = [...picks, ...takeFrom(picker, repeatOrder, length - picks.length)];
  }
  picks = repeats
    ? withoutTrueFalseOpener(picks, picker, repeatOrder)
    : withoutTrueFalseOpener(picks, picker, freshOrder, isFresh);
  return { picks: openerThenShuffled(picks, rng), exhausted: false };
}

function mixedTargets(length: number) {
  const easy = Math.round(length * MIXED_EASY_SHARE);
  const hard = Math.round(length * MIXED_HARD_SHARE);
  return { easy, hard, medium: Math.max(0, length - easy - hard) };
}

/** Fills one band's slots, then borrows from the neighbours named, in order. */
function fillSlots(
  picker: Picker,
  count: number,
  own: readonly Candidate[],
  borrow: readonly (readonly Candidate[])[],
): Candidate[] {
  const out = takeFrom(picker, own, count);
  for (const source of borrow) {
    if (out.length >= count) break;
    out.push(...takeFrom(picker, source, count - out.length));
  }
  return out;
}

function planMixed(
  cands: readonly Candidate[],
  length: number,
  rng: Rng,
): Shaped {
  const picker = createPicker();
  const targets = mixedTargets(length);
  const inBand = (band: DifficultyBand) =>
    sorted(
      cands.filter((c) => c.band === band),
      preferred,
    );
  const easyBand = inBand("easy");
  const mediumBand = inBand("medium");
  const hardBand = inBand("hard");
  const easyBorrow = [sorted(mediumBand, byP("easiest"))];
  const mediumBorrow = [
    sorted(easyBand, byP("hardest")),
    sorted(hardBand, byP("easiest")),
  ];

  let easy = fillSlots(picker, targets.easy, easyBand, easyBorrow);
  const hard = fillSlots(picker, targets.hard, hardBand, [
    sorted(mediumBand, byP("hardest")),
  ]);
  let medium = fillSlots(picker, targets.medium, mediumBand, mediumBorrow);
  // One coin, drawn before any reshaping, puts the hardest at 8 or 9.
  const hardestAtEight = rng.int(2) === 0;

  // Positions 1 to 7: the Easy slots and every Medium but the one kept for
  // position 10, easiest first. A true/false on top gives way to another
  // item from its own slots.
  const opening = () =>
    sorted([...easy, ...sorted(medium, easiestFirst).slice(1)], easiestFirst);
  const top = opening()[0];
  if (top !== undefined && top.item.format === "tf") {
    if (easy.includes(top)) {
      easy = replaceWith(easy, top, picker, [easyBand, ...easyBorrow].flat());
    } else {
      medium = replaceWith(
        medium,
        top,
        picker,
        [mediumBand, ...mediumBorrow].flat(),
      );
    }
  }

  const tenth = sorted(medium, easiestFirst)[0];
  const [hardest, second, ...others] = sorted(hard, hardestFirst);
  const hardGroup: Candidate[] = [];
  if (hardest !== undefined && second !== undefined) {
    hardGroup.push(
      ...(hardestAtEight ? [hardest, second] : [second, hardest]),
      ...others,
    );
  } else if (hardest !== undefined) {
    hardGroup.push(hardest);
  }
  const picks = [...opening(), ...hardGroup, ...(tenth ? [tenth] : [])];
  return { picks, exhausted: false };
}

function planRamp(
  cands: readonly Candidate[],
  length: number,
  ramp: PlanOptions["ramp"],
): Shaped {
  const picker = createPicker();
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (let position = 1; position <= length; position += 1) {
    counts[rampBandAt(position, ramp)] += 1;
  }
  const inBand = (band: DifficultyBand) =>
    sorted(
      cands.filter((c) => c.band === band),
      preferred,
    );
  const easyBand = inBand("easy");
  const mediumBand = inBand("medium");
  const hardBand = inBand("hard");
  const refills = [
    [easyBand, sorted(mediumBand, byP("easiest"))],
    [
      mediumBand,
      sorted(easyBand, byP("hardest")),
      sorted(hardBand, byP("easiest")),
    ],
    [hardBand, sorted(mediumBand, byP("hardest"))],
  ] as const;
  const groups = (["easy", "medium", "hard"] as const).map((band, i) => {
    const [own, ...borrow] = refills[i] ?? [[]];
    return fillSlots(picker, counts[band], own, borrow);
  });
  // The first group with items opens the run on its easiest pick.
  const first = groups.findIndex((group) => group.length > 0);
  const opening = groups[first];
  const top =
    opening === undefined ? undefined : sorted(opening, easiestFirst)[0];
  if (opening !== undefined && top !== undefined && top.item.format === "tf") {
    groups[first] = replaceWith(
      opening,
      top,
      picker,
      (refills[first] ?? []).flat(),
    );
  }
  const picks = groups.flatMap((group) => sorted(group, easiestFirst));
  return { picks, exhausted: false };
}

export function planPracticeRun(
  pool: readonly PracticeItem[],
  req: PracticeRequest,
  options: PlanOptions = {},
): PracticePlan {
  const bands = options.bands ?? DEFAULT_PRACTICE_BANDS;
  const length = Math.max(0, Math.floor(req.length));
  const rng = createRng(req.seed);
  const drawRng = rng.fork("practice:draw");
  const shapeRng = rng.fork("practice:shape");
  const today = dayNumberOf(req.today);

  const cands: Candidate[] = eligibleItems(pool, req).map((item) => ({
    item,
    p: item.predicted.p,
    band: difficultyBandOf(item.predicted.p, bands),
    tier: freshnessTier(item.id, req.seen, today),
    seenDay: req.seen.get(item.id) ?? Number.NEGATIVE_INFINITY,
    draw: drawRng.next(),
  }));

  let shaped: Shaped;
  switch (req.difficulty) {
    case "easy":
    case "medium":
      shaped = planBand(cands, req.difficulty, length, shapeRng);
      break;
    case "hard":
      shaped = planHard(cands, length, req.repeats === true, shapeRng);
      break;
    case "mixed":
      shaped = planMixed(cands, length, shapeRng);
      break;
    case "ramp":
      shaped = planRamp(cands, length, options.ramp ?? DEFAULT_PRACTICE_RAMP);
      break;
  }

  if (shaped.exhausted) return { items: [], notes: ["hard_exhausted"] };
  const picks = shaped.picks.slice(0, length);
  const notes: PracticeNote[] = [];
  // The fill of a short Hard filter is fresh Medium items. Medium repeats
  // after "Play with repeats" carry the repeats note only (PRD §3.3.1).
  if (
    req.difficulty === "hard" &&
    picks.some((c) => c.band !== "hard" && isFresh(c))
  ) {
    notes.push("hard_filled");
  }
  if (picks.some(isRepeat)) notes.push("repeats_mixed_in");
  if (picks.length < length) notes.push("pool_exhausted");
  return { items: picks.map((c) => c.item), notes };
}
