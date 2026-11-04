import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CATEGORY_IDS, parseItemId, parseLocalDate } from "@/engine/types";

import { ANSWER_LISTS, PRACTICE_PACKS } from "../generated/manifest";
import { loadAnswerList, loadEntityLookup } from "./answer-lists";
import { resetBankForTests } from "./bank";
import { categoryById, categoryBySlug, getCategories } from "./categories";
import { loadFixtureDaily, loadFixtureRoundContent } from "./fixture-daily";
import { loadPracticePack, loadPracticePool } from "./practice";
import {
  contentWorld,
  resetContentWorldForTests,
  selectContentWorld,
} from "./world";

const PUBLIC = join(process.cwd(), "public");

/** A fetch that serves public/ the way the CDN does, and counts its calls. */
function servePublic() {
  const fetchMock = vi.fn(async (url: string) => {
    try {
      const body = readFileSync(join(PUBLIC, url), "utf8");
      return new Response(body, { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  resetContentWorldForTests();
  resetBankForTests();
});

describe("content loaders in the fixture world", () => {
  it("is the world unit tests play, as the mock backend does", () => {
    expect(contentWorld()).toBe("fixtures");
  });

  it("loads a category's practice pack and reports missing ones", async () => {
    const geo = await loadPracticePack("geo");
    expect(geo.ok && geo.value.category).toBe("geo");
    expect(geo.ok && geo.value.version).toMatch(/^[0-9a-f]{8}$/);
    expect(geo.ok && geo.value.items).toHaveLength(10);
    expect(
      geo.ok && geo.value.items.every((item) => item.id.startsWith("fx.")),
    ).toBe(true);
    expect(await loadPracticePack("music")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("loads answer lists as the client projection, and the judge's view of them", async () => {
    const element = await loadAnswerList("element");
    expect(element.ok && element.value.type).toBe("element");
    expect(element.ok && element.value.entities).toHaveLength(118);
    expect(await loadAnswerList("dish")).toEqual({
      ok: false,
      error: "not_found",
    });
    const people = await loadEntityLookup("person");
    if (!people.ok) throw new Error("no lookup");
    const list = await loadAnswerList("person");
    if (!list.ok) throw new Error("no list");
    const first = list.value.entities[0];
    if (first === undefined) throw new Error("empty list");
    // Every person carries a descriptor, so the option label has a bracket.
    expect(people.value.get(first.id)?.optionLabel).toMatch(/\(.+\)$/);
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

describe("content loaders on the bank", () => {
  it("fetch each pack once from its hashed URL in the manifest and decode it", async () => {
    selectContentWorld("bank");
    const fetchMock = servePublic();
    const entry = PRACTICE_PACKS.geo;
    if (entry === undefined) throw new Error("no geography pack");
    const geo = await loadPracticePack("geo");
    if (!geo.ok) throw new Error(geo.error);
    expect(geo.value.version).toBe(entry.version);
    expect(geo.value.items).toHaveLength(entry.items);
    expect(geo.value.items.every((item) => item.category === "geo")).toBe(true);
    // The bank ships real items only: no fixture leaks into a pack.
    expect(geo.value.items.some((item) => item.id.startsWith("fx."))).toBe(
      false,
    );
    expect(fetchMock).toHaveBeenCalledWith(entry.url, {
      credentials: "same-origin",
    });
    await loadPracticePack("geo");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves Mixed from every category's pack", async () => {
    selectContentWorld("bank");
    servePublic();
    const pool = await loadPracticePool("mixed");
    if (!pool.ok) throw new Error(pool.error);
    const total = Object.values(PRACTICE_PACKS).reduce(
      (sum, entry) => sum + entry.items,
      0,
    );
    expect(pool.value).toHaveLength(total);
    expect(new Set(pool.value.map((item) => item.category)).size).toBe(
      Object.keys(PRACTICE_PACKS).length,
    );
  });

  it("loads a list as the client projection, and leaves the judge's view to the server", async () => {
    selectContentWorld("bank");
    servePublic();
    const entry = ANSWER_LISTS.country;
    if (entry === undefined) throw new Error("no country list");
    const countries = await loadAnswerList("country");
    if (!countries.ok) throw new Error(countries.error);
    expect(countries.value.version).toBe(entry.version);
    expect(countries.value.entities).toHaveLength(entry.entities);
    expect(await loadEntityLookup("country")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("answers offline with no network, failed on a bad file, and retries after either", async () => {
    selectContentWorld("bank");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(false);
    expect(await loadPracticePack("hist")).toEqual({
      ok: false,
      error: "offline",
    });
    online.mockReturnValue(true);
    expect(await loadPracticePack("hist")).toEqual({
      ok: false,
      error: "failed",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"category":"geo"}', { status: 200 })),
    );
    expect(await loadPracticePack("hist")).toEqual({
      ok: false,
      error: "failed",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 404 })),
    );
    expect(await loadAnswerList("film")).toEqual({
      ok: false,
      error: "failed",
    });
    servePublic();
    expect((await loadPracticePack("hist")).ok).toBe(true);
    expect((await loadAnswerList("film")).ok).toBe(true);
  });
});
