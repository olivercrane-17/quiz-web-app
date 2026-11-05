/**
 * The mock's setNickname (MOD-1, ARCHITECTURE §8.4), which follows
 * `set_nickname` in supabase/migrations/20261104000700_moderation.sql:
 * generated names at any band, custom names for 18_plus through the slur
 * filter, cleaning and the 24-character cap, the friendly name clearing the
 * column, and 20 a day. Friendly names come from the reviewed lists. The
 * filter's real list is decoded in memory here and never printed.
 */
import { describe, expect, it } from "vitest";

import { MODERATION_TERMS_ROT13 } from "@/content/generated/moderation";
import { NAME_ADJECTIVES, NAME_ANIMALS } from "@/content/generated/names";
import { createFakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import { rot13 } from "@/engine/text/moderation";
import type { EpochMs } from "@/engine/types";
import {
  createLocalIdentityProvider,
  mintIdentity,
} from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type { BrowserContextInfo } from "../../types";
import { createMockBackend } from "../index";
import { createMemoryStore } from "../store";
import { MOCK_CAPABILITIES, type MockPlayerRow } from "./identity";

/** 09:00 UTC on Thursday 5 November 2026. */
const NOV_5 = Date.UTC(2026, 10, 5, 9) as EpochMs;
const BROWSER: BrowserContextInfo = {
  context: "browser",
  app: "none",
  platform: "desktop",
};

async function setup() {
  const clock = createFakeClock(NOV_5);
  const store = createMemoryStore({});
  const identity = createLocalIdentityProvider({
    kv: createKv({ storage: createMemoryStorage() }),
    now: () => clock.now(),
  });
  identity.replace(mintIdentity(clock.now()));
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
      plugins: createEchoRegistry(),
    },
  );
  const registered = await mock.identity.register(BROWSER);
  if (!registered.ok) throw new Error(registered.error.code);
  const player = registered.value;
  return {
    mock,
    clock,
    identity,
    player,
    /** Sets the age band as set_age_band would; the mock has no setAgeBand yet. */
    async band(band: MockPlayerRow["ageBand"]) {
      await store.write(
        (db) => {
          const players = db.players as Record<string, MockPlayerRow>;
          (players[player.playerId] as MockPlayerRow).ageBand = band;
        },
        ["players"],
      );
    },
    stored() {
      return store.read(
        (db) =>
          (db.players as Record<string, MockPlayerRow>)[player.playerId]
            ?.nickname ?? null,
      );
    },
  };
}

const code = (result: { ok: boolean; error?: { code: string } }) =>
  result.ok ? "ok" : result.error?.code;

describe("the mock's friendly names and setNickname", () => {
  it("names new players from the reviewed lists and implements setNickname", async () => {
    const t = await setup();
    const [adjective, animal] = t.player.friendlyName.split(" ");
    expect(NAME_ADJECTIVES).toContain(adjective);
    expect(NAME_ANIMALS).toContain(animal);
    expect(MOCK_CAPABILITIES).toContain("setNickname");
  });

  it("takes a generated pair or the friendly name at any band, and the friendly name clears the column", async () => {
    const t = await setup();
    const pair = `${NAME_ADJECTIVES[0]} ${NAME_ANIMALS[0]}`;
    const set = await t.mock.identity.setNickname({ generated: pair });
    expect(set.ok && set.value.nickname).toBe(pair);
    expect(t.stored()).toBe(pair);
    const cleared = await t.mock.identity.setNickname({
      generated: t.player.friendlyName,
    });
    expect(cleared.ok && cleared.value.nickname).toBeNull();
    for (const generated of [
      "Dee",
      `${NAME_ANIMALS[0]} ${NAME_ADJECTIVES[0]}`,
      `${pair} Two`,
      pair.toLowerCase(),
    ]) {
      expect(code(await t.mock.identity.setNickname({ generated }))).toBe(
        "invalid_input",
      );
    }
    expect(t.stored()).toBeNull();
  });

  it("asks for the band before a custom name, and keeps 13 to 17 on generated names", async () => {
    const t = await setup();
    expect(code(await t.mock.identity.setNickname({ custom: "Dee" }))).toBe(
      "age_required",
    );
    await t.band("13_17");
    expect(code(await t.mock.identity.setNickname({ custom: "Dee" }))).toBe(
      "age_forbidden",
    );
    expect(
      code(
        await t.mock.identity.setNickname({
          generated: `${NAME_ADJECTIVES[1]} ${NAME_ANIMALS[1]}`,
        }),
      ),
    ).toBe("ok");
  });

  it("cleans custom names and caps them at 24 characters", async () => {
    const t = await setup();
    await t.band("18_plus");
    const set = await t.mock.identity.setNickname({ custom: "  Dee   two " });
    expect(set.ok && set.value.nickname).toBe("Dee two");
    expect(
      code(await t.mock.identity.setNickname({ custom: "x".repeat(24) })),
    ).toBe("ok");
    expect(
      code(await t.mock.identity.setNickname({ custom: "x".repeat(25) })),
    ).toBe("invalid_input");
    expect(code(await t.mock.identity.setNickname({ custom: "   " }))).toBe(
      "invalid_input",
    );
  });

  it("refuses a listed term with blocked_text and keeps the name it had", async () => {
    const t = await setup();
    await t.band("18_plus");
    await t.mock.identity.setNickname({ custom: "Dee" });
    const term = rot13(MODERATION_TERMS_ROT13[0] as string);
    const result = await t.mock.identity.setNickname({
      custom: term.toUpperCase(),
    });
    expect(code(result)).toBe("blocked_text");
    expect(t.stored()).toBe("Dee");
  });

  it("allows 20 calls a day, refusals included, then refuses until the next day", async () => {
    const t = await setup();
    for (let call = 1; call <= 20; call += 1) {
      const result = await t.mock.identity.setNickname(
        call % 2 === 0
          ? { custom: "Dee" }
          : { generated: t.player.friendlyName },
      );
      expect(code(result)).toBe(call % 2 === 0 ? "age_required" : "ok");
    }
    const refused = await t.mock.identity.setNickname({
      generated: t.player.friendlyName,
    });
    expect(refused).toMatchObject({
      ok: false,
      error: { code: "rate_limited", limitScope: "player" },
    });
    t.clock.advance(15 * 60 * 60_000);
    expect(
      code(
        await t.mock.identity.setNickname({ generated: t.player.friendlyName }),
      ),
    ).toBe("ok");
  });

  it("answers a missing name invalid_input, as set_nickname does for a null name or kind, never a TypeError", async () => {
    const t = await setup();
    await t.band("18_plus");
    for (const nickname of [undefined, null, {}, { custom: 7 }]) {
      expect(code(await t.mock.identity.setNickname(nickname as never))).toBe(
        "invalid_input",
      );
    }
    expect(t.stored()).toBeNull();
  });

  it("answers an unregistered device auth_failed and registers nothing", async () => {
    const t = await setup();
    t.identity.replace(mintIdentity(t.clock.now()));
    expect(
      code(
        await t.mock.identity.setNickname({ generated: t.player.friendlyName }),
      ),
    ).toBe("auth_failed");
  });
});
