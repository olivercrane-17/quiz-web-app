// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import {
  fxEncore,
  fxFiles,
  fxMc,
  fxMystery,
  fxPack,
  fxRoomQuestion,
  fxTf,
  itemOf,
  loadFx,
  removeTempDirs,
} from "./__fixtures__/builders.ts";
import { createHash } from "node:crypto";

import {
  coldStages,
  coldView,
  orderSeed,
  packetEntry,
  packetFiles,
  packetSha256,
  revealView,
  shuffleFor,
} from "./packets.ts";
import { deriveSealKeys } from "./seal.ts";

/** A throwaway content key's order key. */
const ORDER = deriveSealKeys(Buffer.alloc(32, 9)).order;

afterAll(removeTempDirs);

const PACK = "room-packs/fx-party.json";

/** Every string anywhere in a JSON value. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
}

function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => [
      key,
      ...keys(child),
    ]);
  }
  return [];
}

const NEVER_IN_COLD = [
  "answer",
  "wrong",
  "key",
  "claims",
  "risk",
  "riskReason",
  "writerNotes",
  "verification",
  "predicted",
  "seededDifficulty",
  "counterintuitive",
  "explanation",
  "learnMore",
  "tfKind",
  "values",
  "valueDisplay",
  "rivals",
  "likelyGuesses",
  "giveawayTerms",
  "seedSolveShares",
  "accepted",
  "slot",
  "tags",
  "lintAllow",
  "derivation",
  "bands",
];

async function bankWithEverything() {
  const verified = fxMc({
    writerNotes: "SECRET-WRITER-NOTE",
    lintAllow: [{ rule: "C19", text: "x", reason: "SECRET-LINT-REASON" }],
  });
  return loadFx(
    fxFiles({
      "practice/geography/fx.p.geo.0101.json": verified,
      [PACK]: fxPack([fxRoomQuestion(1)]),
    }),
  );
}

describe("cold packets", () => {
  it("carry no key, notes, claims, risk, verification or difficulty, for every kind", async () => {
    const bank = await bankWithEverything();
    for (const record of bank.items) {
      for (const pass of ["A", "B", "T"] as const) {
        const cold = coldView(bank, record, pass);
        const fields = keys(cold);
        for (const banned of NEVER_IN_COLD)
          expect(fields, `${record.id} ${banned}`).not.toContain(banned);
        const text = strings(cold).join(" ");
        expect(text).not.toContain("SECRET");
        expect(text).not.toContain(record.item.explanation);
        for (const claim of record.item.claims)
          expect(text).not.toContain(claim.text);
      }
    }
  });

  it("shuffles options with a keyed seed, so the public inputs never give the key's position away", async () => {
    const bank = await bankWithEverything();
    const record = itemOf(bank, "fx.p.geo.0101");
    const a = coldView(bank, record, "A", ORDER).options as string[];
    expect(new Set(a)).toEqual(
      new Set(["Bone flute", "Brass horn", "Hand drum", "Reed pipe"]),
    );
    expect(coldView(bank, record, "A", ORDER).options).toEqual(a);
    expect(a).toEqual(
      shuffleFor(
        ["Bone flute", "Brass horn", "Hand drum", "Reed pipe"],
        orderSeed(ORDER, record.id, "A"),
      ),
    );
    // Without a key the options are sorted, which says nothing about the key.
    expect(coldView(bank, record, "A").options).toEqual([
      "Bone flute",
      "Brass horn",
      "Hand drum",
      "Reed pipe",
    ]);
    // The reviewer's attack: undo a shuffle seeded with SHA-256(id|pass), as
    // the old packets were, and read off where index 0 (the key) landed.
    let found = 0;
    let trials = 0;
    for (let n = 1; n <= 40; n += 1) {
      const id = `fx.p.geo.01${String(n).padStart(2, "0")}`;
      const options = ["key", "w1", "w2", "w3"];
      for (const pass of ["A", "B"]) {
        const shown = shuffleFor(options, orderSeed(ORDER, id, pass));
        const publicSeed = createHash("sha256")
          .update(`${id}|${pass}`)
          .digest("hex");
        const guess = shuffleFor([0, 1, 2, 3], publicSeed).indexOf(0);
        trials += 1;
        if (shown[guess] === "key") found += 1;
      }
    }
    expect(found).toBeLessThan(trials * 0.5);
  });

  it("sorts ascending items instead of shuffling them", async () => {
    const bank = await loadFx(
      fxFiles({
        "practice/geography/fx.p.geo.0101.json": fxMc({
          order: "ascending",
          answer: "212",
          wrong: ["40", "1,500", "96"],
        }),
      }),
    );
    expect(coldView(bank, itemOf(bank, "fx.p.geo.0101"), "A").options).toEqual([
      "40",
      "96",
      "212",
      "1,500",
    ]);
  });

  it("stages a mystery: clue k at stage k, the four options only with clue 4", async () => {
    const bank = await bankWithEverything();
    const stages = coldStages(bank, itemOf(bank, "fx.m.geo.0101"), "A", ORDER);
    expect(stages.map((stage) => (stage.clues as string[]).length)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(stages.map((stage) => "clue4Options" in stage)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(stages[0]?.clues).toEqual(fxMystery().clues.slice(0, 1));
    expect(coldStages(bank, itemOf(bank, "fx.p.geo.0101"), "A")).toHaveLength(
      1,
    );
  });

  it("gives a mystery its clues in order and the four clue-4 options, and an encore its question", async () => {
    const bank = await bankWithEverything();
    const mystery = coldView(bank, itemOf(bank, "fx.m.geo.0101"), "A");
    expect(mystery.clues).toEqual(fxMystery().clues);
    expect(
      (mystery.clue4Options as { display: string }[])
        .map((o) => o.display)
        .sort(),
    ).toEqual(["Arvenna", "Belloria", "Cassova", "Dravenor"]);
    expect(mystery.answerLine).toBe("The answer is a country.");
    const encore = coldView(bank, itemOf(bank, "fx.e.0101"), "B");
    expect(encore).toMatchObject({
      question: fxEncore().question,
      unit: "steps",
      decimals: 0,
    });
    expect(strings(encore)).not.toContain("212");
  });
});

describe("reveal packets", () => {
  it("add the key, the explanation and the claims with their risk, but never notes or verification", async () => {
    const bank = await bankWithEverything();
    const reveal = revealView(bank, itemOf(bank, "fx.p.geo.0101"), "A");
    expect(reveal.key).toEqual({ answer: "Bone flute" });
    expect((reveal.claims as { risk: string }[]).map((c) => c.risk)).toEqual([
      "standard",
      "standard",
      "high",
    ]);
    expect(strings(reveal).join(" ")).not.toContain("SECRET");
    expect(keys(reveal)).not.toContain("writerNotes");
    expect(keys(reveal)).not.toContain("verification");
    expect(keys(reveal)).not.toContain("seededDifficulty");
    const tf = revealView(bank, itemOf(bank, "fx.p.geo.0102"), "A");
    expect(tf.key).toEqual({ answer: "True" });
    const cmp = revealView(bank, itemOf(bank, "fx.p.geo.0103"), "A");
    expect(cmp.key).toMatchObject({
      answer: "Brindle Tower",
      relation: "taller",
    });
    const mystery = revealView(bank, itemOf(bank, "fx.m.geo.0101"), "A");
    expect(keys(mystery)).not.toContain("rivals");
    expect(mystery.key).toMatchObject({
      answer: { id: "fx.x.country.arvenna", display: "Arvenna" },
    });
  });

  it("flags claims that resemble a known myth, for the checker to decide", async () => {
    const claims = [
      ...fxTf().claims,
      {
        id: "c3",
        role: "explanation" as const,
        risk: "standard" as const,
        text: "Unlike the myth, bats are not blind.",
      },
    ];
    const bank = await loadFx(
      fxFiles({ "practice/geography/fx.p.geo.0102.json": fxTf({ claims }) }),
    );
    const reveal = revealView(bank, itemOf(bank, "fx.p.geo.0102"), "B");
    expect(reveal.mythHits).toEqual([
      expect.objectContaining({ claimId: "c3", mythId: "bats-are-blind" }),
    ]);
  });
});

describe("packetSha256", () => {
  it("is stable, differs per pass and changes when the item changes", async () => {
    const bank = await bankWithEverything();
    const record = itemOf(bank, "fx.p.geo.0101");
    const first = packetEntry(bank, record, "A").packetSha256;
    expect(packetEntry(bank, record, "A").packetSha256).toBe(first);
    expect(packetEntry(bank, record, "B").packetSha256).not.toBe(first);
    const edited = await loadFx(
      fxFiles({
        "practice/geography/fx.p.geo.0101.json": fxMc({
          stem: "Which instrument opens the fixture festival in Halvessa?",
        }),
      }),
    );
    expect(
      packetEntry(edited, itemOf(edited, "fx.p.geo.0101"), "A").packetSha256,
    ).not.toBe(first);
  });

  it("ignores the writer's notes and verification, which checkers never see", async () => {
    const plain = await loadFx();
    const noted = await loadFx(
      fxFiles({
        "practice/geography/fx.p.geo.0101.json": fxMc({
          writerNotes: "different notes",
        }),
      }),
    );
    expect(
      packetEntry(noted, itemOf(noted, "fx.p.geo.0101"), "A").packetSha256,
    ).toBe(
      packetEntry(plain, itemOf(plain, "fx.p.geo.0101"), "A").packetSha256,
    );
  });

  it("is written into every file of a batch packet: cold.json or the four mystery stages, and reveal.json", async () => {
    const bank = await loadFx();
    const entries = [
      itemOf(bank, "fx.p.geo.0101"),
      itemOf(bank, "fx.p.geo.0103"),
    ].map((record) => packetEntry(bank, record, "A", ORDER));
    const files = packetFiles(
      "p.geo.b01",
      "A",
      entries,
      "2026-11-02T10:00:00Z",
    );
    expect(files.map((file) => file.name)).toEqual([
      "cold.json",
      "reveal.json",
    ]);
    type Packet = {
      brief: string;
      stage: string;
      items: { packetSha256: string }[];
    };
    const [cold, reveal] = files.map((file) => file.content as Packet);
    expect(cold?.brief).toBe("confirm");
    expect(cold?.stage).toBe("cold");
    expect(cold?.items.map((i) => i.packetSha256)).toEqual(
      reveal?.items.map((i) => i.packetSha256),
    );
    expect(keys(cold)).not.toContain("claims");
    const staged = packetFiles(
      "m.geo.b01",
      "B",
      [packetEntry(bank, itemOf(bank, "fx.m.geo.0101"), "B", ORDER)],
      "2026-11-02T10:00:00Z",
    );
    expect(staged.map((file) => file.name)).toEqual([
      "cold-1.json",
      "cold-2.json",
      "cold-3.json",
      "cold-4.json",
      "reveal.json",
    ]);
    const first = staged[0]?.content as { items: Record<string, unknown>[] };
    expect(strings(first)).not.toContain(fxMystery().clues[1]);
    expect(keys(first)).not.toContain("clue4Options");
    expect(
      (staged[0]?.content as { instructions: string[] }).instructions.join(" "),
    ).toContain("cold-1.json");
  });

  it("covers what the item shows, not the order, display names or what no packet shows", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.m.geo.0101");
    const hash = packetSha256(record.id, record.item, "A");
    expect(packetEntry(bank, record, "A", ORDER).packetSha256).toBe(hash);
    expect(packetEntry(bank, record, "A").packetSha256).toBe(hash);
    // Fields no packet shows, which accept may edit.
    const editorial = {
      ...record.item,
      tags: ["fixtures", "other"],
      sourceLabels: ["Fixture atlas"],
      lintAllow: [{ rule: "C19", text: "x", reason: "y" }],
      writerNotes: "changed",
    } as typeof record.item;
    expect(packetSha256(record.id, editorial, "A")).toBe(hash);
    // Anything a packet shows changes it.
    for (const patch of [
      { clues: [...fxMystery().clues.slice(0, 3), "A new clue 4."] },
      {
        distractors: [
          ...fxMystery().distractors.slice(0, 2),
          "fx.x.country.elmaris",
        ],
      },
      { explanation: "A different explanation." },
      { claims: fxMystery().claims.slice(0, -1) },
    ]) {
      expect(
        packetSha256(
          record.id,
          { ...record.item, ...patch } as typeof record.item,
          "A",
        ),
        JSON.stringify(patch).slice(0, 40),
      ).not.toBe(hash);
    }
  });
});
