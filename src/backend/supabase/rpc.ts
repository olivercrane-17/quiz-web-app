/**
 * One RPC through the app's Supabase client (ARCHITECTURE §7.5):
 *
 *   call(ctx, "get_profile", {}, decodeProfile, { auth: "player" })
 *
 * - Identity: `auth: "player"` adds p_player and p_secret from the tab's
 *   identity; "optional" adds them once the identity is registered, since
 *   an unregistered secret means nothing to the server.
 * - Every call ends after 8 s (`timeout`, §7.3), counted from the start of
 *   the call, so a first visit's SDK download shares the budget with the
 *   request. Nothing is retried here: callers retry, with the same key (§7.1).
 * - Transport mapping: a fetch that fails while offline is `offline`,
 *   otherwise `unreachable`; HTTP 429 (the pre-request hook) is
 *   `rate_limited` with scope `ip` and retryAfterMs from Retry-After, or,
 *   when the browser hides that header (CORS exposes it only if the gateway
 *   lists it), from the error body's `details`, which the hook fills with
 *   the wait in milliseconds (supabase/README.md §3); HTTP 5xx is
 *   `unreachable`; a 2xx envelope `{ ok: false, code }` is that code;
 *   anything else is `internal`.
 * - Each envelope's server_time feeds the server clock, with the local send
 *   and receive times (§4.3).
 * - A successful write marks the identity registered, which backs it up in
 *   the cookie (§9.1).
 * - Reports: every call's transport outcome and every decode failure go to
 *   RpcRuntime.report. By default they are dispatched as RPC_EVENT on
 *   globalThis, where the health monitor (INC-1, §10.6) and the client_error
 *   events (ANA-1) listen. A report names the RPC and a path, never data.
 *
 * call() never throws and never rejects.
 */
import type { EpochMs, LocalIdentity } from "@/engine/types";
import { systemClock } from "@/platform/server-clock";

import {
  backendError,
  fail,
  isBackendErrorCode,
  ok,
  type BackendErrorCode,
  type Result,
} from "../errors";
import {
  SupabaseSdkLoadError,
  getSupabaseClient,
  responseMetaFor,
} from "./client";
import type { SupabaseContext } from "./context";
import { DecodeError, decodeEnvelope, type Decoder } from "./decode";

/** §7.3: no response within 8 s is `timeout`. */
export const RPC_TIMEOUT_MS = 8_000;
/** The wait a 429 without a usable Retry-After gets (§7.3 then backs off 1, 2, 4, 8 s). */
export const DEFAULT_RETRY_AFTER_MS = 1_000;
/** The event name reports are dispatched under (see RpcEvent). */
export const RPC_EVENT = "qz:backend-rpc";

export type RpcAuth = "none" | "player" | "optional";

export interface RpcOptions {
  /** Which credential the call carries (§8.4: "(auth)", "(optional auth)"). Default "none". */
  auth?: RpcAuth;
  /** A write: its first success marks the identity registered. */
  write?: boolean;
  /** Default RPC_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * What the wrapper reports. `reachable` means the server answered, even
 * with an error; the other outcomes are the transport failures the health
 * monitor counts (§10.6).
 */
export type RpcEvent =
  | {
      type: "transport";
      fn: string;
      outcome: "reachable" | "offline" | "unreachable" | "timeout";
    }
  | { type: "decode_error"; fn: string; path: string }
  /** An HTTP error that is not the server's verdict (status), or a bug in the client (null). */
  | { type: "internal_error"; fn: string; status: number | null };

/** The slice of the Supabase client the wrapper uses. */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): RpcRequest;
}
export interface RpcRequest extends PromiseLike<RpcReply> {
  abortSignal(signal: AbortSignal): RpcRequest;
}
export interface RpcReply {
  data: unknown;
  /** postgrest-js's error: the JSON body of a failed request, when it has one. */
  error: { message?: string; details?: string | null } | null;
  status: number;
}

export interface RpcRuntime {
  getClient(): Promise<RpcClient | null>;
  /** The device clock (not the corrected one) for server-clock samples. */
  now(): EpochMs;
  isOnline(): boolean;
  report(event: RpcEvent): void;
}

function browserOnline(): boolean {
  try {
    return globalThis.navigator?.onLine !== false;
  } catch {
    return true;
  }
}

/** Dispatches a report as RPC_EVENT where there is an event target to dispatch on. */
export function dispatchRpcEvent(event: RpcEvent): void {
  try {
    if (
      typeof globalThis.dispatchEvent === "function" &&
      typeof CustomEvent === "function"
    ) {
      globalThis.dispatchEvent(new CustomEvent(RPC_EVENT, { detail: event }));
    }
  } catch {
    // Reporting never breaks a call.
  }
}

const DEFAULT_RUNTIME: RpcRuntime = {
  // The typed client only accepts the RPC names in database.types.ts; the
  // adapters name their RPCs and decode the replies themselves.
  getClient: getSupabaseClient as unknown as () => Promise<RpcClient | null>,
  now: () => systemClock.now(),
  isOnline: browserOnline,
  report: dispatchRpcEvent,
};

/**
 * Retry-After as milliseconds: delay seconds, or an HTTP date measured
 * from `now`. Null when absent or unreadable.
 */
