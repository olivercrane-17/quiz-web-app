/**
 * The mock sealed area (ARCHITECTURE §7.4, §8.4, §8.8), played with the
 * echo test plugins over the fixture Dailies: generic over plugins, so it
 * runs before PRA-1 and MYS-1 build the real ones.
 */
import { describe, expect, it } from "vitest";

import { createFakeClock } from "@/engine/clock";
import {
  PLUGINS,
  type AnyRoundPlugin,
  type PluginRegistry,
} from "@/engine/rounds";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import {
  parseEntityId,
  parseIdempotencyKey,
  parseTimeZone,
  type AttemptId,
  type AttemptSnapshot,
  type EntityId,
  type IdempotencyKey,
  type LocalIdentity,
  type RoundIntent,
  type TimeZone,
} from "@/engine/types";
import type { IdentityProvider } from "@/platform/identity/provider";
import { createLocalIdentityProvider } from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type { BrowserContextInfo } from "../../types";
import { createMockBackend } from "../index";
import { createMemoryStore } from "../store";
import { voidRound, type MockAttemptRow } from "./sealed";

/** 09:00 UTC on Sunday 1 November 2026: Daily #42, spare set 6 (m3e1). */
const NOV_1 = Date.UTC(2026, 10, 1, 9);
const UTC = parseTimeZone("UTC") as TimeZone;
const BROWSER: BrowserContextInfo = {
  context: "browser",
  app: "none",
  platform: "desktop",
};
const START = { tz: UTC, browser: BROWSER, appVersion: "test" };

const entity = (raw: string): EntityId => parseEntityId(raw) as EntityId;
/** Daily #42's Mysteries: Odile Marsh, Valdoria, bismuth. */
const ANSWERS = [
  entity("fx.x.person.odile-marsh"),
  entity("fx.x.country.valdoria"),
  entity("fx.x.element.bismuth"),
];
const WRONG = [
  entity("fx.x.person.liesl-varo"),
  entity("fx.x.country.ostravia"),
  entity("fx.x.element.lead"),
];

let keys = 0;
function key(): IdempotencyKey {
  keys += 1;
  return parseIdempotencyKey(
    `00000000-0000-4000-8000-${keys.toString(16).padStart(12, "0")}`,
  ) as IdempotencyKey;
}

function seededBytes(seed: number): (bytes: Uint8Array) => void {
  let state = seed;
  return (bytes) => {
    for (let i = 0; i < bytes.length; i += 1) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      bytes[i] = state >>> 24;
    }
  };
}

function device(seed: number): IdentityProvider {
  return createLocalIdentityProvider({
    kv: createKv({ storage: createMemoryStorage() }),
    now: () => NOV_1,
    random: seededBytes(seed),
  });
}

function setup(at = NOV_1, plugins: PluginRegistry = createEchoRegistry()) {
  const clock = createFakeClock(at);
  const store = createMemoryStore();
  let identity = device(1);
  const mock = createMockBackend(
    {
      identity: () => identity,
      serverClock: createServerClock({ base: clock }),
    },
    {
      store,
      clock,
      init: { latencyMs: 0 },
      attachControls: false,
      plugins,
    },
  );
  return {
    mock,
    clock,
    store,
    useDevice(next: IdentityProvider) {
      identity = next;
    },
    identity: () => identity,
    attempt(id: AttemptId): MockAttemptRow {
      return mock.controls.inspect<MockAttemptRow>(`attempts.${id}`);
    },
  };
}

