// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { DAILY_EPOCH } from "@/config/shared";
import { PLUGINS } from "@/engine/rounds";
import { normalizeName } from "@/engine/suggest/normalize";
import { addDays, daysBetween } from "@/engine/time";
import {
  ANSWER_TYPES,
  CATEGORY_IDS,
  DIFFICULTY_BANDS,
  ROUND_TYPES,
  parseLocalDate,
  type LocalDate,
} from "@/engine/types";
import { AnswerListSchema } from "@/content/schema/answer-lists";
import {
  CATEGORY_CODES,
  ANSWER_TYPES as SCHEMA_ANSWER_TYPES,
  DIFFICULTY_BANDS as SCHEMA_DIFFICULTY_BANDS,
} from "@/content/schema/primitives";
import {
  EncoreSchema,
  MysterySchema,
  PracticeItemSchema,
  RoomPackSchema,
} from "@/content/schema/items";
import {
  ROUND_TYPES as SCHEMA_ROUND_TYPES,
  ScheduleMonthSchema,
  SpareSetSchema,
} from "@/content/schema/schedule";

import {
  decodeAnswerList,
  decodeEncore,
  decodeMystery,
  decodePracticeItem,
  decodeRoomPack,
  decodeScheduleMonth,
  decodeSpareSet,
  type DecodedAnswerList,
} from "./decode";
import {
  FIXTURE_LIST_FILES,
  FIXTURE_LIST_TYPES,
  entityLookupOf,
  loadFixtureList,
} from "./lists";
import { FIXTURE_PRACTICE_FILES, FIXTURE_PRACTICE_ITEMS } from "./practice";
import {
  FIXTURE_CHOICES,
  FIXTURE_DAILY_CHOICES,
  FIXTURE_ENCORES,
  FIXTURE_MYSTERIES,
  FIXTURE_ROOM_PACKS,
  FIXTURE_SCHEDULE,
  FIXTURE_SEALED_FILES,
  FIXTURE_SPARES,
  fixtureDailyFor,
  fixtureRoundContent,
} from "./sealed";

const ROOT = join(process.cwd(), "content", "fixtures");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? walk(path)
      : [relative(ROOT, path).split(sep).join("/")];
  });
}

const FILES = walk(ROOT)
  .filter((file) => file.endsWith(".json"))
  .sort();
const read = (file: string): unknown =>
  JSON.parse(readFileSync(join(ROOT, file), "utf8"));
const inFolder = (folder: string) =>
  FILES.filter((file) => file.startsWith(`${folder}/`));

function date(text: string): LocalDate {
  const parsed = parseLocalDate(text);
  if (parsed === null) throw new Error(text);
  return parsed;
}

const LISTS = new Map<string, DecodedAnswerList>(
  inFolder("answer-lists").map((file) => {
    const decoded = decodeAnswerList(read(file), file);
    return [decoded.list.type, decoded];
  }),
);

describe("content/fixtures", () => {
  it("every fixture file decodes into the §3 types", () => {
    const decoders: Record<string, (raw: unknown, path: string) => unknown> = {
      practice: decodePracticeItem,
      "answer-lists": decodeAnswerList,
      mysteries: decodeMystery,
      encores: decodeEncore,
      "room-packs": decodeRoomPack,
      schedule: decodeScheduleMonth,
      spares: decodeSpareSet,
    };
    for (const file of FILES) {
      const folder = file.split("/")[0] ?? "";
      const decode = decoders[folder];
      expect(decode, `${file} sits in a known folder`).toBeDefined();
      expect(() => decode?.(read(file), file), file).not.toThrow();
    }
    expect(FILES.length).toBe(40 + 5 + 6 + 3 + 2 + 1 + 6);
  });

  it("every fixture file passes its content source schema too", () => {
    const schemas: Record<
      string,
      { safeParse(raw: unknown): { success: boolean } }
    > = {
      practice: PracticeItemSchema,
      "answer-lists": AnswerListSchema,
      mysteries: MysterySchema,
      encores: EncoreSchema,
      "room-packs": RoomPackSchema,
      schedule: ScheduleMonthSchema,
      spares: SpareSetSchema,
    };
    for (const file of FILES) {
      const schema = schemas[file.split("/")[0] ?? ""];
      expect(schema?.safeParse(read(file)).success, file).toBe(true);
    }
  });

  it("bundles exactly the files on disk", () => {
    expect([...FIXTURE_PRACTICE_FILES].sort()).toEqual(inFolder("practice"));
    expect([...FIXTURE_LIST_FILES].sort()).toEqual(inFolder("answer-lists"));
    expect([...FIXTURE_SEALED_FILES].sort()).toEqual(
      FILES.filter(
        (file) =>
          !file.startsWith("practice/") && !file.startsWith("answer-lists/"),
      ),
    );
  });

  it("agrees with the content schema on categories, answer types, bands and round types", () => {
    expect([...CATEGORY_IDS]).toEqual([...CATEGORY_CODES]);
    expect([...ANSWER_TYPES]).toEqual([...SCHEMA_ANSWER_TYPES]);
    expect([...DIFFICULTY_BANDS]).toEqual([...SCHEMA_DIFFICULTY_BANDS]);
    expect(ROUND_TYPES.filter((type) => type !== "ordering")).toEqual([
      ...SCHEMA_ROUND_TYPES,
    ]);
  });
});

