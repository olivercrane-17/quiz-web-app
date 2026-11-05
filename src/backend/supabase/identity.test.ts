/**
 * The Supabase identity adapter (ARCHITECTURE §7.5, §8.4): which RPC each
 * method calls with which arguments and credential, and how the replies
 * decode. The replies are the envelopes the identity RPCs really return,
 * recorded with supabase/tests/identity/identity.payloads.sql into
 * __fixtures__/identity.*.json.
 */
import { describe, expect, it, vi } from "vitest";

import {
  parseClaimToken,
  parsePlayerId,
  parseSecret,
  type LocalIdentity,
} from "@/engine/types";

import authFailed from "./__fixtures__/identity.auth-failed.json";
import claimPreview from "./__fixtures__/identity.claim-preview.json";
import claimRestored from "./__fixtures__/identity.claim-restored.json";
import claimUsed from "./__fixtures__/identity.claim-used.json";
import claim from "./__fixtures__/identity.claim.json";
import clientIp from "./__fixtures__/identity.client-ip.json";
import deleteUnavailable from "./__fixtures__/identity.delete.json";
import exported from "./__fixtures__/identity.export.json";
import profileAged from "./__fixtures__/identity.profile-aged.json";
import profile from "./__fixtures__/identity.profile.json";
import rateLimited from "./__fixtures__/identity.register-rate-limited.json";
import restored from "./__fixtures__/identity.restored.json";
import syncCode from "./__fixtures__/identity.sync-code.json";
import syncNotFound from "./__fixtures__/identity.sync-not-found.json";
import okEmpty from "./__fixtures__/envelope.ok-empty.json";
import type { SupabaseContext } from "./context";
import { decodeExport, decodeProfile, createIdentityArea } from "./identity";
import {
  createRpcCaller,
  type RpcClient,
  type RpcEvent,
  type RpcReply,
  type RpcRequest,
} from "./rpc";

const PLAYER = parsePlayerId(profile.data.player_id);
const SECRET = parseSecret("BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc");
const NEW_SECRET = parseSecret("CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg");
const TOKEN = parseClaimToken("CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk");
if (
  PLAYER === null ||
  SECRET === null ||
  NEW_SECRET === null ||
  TOKEN === null
) {
  throw new Error("bad test values");
}

/** A client that answers each RPC with a recorded envelope. */
function setup(replies: Record<string, unknown>, registered = false) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      const reply: RpcReply = {
        data: replies[fn] ?? null,
        error: null,
        status: 200,
      };
      const request: RpcRequest = {
        abortSignal: () => request,
        then: (onfulfilled, onrejected) =>
          Promise.resolve(reply).then(onfulfilled, onrejected),
      };
      return request;
    },
  };
  const identity: LocalIdentity = {
    v: 1,
    playerId: PLAYER as NonNullable<typeof PLAYER>,
    secret: SECRET as NonNullable<typeof SECRET>,
    registered,
    createdAt: 1,
    source: "minted",
    cookieSavedAt: null,
  };
  const provider = {
    current: vi.fn(() => identity),
    markRegistered: vi.fn(),
    replace: vi.fn(),
  };
  const observe = vi.fn();
  const ctx: SupabaseContext = {
    deps: {
      identity: () => provider,
      serverClock: {
        observe,
        now: () => 0,
        monotonic: () => 0,
        offsetMs: () => 0,
        samples: () => [],
      },
    },
  };
  const events: RpcEvent[] = [];
  const rpc = createRpcCaller({
    getClient: async () => client,
    now: () => 1_000,
    isOnline: () => true,
    report: (event) => events.push(event),
  });
  return {
    area: createIdentityArea(ctx, rpc),
    calls,
    provider,
    observe,
    events,
  };
}

const CREDENTIAL = { p_player: PLAYER, p_secret: SECRET };

