/**
 * The Daily's sealed contract (ARCHITECTURE §7.5, §8.4, §8.8): behaviour
 * of `GameBackend.sealed` that any backend serving the Daily must keep,
 * written against the interface alone. It runs against the mock in every
 * `npm test` (daily.mock.test.ts), which pins the mock's clock to Daily #46,
 * the Daily RITE round 2 played. SQL-4 and SQL-5 add `daily.real.test.ts`
 * (`runContract(dailyContract, "real")`) once the real Daily serves today's
 * Mysteries on the e2e track, and every test here then runs against it as
 * written: nothing below reads fixture content, an answer or a store.
 *
 * - **R2-03, the clue-4 spread.** In round 2 every fresh browser's mock
 *   minted the same first attempt id, and the option shuffle forked from
 *   that id alone, so every new player saw one clue-4 order: on #46, the
 *   answer at A on all three Mysteries. Here 200 seeded identities, each in
 *   its own fresh context (as each new browser has its own mock database),
 *   take Mystery 1 to clue 4 on Next clue and pick option A. The key's
 *   display position is A on a solve, otherwise the option whose label
 *   names the revealed answer. Each of the four positions must hold the
 *   key 30 to 70 times. A fair shuffle averages 50 and lands outside that
 *   band about once in 300 runs; the mock's identities are seeded, so its
 *   run gives the same counts every time, while a real run draws afresh.
 *   Against the real project each identity registers (as low trust past
 *   the soft per-network threshold, which plays the same), so the run is
 *   long: it gets ten minutes.
 * - **R2-08, one clock.** A verdict that resolves a round carries the
 *   round's recorded time (`activeMs`, whole seconds, at most the 15-minute
 *   cap), the snapshot a reload reads carries the same figure, and the
 *   finish's `totalMs` adds those whole seconds, so the header frozen at
 *   Lock in and the stop screen can't disagree. round_action returns it as
 *   `active_ms` beside `verdict`, `finished` and `converted`.
 */
import { expect } from "vitest";

import { SHARED } from "@/config/shared";
import { createRng } from "@/engine/rng";
import {
  parseIdempotencyKey,
  parseTimeZone,
  type AttemptId,
  type AttemptSnapshot,
  type FinishSummary,
  type IdempotencyKey,
  type Result,
  type RoundIntent,
  type RoundOpen,
  type RoundReveal,
  type RoundVerdict,
  type TimeZone,
} from "@/engine/types";

import type { BrowserContextInfo, GameBackend } from "../types";
import { createContractEnv, defineContract, type ContractEnv } from "./harness";

/** How many fresh identities the spread test plays. */
export const SPREAD_IDENTITIES = 200;
/** The fewest and most times one display position may hold the key, of SPREAD_IDENTITIES. */
export const SPREAD_BAND = { min: 30, max: 70 } as const;
/** Ten minutes: two hundred registrations and a thousand round actions over the network. */
const SPREAD_REAL_TIMEOUT_MS = 600_000;

const LONDON = parseTimeZone("Europe/London") as TimeZone;
const BROWSER: BrowserContextInfo = {
  context: "browser",
  app: "none",
  platform: "desktop",
};
const START = { tz: LONDON, browser: BROWSER, appVersion: "contract" };
const POSITIONS = ["A", "B", "C", "D"] as const;

/** The value of an ok result, or a failure naming the error. */
function value<T>(result: Result<T>, what: string): T {
  if (!result.ok) throw new Error(`${what}: ${result.error.code}`);
  return result.value;
}

/** Repeatable random bytes for identity `label`: the same 200 players every run. */
function seededBytes(label: string): (bytes: number) => Uint8Array {
  const rng = createRng(label);
  return (bytes) => Uint8Array.from({ length: bytes }, () => rng.int(256));
}

/** A fresh v4 idempotency key from crypto, as the device makes one. */
function newKey(): IdempotencyKey {
  const key = parseIdempotencyKey(crypto.randomUUID());
  if (key === null) throw new Error("crypto gave a malformed UUID");
  return key;
}