async function started(t: ReturnType<typeof setup>): Promise<AttemptSnapshot> {
  const result = await t.mock.sealed.start({ kind: "today" }, START);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

const guess = (entityId: EntityId): RoundIntent => ({
  family: "mystery",
  kind: "guess",
  entityId,
});
const nextClue: RoundIntent = { family: "mystery", kind: "next_clue" };

async function act(
  t: ReturnType<typeof setup>,
  attemptId: AttemptId,
  index: number,
  step: number,
  intent: RoundIntent,
  k: IdempotencyKey = key(),
) {
  return t.mock.sealed.act({
    attemptId,
    index,
    step,
    intent,
    clientActiveMs: 1000,
    hiddenMs: 0,
    key: k,
  });
}

/** Solves Mysteries 1 to `count` on clue 1. */
async function solveMysteries(
  t: ReturnType<typeof setup>,
  attemptId: AttemptId,
  count: number,
) {
  for (let index = 0; index < count; index += 1) {
    if (index > 0) await t.mock.sealed.beginRound(attemptId, index);
    const result = await act(t, attemptId, index, 1, guess(ANSWERS[index]!));
    expect(result).toMatchObject({
      ok: true,
      value: { verdict: { kind: "resolved" } },
    });
  }
}

describe("start", () => {
  it("registers the device on its first write and opens round 0 with the snapshot", async () => {
    const t = setup();
    expect(t.identity().current().registered).toBe(false);
    expect(await t.mock.identity.getProfile()).toMatchObject({
      ok: false,
      error: { code: "auth_failed" },
    });

    const snapshot = await started(t);
    expect(snapshot).toMatchObject({
      kind: "daily",
      ranked: true,
      daily: { dailyNumber: 42, date: "2026-11-01" },
      composition: "m3e1",
      maxPoints: 12,
      status: "active",
      points: 0,
      resolved: [],
      current: { index: 0, open: { family: "mystery", clue: 1 } },
      serverTime: NOV_1,
    });
    expect(
      snapshot.rounds.map((meta) => [meta.type, meta.ordinal, meta.ofType]),
    ).toEqual([
      ["mystery", 1, 3],
      ["mystery", 2, 3],
      ["mystery", 3, 3],
      ["encore", 1, 1],
    ]);
    expect(snapshot.rounds[0]).toMatchObject({
      difficulty: "easy",
      category: "hist",
      answerType: "person",
      maxPoints: 4,
      voided: false,
    });
    expect(snapshot.rounds[3]).toMatchObject({ category: null, maxPoints: 0 });

    expect(t.identity().current().registered).toBe(true);
    const players = t.mock.controls.inspect<Record<string, unknown>>("players");
    expect(Object.keys(players)).toEqual([t.identity().current().playerId]);
    const profile = await t.mock.identity.getProfile();
    expect(profile).toMatchObject({
      ok: true,
      value: { playerId: t.identity().current().playerId, nickname: null },
    });
    expect(profile.ok && profile.value.friendlyName).toMatch(
      /^[A-Z][a-z]+ [A-Z][a-z]+$/,
    );
    // The server keeps a hash of the secret, never the secret.
    expect(
      JSON.stringify(t.mock.controls.inspect("credentials")),
    ).not.toContain(t.identity().current().secret);
  });

  it("returns the same attempt on a second start, so a double tap makes one (AC-DLY-05)", async () => {
    const t = setup();
    const [first, second] = await Promise.all([started(t), started(t)]);
    expect(second.attemptId).toBe(first.attemptId);
    expect(
      Object.keys(t.mock.controls.inspect("attempts") as object),
    ).toHaveLength(1);
  });

  it("refuses another device's secret for a known player id", async () => {
    const t = setup();
    await started(t);
    const impostor = device(2);
    const real = t.identity().current();
    impostor.replace({
      ...impostor.current(),
      playerId: real.playerId,
    } satisfies LocalIdentity);
    t.useDevice(impostor);
    expect(await t.mock.sealed.start({ kind: "today" }, START)).toMatchObject({
      ok: false,
      error: { code: "auth_failed" },
    });
  });

  it("answers no_daily before the epoch, and unavailable for sources other tickets build", async () => {
    const t = setup(Date.UTC(2026, 8, 1, 12));
    expect(await t.mock.sealed.start({ kind: "today" }, START)).toMatchObject({
      ok: false,
      error: { code: "no_daily", retryable: true },
    });
    expect(
      await t.mock.sealed.start(
        { kind: "archive", dailyNumber: 40 as never },
        START,
      ),
    ).toMatchObject({ ok: false, error: { code: "unavailable" } });
  });

  it("keeps the effective today when the zone moves west, so a served date never reopens (§8.7)", async () => {
    // 11:00 UTC is already 2 November at UTC+14.
    const t = setup(Date.UTC(2026, 10, 1, 11));
    const east = await t.mock.sealed.start(
      { kind: "today" },
      { ...START, tz: parseTimeZone("Pacific/Kiritimati") as TimeZone },
    );
    expect(east).toMatchObject({
      ok: true,
      value: { daily: { dailyNumber: 43 } },
    });
    const west = await t.mock.daily.today(
      parseTimeZone("Pacific/Pago_Pago") as TimeZone,
    );
    expect(west).toMatchObject({
      ok: true,
      value: { daily: { dailyNumber: 43 }, status: "in_progress" },
    });
  });
});

describe("act", () => {
  it("moves on after a wrong guess, and a repeated key returns the rebuilt result once (§8.8)", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    const k = key();
    const first = await act(t, attemptId, 0, 1, guess(WRONG[0]!), k);
    expect(first).toMatchObject({
      ok: true,
      value: {
        verdict: {
          kind: "continue",
          open: { clue: 2, wrongGuesses: [{ clue: 1, entityId: WRONG[0] }] },
        },
        finished: null,
        converted: false,
      },
    });
    t.clock.advance(5000);
    const replay = await act(t, attemptId, 0, 1, guess(WRONG[0]!), k);
    expect(replay.ok && replay.value.verdict).toEqual(
      first.ok && first.value.verdict,
    );
    const row = t.attempt(attemptId);
    expect(row.actions).toBe(1);
    expect(row.rounds[0]?.requests).toBe(2);
    expect(
      Object.keys(t.mock.controls.inspect("roundActions") as object),
    ).toEqual([k]);
  });

  it("answers conflict for a key reused with another intent", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    const k = key();
    await act(t, attemptId, 0, 1, guess(WRONG[0]!), k);
    expect(await act(t, attemptId, 0, 2, nextClue, k)).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
  });

  it("rebuilds a replayed key from the attempt as it stands, a void that landed in between included (§8.8)", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    const k = key();
    const first = await act(t, attemptId, 0, 1, guess(WRONG[0]!), k);
    expect(first).toMatchObject({
      ok: true,
      value: { verdict: { kind: "continue", open: { clue: 2 } } },
    });
    await voidRound(t.mock.context, { dailyNumber: 42, round: 0 });

    // The answer to the guess was lost, so the client sends it again.
    const replay = await act(t, attemptId, 0, 1, guess(WRONG[0]!), k);
    expect(replay).toMatchObject({
      ok: true,
      value: {
        verdict: {
          kind: "resolved",
          reveal: { family: "withdrawn", round: "mystery", points: 4 },
          next: { index: 1, type: "mystery" },
        },
        finished: null,
        converted: false,
      },
    });
    expect(await t.mock.sealed.get(attemptId)).toMatchObject({
      ok: true,
      value: { points: 4, current: { index: 1, open: null } },
    });
    // The replay counted nothing.
    expect(t.attempt(attemptId).actions).toBe(1);
  });

  it("reports a conversion that landed after the key on its replay", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    const k = key();
    expect(await act(t, attemptId, 0, 1, nextClue, k)).toMatchObject({
      ok: true,
      value: { converted: false },
    });
    // 1 November's window closes at 2 November 12:00 UTC.
    t.clock.set(Date.UTC(2026, 10, 2, 12));
    expect(await act(t, attemptId, 0, 1, nextClue, k)).toMatchObject({
      ok: true,
      value: { verdict: { kind: "continue" }, converted: true },
    });
    expect(t.attempt(attemptId)).toMatchObject({
      kind: "archive",
      ranked: false,
    });
  });

  it("refuses an idempotency key that isn't a v4 UUID, storing nothing", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    for (const raw of ["not-a-uuid", "__proto__", "constructor", ""]) {
      expect(
        await act(t, attemptId, 0, 1, nextClue, raw as IdempotencyKey),
      ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(t.attempt(attemptId).actions).toBe(0);
    expect(t.mock.controls.inspect("roundActions")).toEqual({});
  });

  it("refuses a stale step with the current snapshot, consuming nothing", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    await act(t, attemptId, 0, 1, nextClue);
    const stale = await act(t, attemptId, 0, 1, nextClue);
    expect(stale).toMatchObject({
      ok: false,
      error: {
        code: "stale",
        current: { attemptId, current: { index: 0, open: { clue: 2 } } },
      },
    });
    expect(t.attempt(attemptId).actions).toBe(1);
    expect(await act(t, attemptId, 1, 1, nextClue)).toMatchObject({
      error: { code: "stale" },
    });
  });

  it("refuses invalid and repeated guesses without using up the clue or storing a key", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    expect(
      await act(t, attemptId, 0, 1, guess(entity("fx.x.person.nobody-at-all"))),
    ).toMatchObject({
      error: { code: "invalid_entity" },
    });
    await act(t, attemptId, 0, 1, guess(WRONG[0]!));
    expect(await act(t, attemptId, 0, 2, guess(WRONG[0]!))).toMatchObject({
      error: { code: "already_guessed" },
    });
    expect(
      await act(t, attemptId, 0, 2, {
        family: "encore",
        kind: "lock_in",
        value: 5,
      }),
    ).toMatchObject({
      error: { code: "invalid_input" },
    });
    const row = t.attempt(attemptId);
    expect(row.actions).toBe(1);
    expect(row.rounds[0]?.open).toMatchObject({ clue: 2 });
    expect(
      Object.keys(t.mock.controls.inspect("roundActions") as object),
    ).toHaveLength(1);
  });

  it("finishes the attempt with the last action, and finish() is idempotent", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    await solveMysteries(t, attemptId, 3);
    expect(await t.mock.sealed.finish(attemptId)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    await t.mock.sealed.beginRound(attemptId, 3);
    t.clock.advance(3000);
    const last = await act(t, attemptId, 3, 1, {
      family: "encore",
      kind: "lock_in",
      value: 104,
    });
    expect(last).toMatchObject({
      ok: true,
      value: {
        verdict: {
          kind: "resolved",
          next: null,
          reveal: { family: "encore", band: "bullseye" },
        },
        finished: {
          attemptId,
          points: 12,
          maxPoints: 12,
          ranked: true,
          streak: null,
          encore: { kind: "relative" },
          facts: {
            perfect: true,
            firstFinish: true,
            bullseye: true,
            earlierFinishes: 0,
          },
        },
      },
    });
    const summary = last.ok ? last.value.finished : null;
    expect(await t.mock.sealed.finish(attemptId)).toEqual({
      ok: true,
      value: summary,
    });
    const snapshot = await t.mock.sealed.get(attemptId);
    expect(snapshot).toMatchObject({
      ok: true,
      value: { status: "finished", current: null, points: 12 },
    });
    expect(snapshot.ok && snapshot.value.resolved).toHaveLength(4);
    // A replay of the final key still answers, now with the finish.
    expect(await t.mock.sealed.start({ kind: "today" }, START)).toMatchObject({
      ok: true,
      value: { attemptId, status: "finished" },
    });
  });

  it("converts the attempt to an unranked archive run once its window closes (§8.7)", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    // 1 November closes at 2 November 12:00 UTC.
    t.clock.set(Date.UTC(2026, 10, 2, 12));
    expect(await act(t, attemptId, 0, 1, nextClue)).toMatchObject({
      ok: true,
      value: { converted: true },
    });
    expect(await t.mock.sealed.get(attemptId)).toMatchObject({
      ok: true,
      value: { kind: "archive", ranked: false },
    });
  });

  it("hides another player's attempt", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    t.useDevice(device(9));
    await t.mock.identity.register(BROWSER);
    expect(await t.mock.sealed.get(attemptId)).toMatchObject({
      error: { code: "not_found" },
    });
    expect(await act(t, attemptId, 0, 1, nextClue)).toMatchObject({
      error: { code: "not_found" },
    });
  });
});

