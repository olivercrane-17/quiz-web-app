/**
 * The hand-written decoders (ARCHITECTURE §7.5) and the envelope decoder,
 * against the envelopes SQL-1's helpers build (__fixtures__/envelope.*.json,
 * recorded with supabase/tests/baseline/envelope.payloads.sql).
 */
import { describe, expect, it } from "vitest";

import { parseLocalDate } from "@/engine/types";

import internal from "./__fixtures__/envelope.internal.json";
import okEmpty from "./__fixtures__/envelope.ok-empty.json";
import okCode from "./__fixtures__/envelope.ok.json";
import rateLimited from "./__fixtures__/envelope.rate-limited.json";
import stale from "./__fixtures__/envelope.stale.json";
import shedding from "./__fixtures__/envelope.unavailable-shedding.json";
import {
  DecodeError,
  array,
  boolean,
  decodeEnvelope,
  epochMs,
  integer,
  literal,
  map,
  none,
  nullable,
  number,
  object,
  optional,
  parsed,
  string,
  toSnake,
} from "./decode";

function failure(run: () => unknown): DecodeError {
  try {
    run();
  } catch (error) {
    if (error instanceof DecodeError) return error;
    throw error;
  }
  throw new Error("expected a DecodeError");
}

describe("scalar decoders", () => {
  it("accept their type and refuse the rest", () => {
    expect(string("a")).toBe("a");
    expect(number(1.5)).toBe(1.5);
    expect(integer(3)).toBe(3);
    expect(boolean(false)).toBe(false);
    expect(epochMs(1793793600000)).toBe(1793793600000);

    expect(() => string(1)).toThrow(DecodeError);
    expect(() => number(Number.NaN)).toThrow(DecodeError);
    expect(() => number("1")).toThrow(DecodeError);
    expect(() => integer(1.5)).toThrow(DecodeError);
    expect(() => boolean("true")).toThrow(DecodeError);
    expect(() => epochMs(-1)).toThrow(DecodeError);
    expect(() => epochMs("2026-11-04")).toThrow(DecodeError);
  });

  it("literal, nullable, optional, map, parsed and none", () => {
    const scope = literal("ip", "player", "project");
    expect(scope("ip")).toBe("ip");
    expect(() => scope("galaxy")).toThrow(DecodeError);
    expect(nullable(string)(null)).toBeNull();
    expect(() => nullable(string)(undefined)).toThrow(DecodeError);
    expect(optional(string)(undefined)).toBeUndefined();
    expect(() => optional(string)(null)).toThrow(DecodeError);
    expect(map(integer, (n) => n * 2)(21)).toBe(42);
    const date = parsed(parseLocalDate, "a local date");
    expect(date("2026-11-04")).toBe("2026-11-04");
    expect(() => date("2026-13-01")).toThrow(DecodeError);
    expect(none({ anything: true })).toBeUndefined();
  });
});

describe("object", () => {
  const decodeClaim = object({
    expiresAt: epochMs,
    friendlyName: string,
    nickname: nullable(string),
    streak: optional(integer),
  });

  it("reads snake_case keys into camelCase fields and ignores extra keys", () => {
    expect(
      decodeClaim({
        expires_at: 1795000000000,
        friendly_name: "Plucky Otter",
        nickname: null,
        added_later: "ignored",
      }),
    ).toEqual({
      expiresAt: 1795000000000,
      friendlyName: "Plucky Otter",
      nickname: null,
      streak: undefined,
    });
  });

  it("names the path of the field that failed", () => {
    const error = failure(() =>
      object({ round: object({ clue: string }) })(
        { round: { clue: 7 } },
        "data",
      ),
    );
    expect(error.path).toBe("data.round.clue");
    expect(
      failure(() => decodeClaim({ friendly_name: "x", nickname: null })).path,
    ).toBe("expires_at");
    expect(failure(() => array(integer)([1, "2"], "data.ids")).path).toBe(
      "data.ids[1]",
    );
    expect(() => decodeClaim([])).toThrow(DecodeError);
  });

  it("bounds arrays", () => {
    expect(array(integer, { max: 2 })([1, 2])).toEqual([1, 2]);
    expect(() => array(integer, { max: 2 })([1, 2, 3])).toThrow(DecodeError);
    expect(() => array(integer)({ length: 1 })).toThrow(DecodeError);
  });

  it("maps camelCase to snake_case", () => {
    expect(toSnake("retryAfterMs")).toBe("retry_after_ms");
    expect(toSnake("serverTime")).toBe("server_time");
    expect(toSnake("ok")).toBe("ok");
  });
});

describe("decodeEnvelope", () => {
  it("decodes the ok envelopes the helpers build", () => {
    expect(decodeEnvelope(okCode)).toEqual({
      ok: true,
      data: { code: "AB12CD34", expires_at: 1795000000000 },
      serverTime: 1793793600000,
    });
    expect(decodeEnvelope(okEmpty)).toEqual({
      ok: true,
      data: {},
      serverTime: 1793793600000,
    });
  });

  it("decodes the error envelopes, wait, scope, reference and current state included", () => {
    expect(decodeEnvelope(rateLimited)).toEqual({
      ok: false,
      code: "rate_limited",
      current: null,
      retryAfterMs: 42000,
      limitScope: "player",
      refId: null,
      serverTime: 1793793600000,
    });
    expect(decodeEnvelope(stale)).toMatchObject({
      ok: false,
      code: "stale",
      current: { round: 1, step: 2 },
      retryAfterMs: null,
      limitScope: null,
    });
    expect(decodeEnvelope(shedding)).toMatchObject({
      code: "unavailable",
      retryAfterMs: 3600000,
    });
    const decoded = decodeEnvelope(internal);
    expect(decoded).toMatchObject({ ok: false, code: "internal" });
    expect(decoded.ok === false && decoded.refId).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{8}$/,
    );
  });

  it("accepts an error envelope that leaves its optional fields out", () => {
    expect(
      decodeEnvelope({ ok: false, code: "not_found", server_time: 1 }),
    ).toEqual({
      ok: false,
      code: "not_found",
      current: null,
      retryAfterMs: null,
      limitScope: null,
      refId: null,
      serverTime: 1,
    });
  });

  it("refuses anything that is not an envelope", () => {
    for (const value of [
      null,
      "ok",
      [],
      {},
      { ok: "true", data: {}, server_time: 1 },
      { ok: true, server_time: 1 },
      { ok: true, data: {} },
      { ok: true, data: {}, server_time: "now" },
      { ok: false, server_time: 1 },
      {
        ok: false,
        code: "rate_limited",
        limit_scope: "galaxy",
        server_time: 1,
      },
    ]) {
      expect(() => decodeEnvelope(value), JSON.stringify(value)).toThrow(
        DecodeError,
      );
    }
  });
});