/** What act() answers, with the recorded time a resolving verdict carries (R2-08). */
interface Acted {
  verdict: RoundVerdict;
  finished: FinishSummary | null;
  activeMs: number | null;
}

async function act(
  backend: GameBackend,
  attemptId: AttemptId,
  index: number,
  step: number,
  intent: RoundIntent,
): Promise<Acted> {
  const response = value(
    await backend.sealed.act({
      attemptId,
      index,
      step,
      intent,
      clientActiveMs: 0,
      hiddenMs: 0,
      key: newKey(),
    }),
    `act on round ${index + 1}, step ${step}`,
  );
  const recorded = (response as { activeMs?: unknown }).activeMs;
  return {
    verdict: response.verdict,
    finished: response.finished,
    activeMs: typeof recorded === "number" ? recorded : null,
  };
}

/** The step a call names (§7.2): the clue number on a Mystery, else 1. */
const stepOf = (open: RoundOpen): number =>
  open.family === "mystery" ? open.clue : 1;

/** An intent that resolves `open` at once, or moves a Mystery on a clue. */
function moveOn(open: RoundOpen): RoundIntent {
  switch (open.family) {
    case "mystery":
      return open.clue < 4
        ? { family: "mystery", kind: "next_clue" }
        : { family: "mystery", kind: "pick", option: 0 };
    case "encore":
      return { family: "encore", kind: "lock_in", value: 1 };
    case "choice":
      return { family: "choice", kind: "answer", option: 0 };
  }
}

/** The round open now, beginning it when Continue hasn't yet. */
async function openRound(
  backend: GameBackend,
  snapshot: AttemptSnapshot,
  index: number,
): Promise<RoundOpen | null> {
  if (snapshot.current?.index === index && snapshot.current.open !== null) {
    return snapshot.current.open;
  }
  const begun = value(
    await backend.sealed.beginRound(snapshot.attemptId, index),
    `begin round ${index + 1}`,
  );
  return begun.start.kind === "open" ? begun.start.open : null;
}

/** A label without a trailing bracketed descriptor: "Queen (band)" is "Queen". */
const bare = (label: string) => label.replace(/\s*\([^()]*\)$/, "").trim();

/**
 * The display position of the key among clue 4's options, from the reveal
 * that picking option A brought: A on a solve, else the one option whose
 * label names the answer (all four take their descriptor when any does, so
 * the names compare without it).
 */
function keyPosition(labels: readonly string[], reveal: RoundReveal): number {
  if (reveal.family !== "mystery") {
    throw new Error(`a Mystery revealed as ${reveal.family}`);
  }
  if (reveal.solvedOn === 4) return 0;
  const exact = labels.flatMap((label, index) =>
    label === reveal.answer.display ? [index] : [],
  );
  const named =
    exact.length === 1
      ? exact
      : labels.flatMap((label, index) =>
          bare(label) === bare(reveal.answer.display) ? [index] : [],
        );
  const [position] = named;
  if (named.length !== 1 || position === undefined || position === 0) {
    throw new Error(
      `no single option names the revealed answer among ${labels.length} options`,
    );
  }
  return position;
}

/**
 * One fresh player's Mystery 1: rounds before it resolve at once, then Next
 * clue to clue 4 and a pick of option A. Returns the key's display position.
 */