describe("beginRound", () => {
  it("is idempotent: the same open state, the issue time unmoved, one request", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    await act(t, attemptId, 0, 1, guess(ANSWERS[0]!));
    expect(await t.mock.sealed.beginRound(attemptId, 2)).toMatchObject({
      error: { code: "stale" },
    });
    t.clock.advance(4000);
    const first = await t.mock.sealed.beginRound(attemptId, 1);
    expect(first).toMatchObject({
      ok: true,
      value: {
        start: {
          kind: "open",
          open: {
            family: "mystery",
            clue: 1,
            index: 1,
            issuedAt: NOV_1 + 4000,
          },
        },
        finished: null,
        converted: false,
      },
    });
    t.clock.advance(9000);
    const again = await t.mock.sealed.beginRound(attemptId, 1);
    expect(again.ok && again.value.start).toEqual(
      first.ok && first.value.start,
    );
    expect(t.attempt(attemptId).rounds[1]).toMatchObject({
      issuedAt: NOV_1 + 4000,
      requests: 1,
    });
  });

  it("opens a voided round withdrawn, with its points and the next round's meta (PRD §3.13.4)", async () => {
    const t = setup();
    await voidRound(t.mock.context, { dailyNumber: 42, round: 1 });
    const { attemptId, rounds } = await started(t);
    expect(rounds[1]?.voided).toBe(true);
    await act(t, attemptId, 0, 1, guess(ANSWERS[0]!));
    const begun = await t.mock.sealed.beginRound(attemptId, 1);
    expect(begun).toMatchObject({
      ok: true,
      value: {
        start: {
          kind: "withdrawn",
          reveal: {
            family: "withdrawn",
            round: "mystery",
            points: 4,
            maxPoints: 4,
          },
          next: { index: 2, type: "mystery" },
        },
        finished: null,
      },
    });
    const snapshot = await t.mock.sealed.get(attemptId);
    expect(snapshot).toMatchObject({
      ok: true,
      value: { points: 8, current: { index: 2, open: null } },
    });
    // No clue of the withdrawn round ever reached the player.
    expect(t.attempt(attemptId).rounds[1]?.open).toBeNull();
  });

  it("withdraws a round voided mid-round on its next action, unjudged", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    await act(t, attemptId, 0, 1, nextClue);
    await voidRound(t.mock.context, { dailyNumber: 42, round: 0 });
    const result = await act(t, attemptId, 0, 2, guess(ANSWERS[0]!));
    expect(result).toMatchObject({
      ok: true,
      value: {
        verdict: {
          kind: "resolved",
          reveal: { family: "withdrawn", points: 4 },
          next: { index: 1 },
        },
      },
    });
    expect(t.attempt(attemptId)).toMatchObject({ points: 4, current: 1 });
  });

  it("finishes the attempt when the voided round is the last, with no Encore error", async () => {
    const t = setup();
    await voidRound(t.mock.context, { dailyNumber: 42, round: 3 });
    const { attemptId } = await started(t);
    await solveMysteries(t, attemptId, 3);
    const begun = await t.mock.sealed.beginRound(attemptId, 3);
    expect(begun).toMatchObject({
      ok: true,
      value: {
        start: {
          kind: "withdrawn",
          reveal: { round: "encore", points: 0 },
          next: null,
        },
        finished: { points: 12, maxPoints: 12, encore: null },
      },
    });
  });
});