describe("fixture practice items", () => {
  const items = FIXTURE_PRACTICE_ITEMS;

  it("holds 40 items across four categories, true/false and comparisons included", () => {
    expect(items).toHaveLength(40);
    const byCategory = new Map<string, number>();
    for (const item of items)
      byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
    expect(Object.fromEntries(byCategory)).toEqual({
      geo: 10,
      hist: 10,
      sci: 10,
      food: 10,
    });
    expect(items.filter((item) => item.format === "tf")).toHaveLength(4);
    expect(items.filter((item) => item.format === "comparison")).toHaveLength(
      4,
    );
    expect(
      items.filter((item) => item.order === "ascending").length,
    ).toBeGreaterThanOrEqual(4);
    expect(items.some((item) => item.options.length === 3)).toBe(true);
  });

  it("gives Geography 3 Hard and 7 Medium items for the short Hard filter (AC-PRA-14 fixture)", () => {
    const geo = items.filter((item) => item.category === "geo");
    expect(geo.filter((item) => item.predicted.p < 0.45)).toHaveLength(3);
    expect(
      geo.filter((item) => item.predicted.p >= 0.45 && item.predicted.p < 0.75),
    ).toHaveLength(7);
    // A Hard Geography run takes all ten, so the category itself obeys the
    // composition rules: one true/false, at most two comparisons, and the
    // easiest item is not the true/false one.
    expect(geo.filter((item) => item.format === "tf")).toHaveLength(1);
    expect(
      geo.filter((item) => item.format === "comparison").length,
    ).toBeLessThanOrEqual(2);
    const easiest = [...geo].sort((a, b) => b.predicted.p - a.predicted.p)[0];
    expect(easiest?.format).not.toBe("tf");
  });

  it("offers every band in the mixed pool for Quick play", () => {
    const easy = items.filter((item) => item.predicted.p >= 0.75).length;
    const hard = items.filter((item) => item.predicted.p < 0.45).length;
    expect(easy).toBeGreaterThanOrEqual(4);
    expect(items.length - easy - hard).toBeGreaterThanOrEqual(4);
    expect(hard).toBeGreaterThanOrEqual(2);
  });

  it("builds options the way the content build does", () => {
    for (const item of items) {
      expect(item.correct).toBeGreaterThanOrEqual(0);
      expect(item.correct).toBeLessThan(item.options.length);
      if (item.format === "tf") {
        expect(item.options).toEqual(["True", "False"]);
        expect(item.order).toBe("fixed");
      }
      if (item.format === "comparison") {
        expect(item.order).toBe("shuffle");
        expect(item.valueDisplay).toHaveLength(2);
      } else {
        expect(item.valueDisplay).toBeNull();
      }
      expect(item.id.startsWith("fx.p.")).toBe(true);
    }
  });
});

