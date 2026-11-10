/**
 * The identity contract (ARCHITECTURE §7.5, §8.4, §8.5): one behavioral
 * suite for GameBackend.identity, run against the mock in every `npm test`
 * (identity.mock.test.ts) and against the real project in the
 * backend-contract workflow (identity.real.test.ts). The mock run skips the
 * methods its area does not implement yet (MOCK_CAPABILITIES), so the
 * sync-code, claim, export and deletion tests run only against the real
 * project until IDN-2 and SET-1 build them in the mock.
 *
 * Every test starts from a fresh test identity (§8.17), so real writes land
 * on the e2e track and are removed after a day. The SQL tests in
 * supabase/tests/identity/ hold the limits, the hashing and the races.
 */
import { expect } from "vitest";

import {
  parseClaimToken,
  parsePlayerId,
  type ClaimToken,
  type LocalIdentity,
  type Profile,
  type Result,
  type Secret,
} from "@/engine/types";

import type { BrowserContextInfo } from "../types";
import {
  createContractEnv,
  createTestIdentity,
  defineContract,
  type ContractEnv,
} from "./harness";

const BROWSER: BrowserContextInfo = {
  context: "browser",
  app: "none",
  platform: "desktop",
};

/** The value of an ok result, or a failure naming the error. */
function value<T>(result: Result<T>, what: string): T {
  if (!result.ok) {
    throw new Error(`${what}: ${result.error.code}`);
  }
  return result.value;
}

/** A fresh 43-character secret, as a device mints one. */
function mintSecret(): Secret {
  return createTestIdentity().current().secret;
}

/** A fresh claim token, minted on the device like a secret (§2.4). */
function mintToken(): ClaimToken {
  const token = parseClaimToken(mintSecret());
  if (token === null) throw new Error("minted a malformed claim token");
  return token;
}

/** Another context of the same target: a second device or browser. */
function secondContext(env: ContractEnv): ContractEnv {
  return createContractEnv(env.target);
}

/** The identity a restore leaves on the device that redeemed it. */
function restoredIdentity(playerId: string, secret: Secret): LocalIdentity {
  const id = parsePlayerId(playerId);
  if (id === null) throw new Error(`not a player id: ${playerId}`);
  return {
    v: 1,
    playerId: id,
    secret,
    registered: true,
    createdAt: Date.now(),
    source: "sync",
    cookieSavedAt: null,
  };
}

function expectProfileOf(profile: Profile, env: ContractEnv): void {
  expect(profile.playerId).toBe(env.identity.current().playerId);
  expect(profile.friendlyName).toMatch(/^\S+ \S+$/);
  expect(profile.nickname).toBeNull();
  expect(profile.ageBand).toBeNull();
  expect(Number.isSafeInteger(profile.createdAt)).toBe(true);
}