/** What the judge state of every round carries in the sentinel registry. */
const SENTINEL = "SENTINEL-KEY";

/**
 * The echo plugins, with a marker planted in every round's judge state. The
 * echo judges keep no key of their own, so this is what tells a leak of the
 * stored judge state apart: with the real plugins it holds the answer.
 */
function sentinelRegistry(): PluginRegistry {
  const echo = createEchoRegistry();
  const plant = (plugin: AnyRoundPlugin): AnyRoundPlugin => ({
    ...plugin,
    open(content, meta, ctx) {
      const opened = plugin.open(content, meta, ctx);
      return {
        ...opened,
        judge: { ...(opened.judge as object), secret: SENTINEL },
      };
    },
  });
  return Object.fromEntries(
    Object.entries(echo).map(([type, plugin]) => [type, plant(plugin)]),
  ) as unknown as PluginRegistry;
}

describe("sealed payloads", () => {
  it("carry no answer, content id or later clue before a round resolves (AC-DLY-03, mock half)", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    await act(t, attemptId, 0, 1, guess(WRONG[0]!));
    await t.mock.sealed.get(attemptId);
    const sent = JSON.stringify(
      t.mock.controls.responses().map((r) => r.payload),
    );
    for (const secret of [...ANSWERS, "fx.m.", "fx.e.", "Echo clue 3"]) {
      expect(sent).not.toContain(secret);
    }
  });

  it("never carry a round's stored judge state, in verdicts, refusals, snapshots or replays", async () => {
    const t = setup(NOV_1, sentinelRegistry());
    const { attemptId } = await started(t);
    const k = key();
    // A wrong guess, its replay, a stale step and a refused guess.
    await act(t, attemptId, 0, 1, guess(WRONG[0]!), k);
    await act(t, attemptId, 0, 1, guess(WRONG[0]!), k);
    await act(t, attemptId, 0, 1, nextClue);
    await act(t, attemptId, 0, 2, guess(entity("fx.x.person.nobody-at-all")));
    await t.mock.sealed.get(attemptId);
    await act(t, attemptId, 0, 2, nextClue);
    await act(t, attemptId, 0, 3, nextClue);
    // Clue 4's options, a wrong round index, then the pick.
    await act(t, attemptId, 1, 1, nextClue);
    await act(t, attemptId, 0, 4, {
      family: "mystery",
      kind: "pick",
      option: 0,
    });
    await t.mock.sealed.beginRound(attemptId, 1);
    await t.mock.sealed.beginRound(attemptId, 1);
    await playOut(t, attemptId);
    await t.mock.sealed.finish(attemptId);
    await t.mock.daily.today(UTC);
    await t.mock.daily.results(attemptId);

    // The marker is there to find: every round's judge state holds it.
    expect(JSON.stringify(t.mock.controls.inspect("attempts"))).toContain(
      SENTINEL,
    );
    const responses = t.mock.controls.responses();
    expect(responses.map((r) => r.method)).toEqual(
      expect.arrayContaining([
        "sealed.start",
        "sealed.act",
        "sealed.get",
        "sealed.beginRound",
        "sealed.finish",
        "daily.today",
        "daily.results",
      ]),
    );
    expect(
      responses.some(
        (r) =>
          (r.payload as { error?: { code?: string } }).error?.code === "stale",
      ),
    ).toBe(true);
    expect(JSON.stringify(responses)).not.toContain(SENTINEL);
  });
});

