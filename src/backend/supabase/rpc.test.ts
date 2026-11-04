/**
 * call(), the RPC wrapper (ARCHITECTURE §7.5): envelope mapping, 429 with
 * Retry-After or the wait in its body, offline and unreachable, timeout
 * (the SDK download included), server-clock samples, the credential,
 * markRegistered, the one recovery after auth_failed and the reports. It
 * drives the real
 * supabase-js client, with its fetch recording responses, over a stubbed
 * platform fetch.
 */
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parsePlayerId, parseSecret, type LocalIdentity } from "@/engine/types";
import type { IdentityProvider } from "@/platform/identity/provider";

import internalEnvelope from "./__fixtures__/envelope.internal.json";
import authFailedEnvelope from "./__fixtures__/identity.auth-failed.json";
import okEnvelope from "./__fixtures__/envelope.ok.json";
import rateLimitedEnvelope from "./__fixtures__/envelope.rate-limited.json";
import staleEnvelope from "./__fixtures__/envelope.stale.json";
import sheddingEnvelope from "./__fixtures__/envelope.unavailable-shedding.json";
import { SupabaseSdkLoadError, clientOptions } from "./client";
import type { SupabaseContext } from "./context";
import { epochMs, none, object, string } from "./decode";
import {
  DEFAULT_RETRY_AFTER_MS,
  RPC_EVENT,
  RPC_TIMEOUT_MS,
  call as defaultCall,
  createRpcCaller,
  dispatchRpcEvent,
  parseRetryAfter,
  parseRetryAfterDetails,
  type RpcClient,
  type RpcEvent,
  type RpcRuntime,
} from "./rpc";

const URL_BASE = "https://example.supabase.co";
const KEY = "sb_publishable_test_key";
const PLAYER = parsePlayerId("6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b");
const SECRET = parseSecret("BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc");
if (PLAYER === null || SECRET === null) throw new Error("bad test identity");
/** The identity a recovery brings back from the backup cookie. */
const COOKIE_PLAYER = parsePlayerId("0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e");
const COOKIE_SECRET = parseSecret(
  "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg",
);
if (COOKIE_PLAYER === null || COOKIE_SECRET === null) {
  throw new Error("bad cookie identity");
}

// One real client for the file: supabase-js warns when a page holds more.
const client = createClient(
  URL_BASE,
  KEY,
  clientOptions(),
) as unknown as RpcClient;

const decodeCode = object({ code: string, expiresAt: epochMs });

function identity(registered: boolean): LocalIdentity {
  return {
    v: 1,
    playerId: PLAYER as NonNullable<typeof PLAYER>,
    secret: SECRET as NonNullable<typeof SECRET>,
    registered,
    createdAt: 1,
    source: "minted",
    cookieSavedAt: null,
  };
}

function setup(
  options: {
    registered?: boolean;
    online?: boolean;
    runtime?: Partial<RpcRuntime>;
    /** The provider's recover(); none by default, as in the contract harness. */
    recover?: IdentityProvider["recover"];
  } = {},
) {
  const observe = vi.fn();
  const provider: IdentityProvider & {
    current: ReturnType<typeof vi.fn<() => LocalIdentity>>;
    markRegistered: ReturnType<typeof vi.fn<() => void>>;
  } = {
    current: vi.fn(() => identity(options.registered ?? false)),
    markRegistered: vi.fn(),
    replace: vi.fn(),
    ...(options.recover === undefined ? {} : { recover: options.recover }),
  };
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
  let tick = 1_000;
  const runtime: RpcRuntime = {
    getClient: async () => client,
    now: () => {
      tick += 100;
      return tick;
    },
    isOnline: () => options.online ?? true,
    report: (event) => events.push(event),
    ...options.runtime,
  };
  return { ctx, observe, provider, events, call: createRpcCaller(runtime) };
}

