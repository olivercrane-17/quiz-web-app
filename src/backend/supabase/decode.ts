/**
 * Small hand-written decoders for RPC payloads (ARCHITECTURE §7.5). No zod
 * in the browser (§10.9): each decoder checks what the client relies on and
 * maps SQL's snake_case keys to the camelCase of §3's types. A decoder
 * throws DecodeError with the path that failed; the RPC wrapper turns that
 * into `internal` and reports the path, never the value.
 *
 *   const decodeClaim = object({ expiresAt: epochMs });
 *   decodeClaim({ expires_at: 1795000000000 })   // { expiresAt: 1795000000000 }
 */
import type { EpochMs } from "@/engine/types";

export class DecodeError extends Error {
  readonly path: string;

  constructor(path: string, expected: string) {
    super(`${path || "the payload"} is not ${expected}`);
    this.name = "DecodeError";
    this.path = path;
  }
}

/** Reads one value; `path` names it in errors ("data.round.clue"). */
export type Decoder<T> = (value: unknown, path?: string) => T;

export type Decoded<D> = D extends Decoder<infer T> ? T : never;

export const string: Decoder<string> = (value, path = "") => {
  if (typeof value !== "string") throw new DecodeError(path, "a string");
  return value;
};

export const number: Decoder<number> = (value, path = "") => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DecodeError(path, "a finite number");
  }
  return value;
};

export const integer: Decoder<number> = (value, path = "") => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new DecodeError(path, "an integer");
  }
  return value;
};

export const boolean: Decoder<boolean> = (value, path = "") => {
  if (typeof value !== "boolean") throw new DecodeError(path, "a boolean");
  return value;
};

/** Milliseconds since the epoch, as every SQL timestamp is sent. */
export const epochMs: Decoder<EpochMs> = (value, path = "") => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new DecodeError(path, "a time in epoch milliseconds");
  }
  return value;
};

/** Any JSON value, unchecked: for opaque state such as `current`. */
export const json: Decoder<unknown> = (value) => value;

/** For RPCs whose data is `{}`: the value is ignored. */
export const none: Decoder<void> = () => undefined;

export function literal<const V extends string | number | boolean>(
  ...values: V[]
): Decoder<V> {
  return (value, path = "") => {
    if (!values.includes(value as V)) {
      throw new DecodeError(path, `one of ${values.map(String).join(", ")}`);
    }
    return value as V;
  };
}

export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
  return (value, path = "") => (value === null ? null : decoder(value, path));
}

/** An absent key (or undefined); a present one must decode. */
export function optional<T>(decoder: Decoder<T>): Decoder<T | undefined> {
  return (value, path = "") =>
    value === undefined ? undefined : decoder(value, path);
}

export function array<T>(
  decoder: Decoder<T>,
  options: { max?: number } = {},
): Decoder<T[]> {
  return (value, path = "") => {
    if (!Array.isArray(value)) throw new DecodeError(path, "an array");
    if (options.max !== undefined && value.length > options.max) {
      throw new DecodeError(path, `an array of at most ${options.max}`);
    }
    return value.map((item, index) => decoder(item, `${path}[${index}]`));
  };
}

/** A branded value from one of the engine's parse helpers (parsePlayerId, parseLocalDate). */
export function parsed<T>(
  parse: (raw: unknown) => T | null,
  what: string,
): Decoder<T> {
  return (value, path = "") => {
    const result = parse(value);
    if (result === null) throw new DecodeError(path, what);
    return result;
  };
}

export function map<A, B>(
  decoder: Decoder<A>,
  to: (value: A) => B,
): Decoder<B> {
  return (value, path = "") => to(decoder(value, path));
}

/** camelCase to snake_case: retryAfterMs -> retry_after_ms. */
export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

type Shape = Record<string, Decoder<unknown>>;

/**
 * An object whose camelCase fields read the snake_case keys SQL sends.
 * Keys the shape does not name are ignored, so the server can add fields
 * without breaking old clients.
 */
export function object<S extends Shape>(
  shape: S,
): Decoder<{ [K in keyof S]: Decoded<S[K]> }> {
  const fields = Object.entries(shape).map(
    ([key, decoder]) => [key, toSnake(key), decoder] as const,
  );
  return (value, path = "") => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new DecodeError(path, "an object");
    }
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, sqlKey, decoder] of fields) {
      out[key] = decoder(
        record[sqlKey],
        path === "" ? sqlKey : `${path}.${sqlKey}`,
      );
    }
    return out as { [K in keyof S]: Decoded<S[K]> };
  };
}

// ---------------------------------------------------------------------------
// The envelope every RPC returns (§8.2 rule 5)
// ---------------------------------------------------------------------------

export type Envelope =
  | { ok: true; data: unknown; serverTime: EpochMs }
  | {
      ok: false;
      code: string;
      current: unknown;
      retryAfterMs: number | null;
      limitScope: "ip" | "player" | "project" | null;
      refId: string | null;
      serverTime: EpochMs;
    };

const decodeFailure = object({
  code: string,
  current: optional(json),
  retryAfterMs: optional(nullable(integer)),
  limitScope: optional(nullable(literal("ip", "player", "project"))),
  ref: optional(nullable(string)),
  serverTime: epochMs,
});

/** `{ ok: true, data, server_time }` or `{ ok: false, code, ... }`. */
export function decodeEnvelope(value: unknown): Envelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DecodeError("", "an RPC envelope");
  }
  const okField = (value as { ok?: unknown }).ok;
  if (okField === true) {
    const record = value as { data?: unknown; server_time?: unknown };
    if (!("data" in record)) throw new DecodeError("data", "present");
    return {
      ok: true,
      data: record.data,
      serverTime: epochMs(record.server_time, "server_time"),
    };
  }
  if (okField !== false) throw new DecodeError("ok", "true or false");
  const failure = decodeFailure(value);
  return {
    ok: false,
    code: failure.code,
    current: failure.current ?? null,
    retryAfterMs: failure.retryAfterMs ?? null,
    limitScope: failure.limitScope ?? null,
    refId: failure.ref ?? null,
    serverTime: failure.serverTime,
  };
}