/** Plays whatever round is open: choice option 0, a Mystery to its clue-4 options, the Encore at 100. */
async function playOut(t: ReturnType<typeof setup>, attemptId: AttemptId) {
  for (;;) {
    const snapshot = await t.mock.sealed.get(attemptId);
    if (!snapshot.ok) throw new Error(snapshot.error.code);
    const current = snapshot.value.current;
    if (current === null) return;
    if (current.open === null) {
      await t.mock.sealed.beginRound(attemptId, current.index);
      continue;
    }
    const open = current.open;
    const intent: RoundIntent =
      open.family === "choice"
        ? { family: "choice", kind: "answer", option: 0 }
        : open.family === "encore"
          ? { family: "encore", kind: "lock_in", value: 100 }
          : open.options === null
            ? nextClue
            : { family: "mystery", kind: "pick", option: 0 };
    const step = open.family === "mystery" ? open.clue : 1;
    const result = await act(t, attemptId, current.index, step, intent);
    if (!result.ok) throw new Error(result.error.code);
  }
}

describe("the [mc ×9, encore] and [mc ×5, mystery, encore] fixture Dailies", () => {
  it("AC-DLY-09 render and score out of 9 with no code change", async () => {
    for (const [date, composition, choices] of [
      [Date.UTC(2026, 10, 15, 9), "c9e1", 9],
      [Date.UTC(2026, 10, 16, 9), "c5m1e1", 5],
    ] as const) {
      const t = setup(date);
      const snapshot = await started(t);
      expect(snapshot).toMatchObject({
        composition,
        maxPoints: 9,
        current: { index: 0, open: { family: "choice" } },
      });
      expect(
        snapshot.rounds
          .slice(0, choices)
          .map((meta) => [
            meta.type,
            meta.ordinal,
            meta.ofType,
            meta.maxPoints,
          ]),
      ).toEqual(
        Array.from({ length: choices }, (_, i) => ["mc", i + 1, choices, 1]),
      );
      await playOut(t, snapshot.attemptId);
      const finished = await t.mock.sealed.finish(snapshot.attemptId);
      expect(finished).toMatchObject({ ok: true, value: { maxPoints: 9 } });
    }
  });
});

