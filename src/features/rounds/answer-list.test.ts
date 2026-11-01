import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as loaders from "@/content/loaders/answer-lists";
import { parseEntityId, type EntityId } from "@/engine/types";

import {
  answerListFor,
  answerListHandleOf,
  isMysteryAnswerList,
  preloadAnswerLists,
  resetAnswerListsForTests,
  useAnswerList,
} from "./answer-list";

beforeEach(() => {
  resetAnswerListsForTests();
});

const none = new Set<EntityId>();

describe("the answer list handle", () => {
  it("loads the fixture list for a type, then suggests from it", async () => {
    const first = answerListFor("country");
    expect(first.status).toBe("loading");
    expect(first.suggest("arv", none)).toEqual([]);
    await waitFor(() => {
      expect(answerListFor("country").status).toBe("ready");
    });
    const ready = answerListFor("country");
    expect(ready).not.toBe(first);
    const rows = ready.suggest("arv", none);
    expect(rows[0]).toMatchObject({
      display: "Arvenna",
      alreadyGuessed: false,
    });
    expect(rows[0]?.match).toEqual({ start: 0, end: 3 });
    // The same snapshot until something changes.
    expect(answerListFor("country")).toBe(ready);
  });

  it("finds an alias, flags guessed entities and selects exact names only", async () => {
    await waitFor(() => {
      expect(answerListFor("country").status).toBe("ready");
    });
    const list = answerListFor("country");
    const arvenna = parseEntityId("fx.x.country.arvenna") as EntityId;
    expect(list.suggest("arven republic", new Set([arvenna]))).toEqual([
      {
        entityId: arvenna,
        display: "Arvenna",
        alreadyGuessed: true,
        match: null,
      },
    ]);
    expect(list.exactMatch("Arven Republic", none)?.entityId).toBe(arvenna);
    expect(list.exactMatch("arv", none)).toBeNull();
    expect(list.search("a", none).total).toBeGreaterThan(
      list.search("a", none).rows.length,
    );
    expect(list.search("a", none).rows).toHaveLength(6);
  });

  it("reads failed when a list can't load, and retries", async () => {
    const load = vi.spyOn(loaders, "loadAnswerList");
    load.mockResolvedValueOnce({ ok: false, error: "failed" });
    preloadAnswerLists(["film", null]);
    await waitFor(() => {
      expect(answerListFor("film").status).toBe("failed");
    });
    expect(answerListFor("film").suggest("the", none)).toEqual([]);
    answerListFor("film").retry();
    expect(answerListFor("film").status).toBe("loading");
    await waitFor(() => {
      expect(answerListFor("film").status).toBe("ready");
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("re-renders a hook as the list loads, and gives null without a type", async () => {
    const { result, rerender } = renderHook(
      ({ type }: { type: "element" | null }) => useAnswerList(type),
      { initialProps: { type: "element" as "element" | null } },
    );
    expect(result.current?.status).toBe("loading");
    await waitFor(() => {
      expect(result.current?.status).toBe("ready");
    });
    expect(result.current?.suggest("helium", none)[0]?.display).toBe("Helium");
    act(() => {
      rerender({ type: null });
    });
    expect(result.current).toBeNull();
  });

  it("gives the judge each active entry's display and option label", async () => {
    const result = await loaders.loadEntityLookup("person");
    if (!result.ok) throw new Error(result.error);
    const sculptor = parseEntityId(
      "fx.x.person.ada-morrow-sculptor",
    ) as EntityId;
    expect(result.value.get(sculptor)).toEqual({
      id: sculptor,
      display: "Ada Morrow (sculptor)",
      optionLabel: "Ada Morrow (sculptor)",
    });
    const odile = parseEntityId("fx.x.person.odile-marsh") as EntityId;
    expect(result.value.get(odile)?.optionLabel).toBe(
      "Odile Marsh (cartographer)",
    );
    expect(
      result.value.get(parseEntityId("fx.x.person.nobody") as EntityId),
    ).toBeNull();
    expect(await loaders.loadEntityLookup("dish")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("wraps a list in memory, and tells extended handles from plain ones", () => {
    const handle = answerListHandleOf({
      type: "sport",
      version: "t",
      entities: [
        {
          id: parseEntityId("x.sport.curling") as EntityId,
          display: "Curling",
          keys: ["curling"],
          popularity: 0,
        },
      ],
    });
    expect(handle.status).toBe("ready");
    expect(handle.type).toBe("sport");
    expect(handle.suggest("curl", none)).toHaveLength(1);
    expect(isMysteryAnswerList(handle)).toBe(true);
    expect(isMysteryAnswerList({ status: "ready", suggest: () => [] })).toBe(
      false,
    );
    expect(isMysteryAnswerList(null)).toBe(false);
  });
});
