/**
 * The contract harness itself (ARCHITECTURE §7.5): test identities, the
 * environments it builds, and a mock run that skips what the mock area
 * does not implement.
 */
import { describe, expect, it } from "vitest";

import { createFakeClock } from "@/engine/clock";
import {
  isTestPlayerId,
  parsePlayerId,
  parseSecret,
  parseTimeZone,
  type TimeZone,
} from "@/engine/types";

import { AREA_METHODS } from "../areas";
import {
  MOCK_CAPABILITY_MAP,
  REAL_BACKEND,
  createContractEnv,
  createTestIdentity,
  defineContract,
  runContract,
} from "./harness";

describe("createTestIdentity", () => {
  it("mints a reserved e2e2e2e2- v4 player id and a 43-character secret, fresh each time", () => {
    const first = createTestIdentity().current();
    const second = createTestIdentity().current();
    const id = parsePlayerId(first.playerId);
    expect(id).not.toBeNull();
    expect(id !== null && isTestPlayerId(id)).toBe(true);
    expect(parseSecret(first.secret)).not.toBeNull();
    expect(first.registered).toBe(false);
    expect(second.playerId).not.toBe(first.playerId);
    expect(second.secret).not.toBe(first.secret);
  });

  it("follows markRegistered and replace like the tab's provider", () => {
    const provider = createTestIdentity();
    provider.markRegistered();
    expect(provider.current().registered).toBe(true);
    expect(provider.registrations).toBe(1);
    const other = createTestIdentity().current();
    provider.replace(other);
    expect(provider.current()).toBe(other);
  });
});

describe("the harness", () => {
  it("lists only methods each area really has", () => {
    for (const [area, methods] of Object.entries(MOCK_CAPABILITY_MAP)) {
      const all: readonly string[] =
        AREA_METHODS[area as keyof typeof AREA_METHODS];
      for (const method of methods)
        expect(all, `${area}.${method}`).toContain(method);
    }
    expect(MOCK_CAPABILITY_MAP.sealed).toContain("start");
  });

  it("builds the mock backend in memory, and the real run waits for QZ_REAL_BACKEND", () => {
    const env = createContractEnv("mock");
    expect(env.backend.mode).toBe("mock");
    expect(env.identity.current().registered).toBe(false);
    expect(REAL_BACKEND).toBe(false);
  });

  it("R2-03 gives each context the mock clock its suite asked for, and seeds identities on request", async () => {
    const at = Date.UTC(2026, 10, 5, 9);
    const options = {
      mockClock: () => createFakeClock(at),
      random: (bytes: number) => new Uint8Array(bytes).fill(7),
    };
    const first = createContractEnv("mock", options);
    const second = createContractEnv("mock", options);
    // Seeded: the same bytes give the same player, in a context of its own.
    expect(second.identity.current().playerId).toBe(
      first.identity.current().playerId,
    );
    expect(second.backend).not.toBe(first.backend);
    expect(first.options).toBe(options);
    const today = await first.backend.daily.today(
      parseTimeZone("UTC") as TimeZone,
    );
    expect(today.ok && today.value.daily.dailyNumber).toBe(46);
    expect(today.ok && today.value.serverTime).toBe(at);
  });
});

// A suite in the shape the SQL tickets write: the mock run executes the
// methods its area implements and skips the rest.
runContract(
  defineContract("sealed", (test) => {
    test(
      "start",
      "the mock run executes a method the mock implements",
      async ({ backend, target }) => {
        expect(target).toBe("mock");
        expect(backend.mode).toBe("mock");
      },
    );
  }),
  "mock",
);
runContract(
  defineContract("health", (test) => {
    test(
      "status",
      "the mock run skips a method the mock does not implement",
      async () => {
        throw new Error("a skipped contract test ran");
      },
    );
  }),
  "mock",
);
runContract(
  defineContract("health", (test) => {
    test(
      "status",
      "the real run skips itself without QZ_REAL_BACKEND",
      async () => {
        throw new Error("a real contract test ran in npm test");
      },
    );
  }),
  "real",
);