describe("the start's first-Daily flag (PRD §3.1.3 to §3.1.5)", () => {
  /** Plays today's attempt to its finish. */
  async function finishToday(t: ReturnType<typeof setup>) {
    const { attemptId } = await started(t);
    await playOut(t, attemptId);
    return attemptId;
  }

  it("R1-04 says a new player has never finished a Daily, through their whole first Daily", async () => {
    const t = setup();
    const first = await t.mock.sealed.start({ kind: "today" }, START);
    expect(first).toMatchObject({ ok: true, value: { firstDaily: true } });
    // A reload mid-Daily asks again and still gets the hints.
    expect(await t.mock.sealed.start({ kind: "today" }, START)).toMatchObject({
      ok: true,
      value: { firstDaily: true },
    });
  });

  it("R1-04 stops once the player has finished a Daily: the next date's start says so", async () => {
    const t = setup();
    await finishToday(t);
    t.clock.advance(24 * 60 * 60 * 1000);
    expect(await t.mock.sealed.start({ kind: "today" }, START)).toMatchObject({
      ok: true,
      value: { daily: { dailyNumber: 43 }, firstDaily: false },
    });
  });

  it("R1-04 keeps the hints for a player whose earlier Daily was never finished", async () => {
    const t = setup();
    await started(t);
    t.clock.advance(24 * 60 * 60 * 1000);
    expect(await t.mock.sealed.start({ kind: "today" }, START)).toMatchObject({
      ok: true,
      value: { daily: { dailyNumber: 43 }, firstDaily: true },
    });
  });

  it("R1-04 counts only the caller's own finishes", async () => {
    const t = setup();
    await finishToday(t);
    t.useDevice(device(7));
    expect(await t.mock.sealed.start({ kind: "today" }, START)).toMatchObject({
      ok: true,
      value: { firstDaily: true },
    });
  });
});