export function parseRetryAfter(
  value: string | null,
  now: EpochMs,
): number | null {
  if (value === null) return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** The longest wait a 429's body may ask for: the longest window of §8.6. */
const MAX_BODY_RETRY_AFTER_MS = 86_400_000;

/**
 * The wait a 429 carries in its body: the pre-request hook puts
 * retry_after_ms in the error's `details`, as text, because a browser may not
 * show the Retry-After header of a cross-origin response. Null unless it is
 * a positive whole number of milliseconds within a day.
 */
export function parseRetryAfterDetails(
  details: string | null | undefined,
): number | null {
  if (typeof details !== "string" || !/^\d{1,9}$/.test(details.trim())) {
    return null;
  }
  const ms = Number(details.trim());
  return ms > 0 && ms <= MAX_BODY_RETRY_AFTER_MS ? ms : null;
}

/** Codes that only transport mapping produces; SQL never returns them. */
const TRANSPORT_CODES: ReadonlySet<BackendErrorCode> = new Set([
  "offline",
  "unreachable",
  "timeout",
]);

export type RpcCall = <T>(
  ctx: SupabaseContext,
  fn: string,
  args: Record<string, unknown>,
  decode: Decoder<T>,
  options?: RpcOptions,
) => Promise<Result<T>>;

/** A call() over its own runtime; tests pass fakes. */
export function createRpcCaller(overrides: Partial<RpcRuntime> = {}): RpcCall {
  const runtime: RpcRuntime = { ...DEFAULT_RUNTIME, ...overrides };

  function report(event: RpcEvent): void {
    try {
      runtime.report(event);
    } catch {
      // Reporting never breaks a call.
    }
  }

  function transportFailure<T>(
    fn: string,
    outcome: "offline" | "unreachable" | "timeout",
  ): Result<T> {
    report({ type: "transport", fn, outcome });
    return fail(outcome);
  }

  function decodeFailure<T>(fn: string, error: unknown): Result<T> {
    report({
      type: "decode_error",
      fn,
      path: error instanceof DecodeError ? error.path : "",
    });
    return fail("internal");
  }

  return async function call<T>(
    ctx: SupabaseContext,
    fn: string,
    args: Record<string, unknown>,
    decode: Decoder<T>,
    options: RpcOptions = {},
  ): Promise<Result<T>> {
    try {
      const auth = options.auth ?? "none";
      let identity: LocalIdentity | null = null;
      let body = args;
      if (auth !== "none") {
        identity = ctx.deps.identity().current();
        if (auth === "player" || identity.registered) {
          body = {
            ...args,
            p_player: identity.playerId,
            p_secret: identity.secret,
          };
        } else {
          identity = null;
        }
      }

      // One budget for the whole call, started before the client: on a first
      // visit getClient() downloads the SDK, and a stalled download must end
      // in `timeout` like a stalled request (§7.3).
      const controller = new AbortController();
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          resolve(null);
        }, options.timeoutMs ?? RPC_TIMEOUT_MS);
      });
      let reply: RpcReply | null;
      let sentAt: EpochMs;
      let receivedAt: EpochMs;
      try {
        let loaded: { client: RpcClient | null } | null;
        try {
          loaded = await Promise.race([
            runtime.getClient().then((client) => ({ client })),
            deadline,
          ]);
        } catch (error) {
          if (error instanceof SupabaseSdkLoadError) {
            return transportFailure(
              fn,
              runtime.isOnline() ? "unreachable" : "offline",
            );
          }
          throw error;
        }
        if (loaded === null) return transportFailure(fn, "timeout");
        if (loaded.client === null) return fail("unavailable");

        sentAt = runtime.now();
        reply = await Promise.race([
          loaded.client.rpc(fn, body).abortSignal(controller.signal),
          deadline,
        ]);
        receivedAt = runtime.now();
      } finally {
        clearTimeout(timer);
      }

      if (reply === null || timedOut) return transportFailure(fn, "timeout");
      if (reply.status === 0) {
        return transportFailure(
          fn,
          runtime.isOnline() ? "unreachable" : "offline",
        );
      }
      if (reply.status >= 500) return transportFailure(fn, "unreachable");
      report({ type: "transport", fn, outcome: "reachable" });
      if (reply.status === 429) {
        const retryAfter =
          responseMetaFor(controller.signal)?.retryAfter ?? null;
        return fail("rate_limited", {
          retryAfterMs:
            parseRetryAfter(retryAfter, receivedAt) ??
            parseRetryAfterDetails(reply.error?.details) ??
            DEFAULT_RETRY_AFTER_MS,
          limitScope: "ip",
        });
      }
      if (reply.status < 200 || reply.status >= 300 || reply.error !== null) {
        report({ type: "internal_error", fn, status: reply.status });
        return fail("internal");
      }

      let envelope;
      try {
        envelope = decodeEnvelope(reply.data);
      } catch (error) {
        return decodeFailure(fn, error);
      }
      try {
        ctx.deps.serverClock.observe(envelope.serverTime, sentAt, receivedAt);
      } catch {
        // The clock keeps its earlier samples.
      }

      if (!envelope.ok) {
        const code = envelope.code;
        if (!isBackendErrorCode(code) || TRANSPORT_CODES.has(code)) {
          return decodeFailure(fn, new DecodeError("code", "an error code"));
        }
        return {
          ok: false,
          error: backendError(code, {
            retryAfterMs: envelope.retryAfterMs,
            ...(envelope.limitScope === null
              ? {}
              : { limitScope: envelope.limitScope }),
            refId: envelope.refId,
            ...(envelope.current === null ? {} : { current: envelope.current }),
          }),
        };
      }

      let value: T;
      try {
        value = decode(envelope.data, "data");
      } catch (error) {
        return decodeFailure(fn, error);
      }
      if (options.write === true && identity !== null && !identity.registered) {
        try {
          ctx.deps.identity().markRegistered();
        } catch {
          // The next write tries again.
        }
      }
      return ok(value);
    } catch {
      // A bug, not a server answer: reported, and answered as internal so
      // callers keep going.
      report({ type: "internal_error", fn, status: null });
      return fail("internal");
    }
  };
}

/** The wrapper every Supabase adapter uses. */
export const call: RpcCall = createRpcCaller();