describe("register and profiles", () => {
  it("registers through register_player with the credential, the context and the app, and marks the identity registered", async () => {
    const t = setup({ register_player: profile });
    const result = await t.area.register({
      context: "in_app",
      app: "whatsapp",
      platform: "ios",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        playerId: PLAYER,
        friendlyName: profile.data.friendly_name,
        nickname: null,
        ageBand: null,
        createdAt: profile.data.created_at,
      },
    });
    expect(t.calls).toEqual([
      {
        fn: "register_player",
        args: { p_context: "in_app", p_app: "whatsapp", ...CREDENTIAL },
      },
    ]);
    expect(t.provider.markRegistered).toHaveBeenCalledTimes(1);
    expect(t.observe).toHaveBeenCalledWith(profile.server_time, 1_000, 1_000);
  });

  it("reads the profile through get_profile without marking anything", async () => {
    const t = setup({ get_profile: profileAged });
    const result = await t.area.getProfile();
    expect(result.ok && result.value.ageBand).toBe("18_plus");
    expect(t.calls).toEqual([{ fn: "get_profile", args: CREDENTIAL }]);
    expect(t.provider.markRegistered).not.toHaveBeenCalled();
  });

  it("answers the server's errors as BackendErrors", async () => {
    const t = setup({ get_profile: authFailed, register_player: rateLimited });
    const failed = await t.area.getProfile();
    expect(failed.ok ? null : failed.error.code).toBe("auth_failed");
    const limited = await t.area.register({
      context: "browser",
      app: "none",
      platform: "desktop",
    });
    expect(limited.ok ? null : limited.error).toMatchObject({
      code: "rate_limited",
      retryable: true,
      retryAfterMs: 60_000,
      limitScope: "ip",
    });
    expect(t.provider.markRegistered).not.toHaveBeenCalled();
  });

  it("turns a profile it cannot decode into internal and reports the path", async () => {
    const broken = {
      ...profile,
      data: {
        ...profile.data,
        player_id: "6f1d2c3b-4a5e-1f60-8a7b-9c8d7e6f5a4b",
      },
    };
    const t = setup({ get_profile: broken });
    const result = await t.area.getProfile();
    expect(result.ok ? null : result.error.code).toBe("internal");
    expect(t.events).toContainEqual({
      type: "decode_error",
      fn: "get_profile",
      path: "data.player_id",
    });
  });
});

describe("age band and nickname", () => {
  it("stores the band through set_age_band, and never sends under_13", async () => {
    const t = setup({ set_age_band: profileAged });
    const result = await t.area.setAgeBand("18_plus", "nickname");
    expect(result.ok && result.value.ageBand).toBe("18_plus");
    expect(t.calls).toEqual([
      {
        fn: "set_age_band",
        args: { p_band: "18_plus", p_moment: "nickname", ...CREDENTIAL },
      },
    ]);
    const under = await t.area.setAgeBand("under_13", "group");
    expect(under.ok ? null : under.error.code).toBe("invalid_input");
    expect(t.calls).toHaveLength(1);
  });

  it("leaves setNickname unavailable until MOD-1 adds set_nickname", async () => {
    const t = setup({});
    const result = await t.area.setNickname({ generated: "Brave Fox" });
    expect(result.ok ? null : result.error.code).toBe("unavailable");
    expect(t.calls).toEqual([]);
  });
});

describe("sync codes", () => {
  it("creates a code through create_sync_code", async () => {
    const t = setup({ create_sync_code: syncCode });
    const result = await t.area.createSyncCode();
    expect(result).toEqual({
      ok: true,
      value: { code: syncCode.data.code, createdAt: syncCode.data.created_at },
    });
    expect(t.calls).toEqual([{ fn: "create_sync_code", args: CREDENTIAL }]);
  });

  it("redeems the normalized code with the new secret, and no credential of its own", async () => {
    const t = setup({ redeem_sync_code: restored });
    const typed = syncCode.data.code
      .toLowerCase()
      .replace(/(.{4})(?!$)/g, "$1-")
      .replaceAll("0", "o");
    const result = await t.area.redeemSyncCode(typed, NEW_SECRET);
    expect(result).toEqual({
      ok: true,
      value: {
        playerId: PLAYER,
        profile: {
          playerId: PLAYER,
          friendlyName: restored.data.profile.friendly_name,
          nickname: null,
          ageBand: "18_plus",
          createdAt: restored.data.profile.created_at,
        },
        streak: { current: 0, best: 0 },
        lastDaily: null,
      },
    });
    expect(t.calls).toEqual([
      {
        fn: "redeem_sync_code",
        args: { p_code: syncCode.data.code, p_new_secret: NEW_SECRET },
      },
    ]);
    expect(t.provider.current).not.toHaveBeenCalled();
  });

  it("refuses a code that cannot be one without spending an attempt, and maps not_found", async () => {
    const t = setup({ redeem_sync_code: syncNotFound });
    const malformed = await t.area.redeemSyncCode("K7QX-2M9P", NEW_SECRET);
    expect(malformed.ok ? null : malformed.error.code).toBe("invalid_input");
    expect(t.calls).toEqual([]);
    const unknown = await t.area.redeemSyncCode(
      "ZZZZ-ZZZZ-ZZZZ-ZZZZ",
      NEW_SECRET,
    );
    expect(unknown.ok ? null : unknown.error.code).toBe("not_found");
  });
});