describe("a resolved Mystery's misses (R1-22)", () => {
  it("R1-22 keeps the wrong guesses and the picked option's label in the reveal a reload reads", async () => {
    // The real plugins, which label the options from the fixture lists.
    const t = setup(NOV_1, PLUGINS);
    const { attemptId } = await started(t);
    expect(await act(t, attemptId, 0, 1, guess(WRONG[0]!))).toMatchObject({
      ok: true,
      value: { verdict: { kind: "continue" } },
    });
    await act(t, attemptId, 0, 2, nextClue);
    await act(t, attemptId, 0, 3, nextClue);
    const clue4 = await t.mock.sealed.get(attemptId);
    const options =
      clue4.ok && clue4.value.current?.open?.family === "mystery"
        ? (clue4.value.current.open.options ?? [])
        : [];
    const wrongPick = options.find(
      (option) => !option.alreadyGuessed && option.label !== "Odile Marsh",
    );
    if (wrongPick === undefined) throw new Error("no wrong option to pick");
    const missed = await act(t, attemptId, 0, 4, {
      family: "mystery",
      kind: "pick",
      option: wrongPick.index,
    });
    const expected = {
      family: "mystery",
      solvedOn: null,
      pickedOption: wrongPick.index,
      pickedLabel: wrongPick.label,
      wrongGuesses: [{ clue: 1, entityId: WRONG[0], display: "Liesl Varo" }],
    };
    expect(missed).toMatchObject({
      ok: true,
      value: { verdict: { kind: "resolved", reveal: expected } },
    });
    // A reload, or Leave then Continue, starts again and reads the same.
    const reloaded = await t.mock.sealed.start({ kind: "today" }, START);
    expect(reloaded).toMatchObject({
      ok: true,
      value: { resolved: [{ meta: { index: 0 }, reveal: expected }] },
    });
  });
});

describe("round times in the snapshot (PRD §4.1.4)", () => {
  it("R1-06 carries each resolved round's server interval and the open round's so far, to the second", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    // 90.4 s on Mystery 1: begin plus the solve is 2 requests, so the
    // server's interval less 800 ms beats the client's own 1 s (§4.3.3).
    t.clock.advance(90_400);
    expect(await act(t, attemptId, 0, 1, guess(ANSWERS[0]!))).toMatchObject({
      ok: true,
      value: { verdict: { kind: "resolved" } },
    });
    // Before Continue: no round is open, so none has a time so far.
    const between = await t.mock.sealed.get(attemptId);
    expect(between.ok && between.value.current).toEqual({
      index: 1,
      open: null,
    });
    expect(between.ok && between.value.resolved[0]?.activeMs).toBe(90_000);

    t.clock.advance(5_000);
    await t.mock.sealed.beginRound(attemptId, 1);
    t.clock.advance(30_200);
    const reloaded = await t.mock.sealed.start({ kind: "today" }, START);
    expect(reloaded).toMatchObject({
      ok: true,
      value: {
        resolved: [{ meta: { index: 0 }, activeMs: 90_000 }],
        current: { index: 1, open: { clue: 1 }, activeMs: 30_000 },
      },
    });
  });

  it("R1-06 counts the open round from its first clue, not the clue on screen, and caps it at 15 minutes", async () => {
    const t = setup();
    const { attemptId } = await started(t);
    t.clock.advance(20_000);
    await act(t, attemptId, 0, 1, nextClue);
    t.clock.advance(12_000);
    const onClue2 = await t.mock.sealed.get(attemptId);
    expect(onClue2.ok && onClue2.value.current).toMatchObject({
      open: { clue: 2 },
      activeMs: 32_000,
    });
    t.clock.advance(20 * 60 * 1000);
    const capped = await t.mock.sealed.get(attemptId);
    expect(capped.ok && capped.value.current?.activeMs).toBe(15 * 60 * 1000);
  });
});
