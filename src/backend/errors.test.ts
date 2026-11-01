import { describe, expect, it } from "vitest";

import {
  BACKEND_ERROR_CODES,
  RETRYABLE,
  UNAVAILABLE,
  backendError,
  fail,
  isBackendErrorCode,
  ok,
  unavailable,
} from "./errors";

describe("backend errors", () => {
  it("knows whether every code is retryable (§7.3)", () => {
    expect(Object.keys(RETRYABLE).sort()).toEqual(
      [...BACKEND_ERROR_CODES].sort(),
    );
    for (const code of [
      "offline",
      "unreachable",
      "timeout",
      "rate_limited",
      "no_daily",
      "internal",
    ] as const) {
      expect(RETRYABLE[code]).toBe(true);
    }
    for (const code of [
      "unavailable",
      "stale",
      "invalid_entity",
      "conflict",
      "auth_failed",
    ] as const) {
      expect(RETRYABLE[code]).toBe(false);
    }
  });

  it("builds errors with defaults and optional fields", () => {
    expect(backendError("timeout")).toEqual({
      code: "timeout",
      retryable: true,
      retryAfterMs: null,
      refId: null,
    });
    expect(
      backendError("rate_limited", {
        retryAfterMs: 3000,
        limitScope: "ip",
        refId: "R7",
      }),
    ).toEqual({
      code: "rate_limited",
      retryable: true,
      retryAfterMs: 3000,
      limitScope: "ip",
      refId: "R7",
    });
    expect(backendError("stale", { current: { step: 2 } }).current).toEqual({
      step: 2,
    });
  });

  it("wraps results", async () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
    expect(fail("not_found")).toEqual({
      ok: false,
      error: backendError("not_found"),
    });
    await expect(unavailable()).resolves.toEqual({
      ok: false,
      error: UNAVAILABLE,
    });
    expect(Object.isFrozen(UNAVAILABLE)).toBe(true);
  });

  it("recognises codes", () => {
    expect(isBackendErrorCode("stale")).toBe(true);
    expect(isBackendErrorCode("oops")).toBe(false);
    expect(isBackendErrorCode(3)).toBe(false);
  });
});