describe("fixture answer lists", () => {
  it("ships the five lists of §5.6 at their sizes", () => {
    expect([...LISTS.keys()].sort()).toEqual([...FIXTURE_LIST_TYPES].sort());
    expect(LISTS.get("country")?.list.entities).toHaveLength(120);
    expect(LISTS.get("film")?.list.entities).toHaveLength(60);
    expect(LISTS.get("element")?.list.entities).toHaveLength(118);
    expect(LISTS.get("person")?.list.entities).toHaveLength(40);
    expect(LISTS.get("music_artist")?.list.entities).toHaveLength(32);
  });

  it("projects each entry with normalized keys, name first, then aliases", () => {
    const czech = LISTS.get("country")?.list.entities.find(
      (e) => e.display === "Évrenne",
    );
    expect(czech?.keys).toEqual(["evrenne", "evrenne republic"]);
    const amber = LISTS.get("country")?.list.entities.find(
      (e) => e.display === "The Amber Isles",
    );
    expect(amber?.keys).toEqual(["amber isles", "amber islands"]);
    const aluminium = LISTS.get("element")?.list.entities.find(
      (e) => e.display === "Aluminium",
    );
    expect(aluminium?.keys).toEqual(["aluminium", "aluminum"]);
    for (const decoded of LISTS.values()) {
      for (const entity of decoded.list.entities) {
        expect(entity.keys[0]).toBe(normalizeName(entity.keys[0] ?? ""));
        expect(entity.popularity).toBe(0);
      }
    }
  });

  it("shows films with their year and labels described types with their descriptor", () => {
    for (const entity of LISTS.get("film")?.list.entities ?? []) {
      expect(entity.display).toMatch(/ \(\d{4}\)$/);
    }
    const people = LISTS.get("person")?.records ?? [];
    expect(people.every((record) => /\(.+\)$/.test(record.optionLabel))).toBe(
      true,
    );
    // Two people share a name, so their displays carry the descriptor (CONTENT_GUIDE §2.10).
    expect(
      people
        .filter((record) => record.display.startsWith("Ada Morrow ("))
        .map((r) => r.display),
    ).toEqual(["Ada Morrow (cartographer)", "Ada Morrow (sculptor)"]);
    const artists = LISTS.get("music_artist")?.records ?? [];
    expect(
      artists.find((record) => record.display === "Marla Venn")?.optionLabel,
    ).toBe("Marla Venn (violinist)");
    const elements = LISTS.get("element")?.records ?? [];
    expect(
      elements.every((record) => record.optionLabel === record.display),
    ).toBe(true);
  });

  it("loads lazily, once, and answers lookups the way the judge needs", async () => {
    const country = await loadFixtureList("country");
    expect(await loadFixtureList("country")).toBe(country);
    expect(await loadFixtureList("city")).toBeNull();
    if (country === null) throw new Error("no country list");
    const lookup = entityLookupOf(country);
    expect(lookup.get("fx.x.country.arvenna" as never)?.display).toBe(
      "Arvenna",
    );
    expect(lookup.get("fx.x.country.atlantis" as never)).toBeNull();
  });
});

describe("fixture mysteries, encores and packs", () => {
  it("has six mysteries, two per slot, each on a list that holds its entities", () => {
    expect(FIXTURE_MYSTERIES.size).toBe(6);
    const slots = [...FIXTURE_MYSTERIES.values()].map((m) => m.slot).sort();
    expect(slots).toEqual([1, 1, 2, 2, 3, 3]);
    for (const mystery of FIXTURE_MYSTERIES.values()) {
      const records = new Set(
        LISTS.get(mystery.answerType)?.records.map((r) => r.id),
      );
      for (const id of [
        mystery.answer,
        ...mystery.distractors,
        ...mystery.accepted,
      ]) {
        expect(records.has(id), `${mystery.id}: ${id}`).toBe(true);
      }
      expect(new Set(mystery.distractors).size).toBe(3);
      expect(mystery.clues).toHaveLength(4);
      const s = mystery.predicted.solveByClue;
      expect(s[0] <= s[1] && s[1] <= s[2] && s[2] <= s[3]).toBe(true);
    }
  });

  it("has three encores: a count, a year and a quantity with a decimal", () => {
    const encores = [...FIXTURE_ENCORES.values()];
    expect(encores.map((e) => [e.valueKind, e.decimals])).toEqual([
      ["quantity", 0],
      ["year", 0],
      ["quantity", 1],
    ]);
    const year = encores.find((e) => e.valueKind === "year");
    expect(year).toMatchObject({ unit: "", unitShort: "", unitLabel: "" });
  });

  it("has one hostable 15-question room pack, and the Daily choice rounds apart from it", () => {
    // The Dailies' sealed choice rounds must never be hostable in a room.
    expect([...FIXTURE_ROOM_PACKS.keys()]).toEqual(["fx-party"]);
    const [party] = FIXTURE_ROOM_PACKS.values();
    expect(party?.pack.questionIds).toHaveLength(15);
    const daily = [...FIXTURE_DAILY_CHOICES.values()];
    expect(daily).toHaveLength(15);
    expect(daily.every((q) => q.id.startsWith("fx.r.dly."))).toBe(true);
    for (const questions of [party?.questions ?? [], daily]) {
      expect(new Set(questions.map((q) => q.options[q.correct])).size).toBe(15);
      for (const question of questions) {
        expect(question.options).toHaveLength(4);
        expect(question.kind).toBe("choice");
      }
    }
    // fixtureRoundContent still finds both kinds.
    expect(FIXTURE_CHOICES.size).toBe(30);
    for (const question of daily) {
      expect(fixtureRoundContent(question.id)).toBe(question);
    }
  });
});