export const identityContract = defineContract("identity", (test) => {
  test(
    "register",
    "register creates the player and answers its generated profile",
    async (env) => {
      const profile = value(
        await env.backend.identity.register(BROWSER),
        "register",
      );
      expectProfileOf(profile, env);
      expect(env.identity.current().registered).toBe(true);
      const again = value(
        await env.backend.identity.register(BROWSER),
        "register again",
      );
      expect(again).toEqual(profile);
    },
  );

  test(
    "register",
    "two first writes of one identity at once create one player",
    async (env) => {
      const [first, second] = await Promise.all([
        env.backend.identity.register(BROWSER),
        env.backend.identity.register(BROWSER),
      ]);
      expect(value(first, "the first")).toEqual(value(second, "the second"));
    },
  );

  test(
    "getProfile",
    "getProfile is auth_failed before registration and the profile after",
    async (env) => {
      const before = await env.backend.identity.getProfile();
      expect(before.ok ? "ok" : before.error.code).toBe("auth_failed");
      const profile = value(
        await env.backend.identity.register(BROWSER),
        "register",
      );
      expect(
        value(await env.backend.identity.getProfile(), "getProfile"),
      ).toEqual(profile);
    },
  );

  test(
    "getProfile",
    "a wrong secret for a registered player is auth_failed, for reads and writes",
    async (env) => {
      value(await env.backend.identity.register(BROWSER), "register");
      const original = env.identity.current();
      env.identity.replace({ ...original, secret: mintSecret() });
      for (const result of [
        await env.backend.identity.getProfile(),
        await env.backend.identity.register(BROWSER),
      ]) {
        expect(result.ok ? "ok" : result.error.code).toBe("auth_failed");
      }
      env.identity.replace(original);
      expect((await env.backend.identity.getProfile()).ok).toBe(true);
    },
  );

  test(
    "setAgeBand",
    "setAgeBand stores 13_17 or 18_plus and never sends under_13",
    async (env) => {
      value(await env.backend.identity.register(BROWSER), "register");
      const minor = value(
        await env.backend.identity.setAgeBand("13_17", "group"),
        "13_17",
      );
      expect(minor.ageBand).toBe("13_17");
      const adult = value(
        await env.backend.identity.setAgeBand("18_plus", "quiz_share"),
        "18_plus",
      );
      expect(adult.ageBand).toBe("18_plus");
      const under = await env.backend.identity.setAgeBand(
        "under_13",
        "nickname",
      );
      expect(under.ok ? "ok" : under.error.code).toBe("invalid_input");
      expect(
        value(await env.backend.identity.getProfile(), "getProfile").ageBand,
      ).toBe("18_plus");
    },
  );

  test(
    "createSyncCode",
    "AC-SYN-03 a new sync code ends the old one",
    async (env) => {
      value(await env.backend.identity.register(BROWSER), "register");
      const first = value(
        await env.backend.identity.createSyncCode(),
        "first code",
      );
      const second = value(
        await env.backend.identity.createSyncCode(),
        "second code",
      );
      expect(second.code).not.toBe(first.code);
      const device = secondContext(env);
      const old = await device.backend.identity.redeemSyncCode(
        first.code,
        device.identity.current().secret,
      );
      expect(old.ok ? "ok" : old.error.code).toBe("not_found");
      const restored = value(
        await device.backend.identity.redeemSyncCode(
          second.code,
          device.identity.current().secret,
        ),
        "the new code",
      );
      expect(restored.playerId).toBe(env.identity.current().playerId);
    },
  );

  test(
    "redeemSyncCode",
    "a sync code typed in lower case with groups restores the player on another device",
    async (env) => {
      const profile = value(
        await env.backend.identity.register(BROWSER),
        "register",
      );
      const { code } = value(
        await env.backend.identity.createSyncCode(),
        "createSyncCode",
      );
      const device = secondContext(env);
      const secret = device.identity.current().secret;
      const typed = code.toLowerCase().replace(/(.{4})(?!$)/g, "$1-");
      const restored = value(
        await device.backend.identity.redeemSyncCode(typed, secret),
        "redeem",
      );
      expect(restored.playerId).toBe(profile.playerId);
      expect(restored.profile).toEqual(profile);
      expect(restored.streak.current).toBeGreaterThanOrEqual(0);
      device.identity.replace(restoredIdentity(restored.playerId, secret));
      expect(
        value(await device.backend.identity.getProfile(), "the restored device")
          .playerId,
      ).toBe(profile.playerId);
      expect((await env.backend.identity.getProfile()).ok).toBe(true);
      const bad = await device.backend.identity.redeemSyncCode(
        "not a code",
        secret,
      );
      expect(bad.ok ? "ok" : bad.error.code).toBe("invalid_input");
    },
  );

  test(
    "createClaim",
    "AC-IAB-04 a claim redeems once in a second context for the same player id",
    async (env) => {
      const profile = value(
        await env.backend.identity.register(BROWSER),
        "register",
      );
      const token = mintToken();
      const created = value(
        await env.backend.identity.createClaim(token),
        "createClaim",
      );
      expect(
        value(await env.backend.identity.createClaim(token), "a retry"),
      ).toEqual(created);

      const browser = secondContext(env);
      const preview = value(
        await browser.backend.identity.peekClaim(token),
        "peekClaim",
      );
      expect(preview.friendlyName).toBe(profile.friendlyName);
      expect(preview.expiresAt).toBe(created.expiresAt);
      const secret = browser.identity.current().secret;
      const restored = value(
        await browser.backend.identity.redeemClaim(token, secret),
        "redeemClaim",
      );
      expect(restored.playerId).toBe(profile.playerId);
      browser.identity.replace({
        ...restoredIdentity(restored.playerId, secret),
        source: "claim",
      });
      expect((await browser.backend.identity.getProfile()).ok).toBe(true);
      expect((await env.backend.identity.getProfile()).ok).toBe(true);

      const again = await secondContext(env).backend.identity.redeemClaim(
        token,
        mintSecret(),
      );
      expect(again.ok ? "ok" : again.error.code).toBe("expired");
      if (!again.ok) expect(again.error.current).toEqual({ used: true });
    },
  );

  test(
    "setNickname",
    "a blank or oversized name is invalid_input and spends none of the day's 20 calls",
    async (env) => {
      const profile = value(
        await env.backend.identity.register(BROWSER),
        "register",
      );
      for (let call = 1; call <= 20; call += 1) {
        const result = await env.backend.identity.setNickname(
          call === 20 ? { custom: "x".repeat(8193) } : { custom: " " },
        );
        expect(result.ok ? "ok" : result.error.code).toBe("invalid_input");
      }
      const chosen = value(
        await env.backend.identity.setNickname({
          generated: profile.friendlyName,
        }),
        "the friendly name",
      );
      expect(chosen.nickname).toBeNull();
    },
  );

  test(
    "setNickname",
    "an unregistered device's blank name is invalid_input",
    async (env) => {
      const result = await env.backend.identity.setNickname({ custom: "" });
      expect(result.ok ? "ok" : result.error.code).toBe("invalid_input");
    },
  );

  test("peekClaim", "a token nobody holds is not_found", async (env) => {
    const result = await env.backend.identity.peekClaim(mintToken());
    expect(result.ok ? "ok" : result.error.code).toBe("not_found");
  });

  test(
    "exportData",
    "exportData answers the profile and the arrays, without the secret",
    async (env) => {
      const profile = value(
        await env.backend.identity.register(BROWSER),
        "register",
      );
      const exported = value(
        await env.backend.identity.exportData(),
        "exportData",
      );
      expect(exported.profile).toEqual(profile);
      for (const list of [
        exported.attempts,
        exported.streakDays,
        exported.groups,
        exported.challenges,
        exported.quizzes,
      ]) {
        expect(Array.isArray(list)).toBe(true);
      }
      expect(JSON.stringify(exported)).not.toContain(
        env.identity.current().secret,
      );
    },
  );

  test(
    "deletePlayer",
    "deletePlayer removes the player, or waits for its attended body with unavailable",
    async (env) => {
      value(await env.backend.identity.register(BROWSER), "register");
      const result = await env.backend.identity.deletePlayer();
      if (result.ok) {
        const after = await env.backend.identity.getProfile();
        expect(after.ok ? "ok" : after.error.code).toBe("auth_failed");
      } else {
        expect(result.error.code).toBe("unavailable");
        expect(result.error.retryAfterMs).toBeGreaterThan(0);
        expect((await env.backend.identity.getProfile()).ok).toBe(true);
      }
    },
  );
});
