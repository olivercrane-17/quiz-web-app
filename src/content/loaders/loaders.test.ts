import { describe, expect, it } from "vitest";

import { CATEGORY_IDS, parseItemId, parseLocalDate } from "@/engine/types";

import { loadAnswerList } from "./answer-lists";
import { categoryById, categoryBySlug, getCategories } from "./categories";
import { loadFixtureDaily, loadFixtureRoundContent } from "./fixture-daily";
import { FIXTURE_PACK_VERSION, loadPracticePack } from "./practice";

describe("content loaders", () => {
  it("loads a category's practice pack and reports missing ones", async () => {
    const geo = await loadPracticePack("geo");
    expect(geo.ok && geo.value).toMatchObject({
      category: "geo",
      version: FIXTURE_PACK_VERSION,
    });
    expect(geo.ok && geo.value.items).toHaveLength(10);
    expect(await loadPracticePack("music")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("loads answer lists as the client projection", async () => {
    const element = await loadAnswerList("element");
    expect(element.ok && element.value.type).toBe("element");
    expect(element.ok && element.value.entities).toHaveLength(118);
    expect(await loadAnswerList("dish")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("loads fixture Dailies and the content their rounds name", async () => {
    const date = parseLocalDate("2026-11-16");
    if (date === null) throw new Error("bad date");
    const daily = await loadFixtureDaily(date);
    expect(daily?.composition).toBe("c5m1e1");
    const id = parseItemId("fx.m.film.0101");
    if (id === null) throw new Error("bad id");
    expect(await loadFixtureRoundContent(id)).toMatchObject({
      kind: "mystery",
      slot: 1,
    });
    const unknown = parseItemId("fx.m.film.0199");
    if (unknown === null) throw new Error("bad id");
    expect(await loadFixtureRoundContent(unknown)).toBeNull();
    const epoch = parseLocalDate("2026-11-16");
    if (epoch === null) throw new Error("bad date");
    expect((await loadFixtureDaily(date, epoch))?.daily.dailyNumber).toBe(1);
  });

  it("lists the 12 categories in display order", () => {
    const categories = getCategories();
    expect(categories.map((c) => c.id)).toEqual([...CATEGORY_IDS]);
    expect(categoryById("sci")?.name).toBe("Science & Tech");
    expect(categoryBySlug("food-drink")?.id).toBe("food");
    expect(categoryBySlug("cooking")).toBeNull();
  });
});