describe("claims", () => {
  it("creates a claim with the device-minted token", async () => {
    const t = setup({ create_claim: claim });
    const result = await t.area.createClaim(TOKEN);
    expect(result).toEqual({
      ok: true,
      value: { expiresAt: claim.data.expires_at },
    });
    expect(t.calls).toEqual([
      { fn: "create_claim", args: { p_token: TOKEN, ...CREDENTIAL } },
    ]);
  });

  it("previews and redeems a claim with the token alone", async () => {
    const t = setup({ peek_claim: claimPreview, redeem_claim: claimRestored });
    const preview = await t.area.peekClaim(TOKEN);
    expect(preview).toEqual({
      ok: true,
      value: {
        friendlyName: claimPreview.data.friendly_name,
        nickname: null,
        streak: 0,
        lastDaily: null,
        expiresAt: claimPreview.data.expires_at,
      },
    });
    const redeemed = await t.area.redeemClaim(TOKEN, NEW_SECRET);
    expect(redeemed.ok && redeemed.value.playerId).toBe(PLAYER);
    expect(t.calls).toEqual([
      { fn: "peek_claim", args: { p_token: TOKEN } },
      {
        fn: "redeem_claim",
        args: { p_token: TOKEN, p_new_secret: NEW_SECRET },
      },
    ]);
  });

  it("answers a used claim as expired, with current telling used from expired", async () => {
    const t = setup({ peek_claim: claimUsed });
    const result = await t.area.peekClaim(TOKEN);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "expired",
      current: { used: true },
    });
  });
});

describe("export and deletion", () => {
  it("decodes the export and keeps the server's account block", async () => {
    const t = setup({ export_my_data: exported });
    const result = await t.area.exportData();
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.profile.playerId).toBe(PLAYER);
    expect(result.value.exportedAt).toBe(exported.data.exported_at);
    expect(result.value.attempts).toEqual([]);
    expect(result.value.streakDays).toEqual([]);
    expect((result.value as { account?: unknown }).account).toEqual(
      exported.data.account,
    );
    expect(t.calls).toEqual([{ fn: "export_my_data", args: CREDENTIAL }]);
  });

  it("leaves account out when the server sends none", () => {
    const { account: _account, ...rest } = exported.data;
    expect("account" in decodeExport(rest, "data")).toBe(false);
  });

  it("deletes through delete_player, and passes on unavailable with its wait while the attended body waits", async () => {
    const waiting = setup({ delete_player: deleteUnavailable });
    const result = await waiting.area.deletePlayer();
    expect(result.ok ? null : result.error).toMatchObject({
      code: "unavailable",
      retryAfterMs: 3_600_000,
    });
    expect(waiting.calls).toEqual([{ fn: "delete_player", args: CREDENTIAL }]);

    const done = setup({ delete_player: okEmpty });
    expect(await done.area.deletePlayer()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(done.provider.markRegistered).not.toHaveBeenCalled();
  });
});

describe("the recorded client-ip report", () => {
  it("holds booleans, kinds and header names, and no address", () => {
    expect(clientIp.ok).toBe(true);
    expect(Object.keys(clientIp.data).sort()).toEqual([
      "chosen_forged",
      "chosen_kind",
      "first_hop_forged",
      "forged_headers",
      "header_names",
      "hop_kinds",
      "hops",
      "last_hop_forged",
      "rule",
    ]);
    expect(JSON.stringify(clientIp)).not.toMatch(/\d{1,3}(?:\.\d{1,3}){3}/);
  });

  it("decodes the profile fixture with the shared decoder", () => {
    expect(decodeProfile(profile.data, "data").playerId).toBe(PLAYER);
  });
});