function reply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function sentBody(
  fetch: ReturnType<typeof reply>,
  index = 0,
): Record<string, unknown> {
  const init = fetch.mock.calls[index]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

/** Answers each request with the next body, then repeats the last. */
function replies(...bodies: unknown[]) {
  let next = 0;
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const body = bodies[Math.min(next, bodies.length - 1)];
      next += 1;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** The cookie's identity, which a `restored` recovery leaves current. */
function cookieIdentity(): LocalIdentity {
  return {
    ...identity(true),
    playerId: COOKIE_PLAYER as NonNullable<typeof COOKIE_PLAYER>,
    secret: COOKIE_SECRET as NonNullable<typeof COOKIE_SECRET>,
    source: "cookie",
  };
}

describe("call", () => {
  it("returns the decoded data of an ok envelope and feeds the server clock", async () => {
    const fetch = reply(200, okEnvelope);
    const t = setup();

    const result = await t.call(
      t.ctx,
      "create_challenge",
      { p_attempt: "a1" },
      decodeCode,
      {
        auth: "player",
      },
    );

    expect(result).toEqual({
      ok: true,
      value: { code: "AB12CD34", expiresAt: 1795000000000 },
    });
    expect(t.observe).toHaveBeenCalledWith(1793793600000, 1100, 1200);
    const [input, init] = fetch.mock.calls[0] ?? [];
    expect(String(input)).toBe(`${URL_BASE}/rest/v1/rpc/create_challenge`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("apikey")).toBe(KEY);
    expect(sentBody(fetch)).toEqual({
      p_attempt: "a1",
      p_player: PLAYER,
      p_secret: SECRET,
    });
    expect(t.events).toEqual([
      { type: "transport", fn: "create_challenge", outcome: "reachable" },
    ]);
  });

  it("adds the credential for player auth, and for optional auth once registered", async () => {
    const fetch = reply(200, okEnvelope);
    const unregistered = setup({ registered: false });
    await unregistered.call(
      unregistered.ctx,
      "get_today",
      { p_tz: "UTC" },
      none,
      { auth: "optional" },
    );
    const registered = setup({ registered: true });
    await registered.call(registered.ctx, "get_today", { p_tz: "UTC" }, none, {
      auth: "optional",
    });
    await registered.call(registered.ctx, "get_service_status", {}, none);

    expect(sentBody(fetch, 0)).toEqual({ p_tz: "UTC" });
    expect(sentBody(fetch, 1)).toEqual({
      p_tz: "UTC",
      p_player: PLAYER,
      p_secret: SECRET,
    });
    expect(sentBody(fetch, 2)).toEqual({});
  });

  it("maps an error envelope to its code, wait, scope, reference and current state", async () => {
    const t = setup();
    reply(200, rateLimitedEnvelope);
    expect(await t.call(t.ctx, "create_challenge", {}, none)).toEqual({
      ok: false,
      error: {
        code: "rate_limited",
        retryable: true,
        retryAfterMs: 42000,
        limitScope: "player",
        refId: null,
      },
    });
    reply(200, staleEnvelope);
    expect(await t.call(t.ctx, "round_action", {}, none)).toEqual({
      ok: false,
      error: {
        code: "stale",
        retryable: false,
        retryAfterMs: null,
        refId: null,
        current: { round: 1, step: 2 },
      },
    });
    reply(200, internalEnvelope);
    expect(await t.call(t.ctx, "start_daily", {}, none)).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: true, refId: internalEnvelope.ref },
    });
    reply(200, sheddingEnvelope);
    expect(await t.call(t.ctx, "save_quiz", {}, none)).toMatchObject({
      ok: false,
      error: { code: "unavailable", retryable: false, retryAfterMs: 3600000 },
    });
    expect(t.observe).toHaveBeenCalledTimes(4);
  });

  it("maps HTTP 429 from the pre-request hook to rate_limited with Retry-After and scope ip", async () => {
    const t = setup();
    reply(
      429,
      { code: "rate_limited", message: "Too many requests" },
      { "Retry-After": "7" },
    );
    expect(await t.call(t.ctx, "start_daily", {}, none)).toEqual({
      ok: false,
      error: {
        code: "rate_limited",
        retryable: true,
        retryAfterMs: 7000,
        limitScope: "ip",
        refId: null,
      },
    });

    const at = Date.UTC(2026, 10, 4, 12, 0, 0);
    const dated = setup({ runtime: { now: () => at } });
    reply(
      429,
      { code: "rate_limited" },
      { "Retry-After": new Date(at + 30_000).toUTCString() },
    );
    expect(await dated.call(dated.ctx, "start_daily", {}, none)).toMatchObject({
      error: { code: "rate_limited", retryAfterMs: 30_000, limitScope: "ip" },
    });

    reply(429, "Too many requests");
    expect(await t.call(t.ctx, "start_daily", {}, none)).toMatchObject({
      error: {
        code: "rate_limited",
        retryAfterMs: DEFAULT_RETRY_AFTER_MS,
        limitScope: "ip",
      },
    });
    expect(t.observe).not.toHaveBeenCalled();
    expect(
      t.events.every(
        (event) => event.type === "transport" && event.outcome === "reachable",
      ),
    ).toBe(true);
  });

  it("reads a 429's wait from the error body when the browser hides Retry-After", async () => {
    // A cross-origin response shows Retry-After only when CORS exposes it,
    // so the pre-request hook also sends retry_after_ms as the details text.
    const t = setup();
    const hook = {
      code: "rate_limited",
      message: "Too many requests",
      details: "42000",
      hint: null,
    };
    reply(429, hook);
    expect(await t.call(t.ctx, "start_daily", {}, none)).toEqual({
      ok: false,
      error: {
        code: "rate_limited",
        retryable: true,
        retryAfterMs: 42000,
        limitScope: "ip",
        refId: null,
      },
    });

    reply(429, hook, { "Retry-After": "43" });
    expect(await t.call(t.ctx, "start_daily", {}, none)).toMatchObject({
      error: { retryAfterMs: 43000 },
    });

    for (const details of ["", "soon", "-5", "0", "1.5", "99999999999"]) {
      reply(429, { ...hook, details });
      expect(
        await t.call(t.ctx, "start_daily", {}, none),
        details,
      ).toMatchObject({
        error: { code: "rate_limited", retryAfterMs: DEFAULT_RETRY_AFTER_MS },
      });
    }
    expect(t.observe).not.toHaveBeenCalled();
  });

  it("is offline when a fetch fails while the device is offline, and unreachable otherwise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const offline = setup({ online: false });
    expect(
      await offline.call(offline.ctx, "get_today", {}, none),
    ).toMatchObject({
      ok: false,
      error: { code: "offline", retryable: true },
    });
    const online = setup({ online: true });
    expect(await online.call(online.ctx, "get_today", {}, none)).toMatchObject({
      ok: false,
      error: { code: "unreachable", retryable: true },
    });
    expect(offline.events).toEqual([
      { type: "transport", fn: "get_today", outcome: "offline" },
    ]);
    expect(online.events).toEqual([
      { type: "transport", fn: "get_today", outcome: "unreachable" },
    ]);
  });

  it("treats HTTP 5xx and gateway errors as unreachable", async () => {
    const t = setup();
    for (const status of [500, 502, 503, 504, 520]) {
      reply(status, { message: "gateway" });
      expect(
        await t.call(t.ctx, "start_daily", {}, none),
        String(status),
      ).toMatchObject({
        ok: false,
        error: { code: "unreachable" },
      });
    }
    expect(
      t.events.map((event) => event.type === "transport" && event.outcome),
    ).toEqual(Array(5).fill("unreachable"));
  });

  describe("timeouts", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it(`answers timeout when no reply arrives within ${RPC_TIMEOUT_MS / 1000} s`, async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              });
            }),
        ),
      );
      const t = setup();
      const pending = t.call(t.ctx, "start_daily", {}, none);
      await vi.advanceTimersByTimeAsync(RPC_TIMEOUT_MS - 1);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toMatchObject({
        ok: false,
        error: { code: "timeout", retryable: true },
      });
      expect(t.events).toEqual([
        { type: "transport", fn: "start_daily", outcome: "timeout" },
      ]);

      const short = t.call(t.ctx, "start_daily", {}, none, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      expect(await short).toMatchObject({ error: { code: "timeout" } });
    });

    it("counts the SDK download in the same budget, so a stalled download times out too", async () => {
      const fetch = reply(200, okEnvelope);
      const t = setup({
        runtime: { getClient: () => new Promise<RpcClient | null>(() => {}) },
      });
      const pending = t.call(t.ctx, "start_daily", {}, none);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(RPC_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toMatchObject({
        ok: false,
        error: { code: "timeout", retryable: true },
      });
      expect(t.events).toEqual([
        { type: "transport", fn: "start_daily", outcome: "timeout" },
      ]);
      expect(fetch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);

      // A slow download still leaves the request the rest of the budget.
      let resolveClient: (value: RpcClient) => void = () => {};
      const slow = setup({
        runtime: {
          getClient: () =>
            new Promise<RpcClient | null>((resolve) => {
              resolveClient = resolve;
            }),
        },
      });
      const late = slow.call(slow.ctx, "start_daily", {}, none);
      await vi.advanceTimersByTimeAsync(RPC_TIMEOUT_MS - 100);
      resolveClient(client);
      expect(await late).toMatchObject({ ok: true });
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("answers internal for other HTTP errors and for replies that are not envelopes", async () => {
    const t = setup();
    reply(404, {
      code: "PGRST202",
      message: "Could not find the function public.nope",
    });
    expect(await t.call(t.ctx, "nope", {}, none)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    reply(200, "null");
    expect(await t.call(t.ctx, "start_daily", {}, none)).toMatchObject({
      error: { code: "internal" },
    });
    reply(200, { ok: true, server_time: 1 });
    expect(await t.call(t.ctx, "start_daily", {}, none)).toMatchObject({
      error: { code: "internal" },
    });
    expect(t.events).toEqual([
      { type: "transport", fn: "nope", outcome: "reachable" },
      { type: "internal_error", fn: "nope", status: 404 },
      { type: "transport", fn: "start_daily", outcome: "reachable" },
      { type: "decode_error", fn: "start_daily", path: "" },
      { type: "transport", fn: "start_daily", outcome: "reachable" },
      { type: "decode_error", fn: "start_daily", path: "data" },
    ]);
  });

  it("answers internal for an error code SQL never sends", async () => {
    const t = setup();
    for (const code of ["timeout", "offline", "galaxy"]) {
      reply(200, { ok: false, code, server_time: 1 });
      expect(await t.call(t.ctx, "start_daily", {}, none), code).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
    }
    expect(t.events.filter((event) => event.type === "decode_error")).toEqual(
      Array(3).fill({ type: "decode_error", fn: "start_daily", path: "code" }),
    );
  });

  it("reports the path, never the value, of data that does not decode", async () => {
    reply(200, { ok: true, data: { code: 7, expires_at: 1 }, server_time: 1 });
    const t = setup();
    expect(
      await t.call(t.ctx, "create_challenge", {}, decodeCode),
    ).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(t.events).toContainEqual({
      type: "decode_error",
      fn: "create_challenge",
      path: "data.code",
    });
    expect(JSON.stringify(t.events)).not.toContain("7");
  });

  it("answers unavailable without a Supabase client, and a transport error when the SDK cannot load", async () => {
    const none_ = setup({ runtime: { getClient: async () => null } });
    expect(await none_.call(none_.ctx, "start_daily", {}, none)).toMatchObject({
      ok: false,
      error: { code: "unavailable", retryable: false },
    });
    expect(none_.events).toEqual([]);

    const sdk = new SupabaseSdkLoadError(
      new Error("Failed to fetch dynamically imported module"),
    );
    const offline = setup({
      online: false,
      runtime: { getClient: () => Promise.reject(sdk) },
    });
    expect(
      await offline.call(offline.ctx, "start_daily", {}, none),
    ).toMatchObject({
      error: { code: "offline" },
    });
    const online = setup({
      online: true,
      runtime: { getClient: () => Promise.reject(sdk) },
    });
    expect(
      await online.call(online.ctx, "start_daily", {}, none),
    ).toMatchObject({
      error: { code: "unreachable" },
    });

    const broken = setup({
      runtime: {
        getClient: () => Promise.reject(new Error("Invalid supabaseUrl")),
      },
    });
    expect(
      await broken.call(broken.ctx, "start_daily", {}, none),
    ).toMatchObject({
      error: { code: "internal" },
    });
    expect(broken.events).toEqual([
      { type: "internal_error", fn: "start_daily", status: null },
    ]);
  });

  it("marks the identity registered after the first successful write only", async () => {
    reply(200, okEnvelope);
    const fresh = setup({ registered: false });
    await fresh.call(fresh.ctx, "start_daily", {}, none, {
      auth: "player",
      write: true,
    });
    expect(fresh.provider.markRegistered).toHaveBeenCalledTimes(1);

    const read = setup({ registered: false });
    await read.call(read.ctx, "get_profile", {}, none, { auth: "player" });
    expect(read.provider.markRegistered).not.toHaveBeenCalled();

    const known = setup({ registered: true });
    await known.call(known.ctx, "start_daily", {}, none, {
      auth: "player",
      write: true,
    });
    expect(known.provider.markRegistered).not.toHaveBeenCalled();

    reply(200, staleEnvelope);
    const refused = setup({ registered: false });
    await refused.call(refused.ctx, "start_daily", {}, none, {
      auth: "player",
      write: true,
    });
    expect(refused.provider.markRegistered).not.toHaveBeenCalled();
  });

  it("never rejects, even when the identity is missing", async () => {
    reply(200, okEnvelope);
    const t = setup();
    const ctx: SupabaseContext = {
      deps: {
        ...t.ctx.deps,
        identity: () => {
          throw new Error("No identity provider");
        },
      },
    };
    await expect(
      t.call(ctx, "get_profile", {}, none, { auth: "player" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });

  it("answers unavailable through the default caller in a build without Supabase", async () => {
    const t = setup();
    await expect(
      defaultCall(t.ctx, "get_service_status", {}, none),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unavailable" },
    });
  });
});

describe("auth_failed and the identity's recovery (§9.6)", () => {
  /** A provider whose recover() moves current() to `next` and answers `outcome`. */
  function recovering(
    outcome: "restored" | "minted",
    next: LocalIdentity | null,
    registered = true,
  ) {
    const recover = vi.fn(async () => {
      if (next !== null) t.provider.current.mockReturnValue(next);
      return outcome;
    });
    const t = setup({ registered, recover });
    return { t, recover };
  }

  it("runs the identity's recover() once for a registered player, then sends the call again with the restored identity", async () => {
    const fetch = replies(authFailedEnvelope, okEnvelope);
    const { t, recover } = recovering("restored", cookieIdentity());

    const result = await t.call(
      t.ctx,
      "create_challenge",
      { p_attempt: "a1" },
      decodeCode,
      { auth: "player" },
    );

    expect(result).toEqual({
      ok: true,
      value: { code: "AB12CD34", expiresAt: 1795000000000 },
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith({ playerId: PLAYER, secret: SECRET });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sentBody(fetch, 0)).toEqual({
      p_attempt: "a1",
      p_player: PLAYER,
      p_secret: SECRET,
    });
    // The same arguments, with the credential the cookie brought back.
    expect(sentBody(fetch, 1)).toEqual({
      p_attempt: "a1",
      p_player: COOKIE_PLAYER,
      p_secret: COOKIE_SECRET,
    });
  });

  it("recovers once per call: a second auth_failed is the answer", async () => {
    const fetch = replies(authFailedEnvelope);
    const { t, recover } = recovering("restored", cookieIdentity());

    const result = await t.call(t.ctx, "get_profile", {}, none, {
      auth: "player",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "auth_failed", retryable: false },
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("answers auth_failed without sending again when the recovery minted a new identity", async () => {
    const fetch = replies(authFailedEnvelope, okEnvelope);
    const { t, recover } = recovering("minted", null);

    const result = await t.call(t.ctx, "export_my_data", {}, none, {
      auth: "player",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "auth_failed" } });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a write recovers even before registration, and marks the identity registered once the retry succeeds", async () => {
    const fetch = replies(authFailedEnvelope, okEnvelope);
    // Another tab moved on to an identity it has not registered yet.
    const moved: LocalIdentity = { ...cookieIdentity(), registered: false };
    const { t, recover } = recovering("restored", moved, false);

    const result = await t.call(t.ctx, "register_player", {}, none, {
      auth: "player",
      write: true,
    });

    expect(result.ok).toBe(true);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(t.provider.markRegistered).toHaveBeenCalledTimes(1);
  });

  it("leaves an unregistered identity's read alone: the server has never seen it, so auth_failed is its answer", async () => {
    const fetch = replies(authFailedEnvelope);
    const { t, recover } = recovering("minted", null, false);

    const result = await t.call(t.ctx, "get_profile", {}, none, {
      auth: "player",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "auth_failed" } });
    expect(recover).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("recovers player calls only, and answers auth_failed when the provider has no recover()", async () => {
    replies(authFailedEnvelope);
    const { t, recover } = recovering("restored", cookieIdentity());
    for (const auth of ["optional", "none"] as const) {
      await expect(
        t.call(t.ctx, "get_today", {}, none, { auth }),
      ).resolves.toMatchObject({ ok: false, error: { code: "auth_failed" } });
    }
    expect(recover).not.toHaveBeenCalled();

    const fetch = replies(authFailedEnvelope, okEnvelope);
    const bare = setup({ registered: true });
    await expect(
      bare.call(bare.ctx, "get_profile", {}, none, { auth: "player" }),
    ).resolves.toMatchObject({ ok: false, error: { code: "auth_failed" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never rejects when the recovery itself fails", async () => {
    const fetch = replies(authFailedEnvelope, okEnvelope);
    const t = setup({
      registered: true,
      recover: () => Promise.reject(new Error("lock refused")),
    });

    await expect(
      t.call(t.ctx, "create_sync_code", {}, none, {
        auth: "player",
        write: true,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "auth_failed" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("reports", () => {
  it("dispatches each report as a qz:backend-rpc event", () => {
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener(RPC_EVENT, listener);
    dispatchRpcEvent({
      type: "transport",
      fn: "start_daily",
      outcome: "unreachable",
    });
    window.removeEventListener(RPC_EVENT, listener);
    expect(seen).toEqual([
      { type: "transport", fn: "start_daily", outcome: "unreachable" },
    ]);
  });
});

describe("parseRetryAfter", () => {
  it("reads delay seconds and HTTP dates", () => {
    const now = Date.UTC(2026, 10, 4, 12, 0, 0);
    expect(parseRetryAfter("7", now)).toBe(7000);
    expect(parseRetryAfter(" 0 ", now)).toBe(0);
    expect(parseRetryAfter(new Date(now + 90_000).toUTCString(), now)).toBe(
      90_000,
    );
    expect(parseRetryAfter(new Date(now - 5_000).toUTCString(), now)).toBe(0);
    expect(parseRetryAfter("soon", now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

describe("parseRetryAfterDetails", () => {
  it("reads a positive whole number of milliseconds, up to a day", () => {
    expect(parseRetryAfterDetails("42000")).toBe(42000);
    expect(parseRetryAfterDetails(" 300000 ")).toBe(300000);
    expect(parseRetryAfterDetails("86400000")).toBe(86_400_000);
    for (const details of [
      null,
      undefined,
      "",
      "0",
      "-1",
      "1.5",
      "1e3",
      "86400001",
      "soon",
    ]) {
      expect(parseRetryAfterDetails(details), String(details)).toBeNull();
    }
  });
});