async function keyPositionAtClue4(env: ContractEnv): Promise<number> {
  const backend = env.backend;
  const snapshot = value(
    await backend.sealed.start({ kind: "today" }, START),
    "start",
  );
  const mystery = snapshot.rounds.find((meta) => meta.type === "mystery");
  if (mystery === undefined) throw new Error("today's Daily has no Mystery");
  for (let index = 0; index < mystery.index; index += 1) {
    const open = await openRound(backend, snapshot, index);
    if (open !== null) {
      await act(backend, snapshot.attemptId, index, stepOf(open), moveOn(open));
    }
  }
  let open = await openRound(backend, snapshot, mystery.index);
  while (open?.family === "mystery" && open.clue < 4) {
    const moved = await act(
      backend,
      snapshot.attemptId,
      mystery.index,
      open.clue,
      moveOn(open),
    );
    if (moved.verdict.kind !== "continue") {
      throw new Error(`Next clue on clue ${open.clue} resolved the Mystery`);
    }
    open = moved.verdict.open;
  }
  if (open?.family !== "mystery" || open.options === null) {
    throw new Error("Mystery 1 reached clue 4 without its four options");
  }
  const labels = open.options.map((option) => option.label);
  const picked = await act(backend, snapshot.attemptId, mystery.index, 4, {
    family: "mystery",
    kind: "pick",
    option: 0,
  });
  if (picked.verdict.kind !== "resolved") {
    throw new Error("a clue-4 pick left the Mystery open");
  }
  return keyPosition(labels, picked.verdict.reveal);
}

export const dailyContract = defineContract("sealed", (test) => {
  test(
    "act",
    `R2-03 ${SPREAD_IDENTITIES} seeded identities each take Mystery 1 to clue 4, and each display position holds the key ${SPREAD_BAND.min} to ${SPREAD_BAND.max} times`,
    async (env) => {
      const counts = [0, 0, 0, 0];
      for (let n = 0; n < SPREAD_IDENTITIES; n += 1) {
        const player = createContractEnv(env.target, {
          ...env.options,
          random: seededBytes(`daily-contract:r2-03:${n}`),
        });
        const position = await keyPositionAtClue4(player);
        counts[position] = (counts[position] ?? 0) + 1;
      }
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(
        SPREAD_IDENTITIES,
      );
      counts.forEach((count, position) => {
        const at = `the key at ${POSITIONS[position] ?? position} (${counts.join(", ")} at A to D)`;
        expect(count, at).toBeGreaterThanOrEqual(SPREAD_BAND.min);
        expect(count, at).toBeLessThanOrEqual(SPREAD_BAND.max);
      });
    },
    { realTimeoutMs: SPREAD_REAL_TIMEOUT_MS },
  );

  test(
    "act",
    "R2-08 every verdict that resolves a round carries its recorded time in whole seconds, a reload reads the same, and the finish adds them",
    async (env) => {
      const backend = env.backend;
      let snapshot = value(
        await backend.sealed.start({ kind: "today" }, START),
        "start",
      );
      const recorded: number[] = [];
      let finished: FinishSummary | null = null;
      for (const meta of snapshot.rounds) {
        let open = await openRound(backend, snapshot, meta.index);
        while (open !== null) {
          const acted = await act(
            backend,
            snapshot.attemptId,
            meta.index,
            stepOf(open),
            moveOn(open),
          );
          if (acted.verdict.kind === "continue") {
            open = acted.verdict.open;
            continue;
          }
          const ms = acted.activeMs;
          expect(ms, `round ${meta.index + 1}'s recorded time`).not.toBeNull();
          expect(Number.isInteger((ms ?? 0) / 1000)).toBe(true);
          expect(ms).toBeGreaterThanOrEqual(0);
          expect(ms).toBeLessThanOrEqual(SHARED.roundCapMs);
          recorded.push(ms ?? 0);
          finished = acted.finished ?? finished;
          open = null;
        }
        snapshot = value(
          await backend.sealed.get(snapshot.attemptId),
          `get after round ${meta.index + 1}`,
        );
      }
      expect(recorded).toHaveLength(snapshot.rounds.length);
      expect(
        [...snapshot.resolved]
          .sort((a, b) => a.meta.index - b.meta.index)
          .map((round) => round.activeMs),
      ).toEqual(recorded);
      const summary =
        finished ??
        value(await backend.sealed.finish(snapshot.attemptId), "finish");
      expect(summary.totalMs).toBe(recorded.reduce((sum, ms) => sum + ms, 0));
    },
  );
});