describe("fixture Dailies", () => {
  it("schedules [mc ×9, encore] and [mc ×5, mystery, encore] on two fixed dates, each out of 9 (the AC-DLY-09 fixtures)", () => {
    const max = (types: readonly string[]) =>
      types.reduce(
        (sum, type) =>
          sum + PLUGINS[type as keyof typeof PLUGINS].maxPoints({} as never),
        0,
      );
    const nine = fixtureDailyFor(date("2026-11-15"));
    expect(nine?.composition).toBe("c9e1");
    expect(nine?.source).toEqual({ kind: "schedule" });
    expect(
      nine?.rounds
        .slice(0, 9)
        .every((r) => r.type === "mc" && r.contentId.startsWith("fx.r.dly.")),
    ).toBe(true);
    expect(max(nine?.rounds.map((r) => r.type) ?? [])).toBe(9);
    const five = fixtureDailyFor(date("2026-11-16"));
    expect(five?.composition).toBe("c5m1e1");
    expect(max(five?.rounds.map((r) => r.type) ?? [])).toBe(9);
    expect(FIXTURE_SCHEDULE.map((row) => row.date)).toEqual([
      "2026-11-15",
      "2026-11-16",
    ]);
  });

  it("gives every date of the e2e window a Daily whose rounds all resolve", () => {
    const start = date("2026-11-01");
    const days = daysBetween(start, date("2028-12-31"));
    for (let i = 0; i <= days; i += 1) {
      const day = addDays(start, i);
      const daily = fixtureDailyFor(day);
      expect(daily, day).not.toBeNull();
      for (const round of daily?.rounds ?? []) {
        const content = fixtureRoundContent(round.contentId);
        expect(content, `${day} ${round.contentId}`).not.toBeNull();
        if (round.type === "mystery") {
          expect(content).toMatchObject({
            kind: "mystery",
            slot: { easy: 1, medium: 2, hard: 3 }[round.difficulty ?? "easy"],
          });
        }
      }
    }
  });

  it("cycles the six spares by Daily number: set A on odd numbers, set B on even", () => {
    // spare-NN today, spare.NN once CNT-1 renames the ids (§2.4): either
    // spelling passes, so the rename touches content files only.
    const spareNumber = (id: string | undefined) =>
      /^spare[.-](\d{2})$/.exec(id ?? "")?.[1] ?? null;
    expect(FIXTURE_SPARES.map((spare) => spareNumber(spare.id))).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
    ]);
    const first = fixtureDailyFor(DAILY_EPOCH);
    expect(first?.daily.dailyNumber).toBe(1);
    expect(first?.source.kind).toBe("spare");
    expect(
      spareNumber(first?.source.kind === "spare" ? first.source.spareId : ""),
    ).toBe("01");
    expect(first?.composition).toBe("m3e1");
    expect(first?.rounds.map((r) => r.contentId)).toEqual([
      "fx.m.film.0101",
      "fx.m.sci.0101",
      "fx.m.geo.0101",
      "fx.e.0101",
    ]);
    const daily42 = fixtureDailyFor(date("2026-11-01"));
    expect(daily42?.daily).toEqual({ dailyNumber: 42, date: "2026-11-01" });
    expect(
      spareNumber(
        daily42?.source.kind === "spare" ? daily42.source.spareId : "",
      ),
    ).toBe("06");
    expect(daily42?.rounds.map((r) => r.contentId)).toEqual([
      "fx.m.hist.0101",
      "fx.m.geo.0102",
      "fx.m.sci.0102",
      "fx.e.0103",
    ]);
    for (const spare of FIXTURE_SPARES) {
      const mysteries = spare.rounds
        .filter((r) => r.type === "mystery")
        .map((r) => FIXTURE_MYSTERIES.get(r.contentId));
      expect(new Set(mysteries.map((m) => m?.category)).size).toBe(3);
      expect(new Set(mysteries.map((m) => m?.answerType)).size).toBe(3);
    }
  });

  it("has no Daily before the epoch", () => {
    expect(fixtureDailyFor(date("2026-09-20"))).toBeNull();
    expect(
      fixtureDailyFor(date("2026-09-20"), date("2026-01-01")),
    ).not.toBeNull();
  });
});
