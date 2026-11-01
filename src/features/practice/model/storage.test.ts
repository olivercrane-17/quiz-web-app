import { describe, expect, it } from "vitest";

import { parseItemId, type ItemId } from "@/engine/types";
import { createKv, createMemoryStorage } from "@/platform/storage";

import {
  HISTORY_KEY,
  MAX_HISTORY,
  appendHistory,
  decodeHistory,
  decodeHistoryEntry,
  decodeRequest,
  decodeStoredRun,
  findHistoryEntry,
  readHistory,
  type PracticeHistoryEntry,
} from "./storage";

function id(text: string): ItemId {
  const parsed = parseItemId(text);
  if (parsed === null) throw new Error(text);
  return parsed;
}

const REQUEST = {
  mode: "quick",
  category: "mixed",
  difficulty: "mixed",
  repeats: false,
} as const;

function entry(runId: string, finishedAt = 1): PracticeHistoryEntry {
  return {
    runId,
    mode: "practice",
    request: REQUEST,
    score: 7,
    maxPoints: 10,
    startedAt: 0,
    finishedAt,
    questions: [
      { itemId: id("p.geo.0001"), correct: true, chosen: 0 },
      { itemId: id("p.geo.0002"), correct: false, chosen: 2 },
      { itemId: id("p.geo.0003"), correct: false, chosen: null },
    ],
  };
}

describe("practice storage", () => {
  it("decodes a request and refuses anything else", () => {
    expect(decodeRequest(REQUEST)).toEqual(REQUEST);
    expect(decodeRequest({ ...REQUEST, category: "maths" })).toBeNull();
    expect(decodeRequest({ ...REQUEST, difficulty: "ramp" })).toBeNull();
    expect(decodeRequest({ ...REQUEST, repeats: "yes" })).toBeNull();
    expect(decodeRequest(null)).toBeNull();
  });

  it("keeps the history newest first, at most 100 runs, one entry per run", () => {
    const kv = createKv({ storage: createMemoryStorage() });
    for (let i = 0; i < MAX_HISTORY + 5; i += 1) {
      appendHistory(kv, entry(`run-${i}`, i));
    }
    const runs = readHistory(kv);
    expect(runs).toHaveLength(MAX_HISTORY);
    expect(runs[0]?.runId).toBe(`run-${MAX_HISTORY + 4}`);
    appendHistory(kv, { ...entry("run-50"), score: 3 });
    const again = readHistory(kv);
    expect(again.filter((run) => run.runId === "run-50")).toHaveLength(1);
    expect(again[0]).toMatchObject({ runId: "run-50", score: 3 });
  });

  it("round-trips an entry through its compact stored form", () => {
    const kv = createKv({ storage: createMemoryStorage() });
    appendHistory(kv, entry("a"));
    expect(readHistory(kv)).toEqual([entry("a")]);
    const raw = kv.readRaw(HISTORY_KEY);
    expect(raw.state === "ok" && raw.value).toMatchObject({
      v: 1,
      runs: [
        {
          questions: [
            ["p.geo.0001", 1, 0],
            ["p.geo.0002", 0, 2],
            ["p.geo.0003", 0, null],
          ],
        },
      ],
    });
  });

  it("finds the run asked for, else the newest", () => {
    const kv = createKv({ storage: createMemoryStorage() });
    appendHistory(kv, entry("old", 1));
    appendHistory(kv, entry("new", 2));
    expect(findHistoryEntry(kv, "old")?.runId).toBe("old");
    expect(findHistoryEntry(kv, "missing")?.runId).toBe("new");
    expect(findHistoryEntry(kv, null)?.runId).toBe("new");
    expect(
      findHistoryEntry(createKv({ storage: createMemoryStorage() }), null),
    ).toBeNull();
  });

  it("drops a history entry that doesn't decode and keeps the rest", () => {
    const good = { ...entry("good"), questions: [["p.geo.0001", 1, 0]] };
    expect(
      decodeHistory({
        v: 1,
        runs: [good, { runId: 3 }, { ...good, questions: [["nope", 1, 0]] }],
      }),
    ).toEqual([{ ...entry("good"), questions: [entry("good").questions[0]] }]);
    expect(decodeHistory({ v: 2, runs: [] })).toBeNull();
    expect(decodeHistoryEntry({ ...good, mode: "daily" })).toBeNull();
    expect(
      decodeHistoryEntry({ ...good, questions: [["p.geo.0001", 2, 0]] }),
    ).toBeNull();
    expect(
      decodeHistoryEntry({ ...good, questions: [["p.geo.0001", 1, -1]] }),
    ).toBeNull();
  });

  it("quarantines a history that isn't one, so the next run starts it again", () => {
    const storage = createMemoryStorage({ "qz:history": '"not a history"' });
    const kv = createKv({ storage });
    expect(readHistory(kv)).toEqual([]);
    expect(storage.getItem("qz:quarantine:history")).toBe('"not a history"');
  });

  it("refuses stored runs that are broken or not practice runs", () => {
    expect(decodeStoredRun(null)).toBeNull();
    expect(decodeStoredRun({ v: 2 })).toBeNull();
    const minimal = {
      v: 1,
      savedAt: 1,
      request: REQUEST,
      itemIds: ["p.geo.0001"],
      notes: [],
      snapshot: {
        config: {
          mode: "practice",
          sealed: false,
          rounds: [
            {
              index: 0,
              type: "mc",
              difficulty: "easy",
              category: "geo",
              answerType: null,
              ordinal: 1,
              ofType: 1,
              maxPoints: 1,
              voided: false,
            },
          ],
          endRule: { kind: "fixed" },
          timing: { kind: "untimed" },
          scoring: "practice",
          seed: "s",
          runId: "s",
        },
        slots: [
          {
            meta: {
              index: 0,
              type: "mc",
              difficulty: "easy",
              category: "geo",
              answerType: null,
              ordinal: 1,
              ofType: 1,
              maxPoints: 1,
              voided: false,
            },
            open: null,
            client: null,
            reveal: null,
            outcome: null,
            openedAt: null,
            resolvedAt: null,
            requests: 0,
            activeMs: 0,
            hiddenMs: 0,
          },
        ],
        score: 0,
        strikes: 0,
        startedAt: 0,
        index: 0,
      },
    };
    expect(decodeStoredRun(minimal)?.itemIds).toEqual(["p.geo.0001"]);
    expect(
      decodeStoredRun({ ...minimal, itemIds: ["p.geo.0001", "p.geo.0002"] }),
    ).toBeNull();
    expect(decodeStoredRun({ ...minimal, itemIds: ["bad"] })).toBeNull();
    expect(decodeStoredRun({ ...minimal, notes: ["surprise"] })).toBeNull();
    const sealed = {
      ...minimal,
      snapshot: {
        ...minimal.snapshot,
        config: { ...minimal.snapshot.config, sealed: true },
      },
    };
    expect(decodeStoredRun(sealed)).toBeNull();
    const daily = {
      ...minimal,
      snapshot: {
        ...minimal.snapshot,
        config: { ...minimal.snapshot.config, mode: "daily" },
      },
    };
    expect(decodeStoredRun(daily)).toBeNull();
    const outOfRange = {
      ...minimal,
      snapshot: { ...minimal.snapshot, index: 1 },
    };
    expect(decodeStoredRun(outOfRange)).toBeNull();
    const revealWithoutOpen = {
      ...minimal,
      snapshot: {
        ...minimal.snapshot,
        slots: [{ ...minimal.snapshot.slots[0], reveal: { family: "choice" } }],
      },
    };
    expect(decodeStoredRun(revealWithoutOpen)).toBeNull();
  });
});
