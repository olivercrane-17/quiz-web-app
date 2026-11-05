/**
 * Error codes and helpers (ARCHITECTURE §7.3). The same strings come back
 * from SQL (§8.4), from the mock and from transport mapping.
 */
import {
  BACKEND_ERROR_CODES,
  type BackendError,
  type BackendErrorCode,
  type Result,
} from "@/engine/types";

export { BACKEND_ERROR_CODES };
export type { BackendError, BackendErrorCode, Result };

/**
 * Whether a code is retryable by default (§7.3's "Retryable" column).
 * `rate_limited` is retryable after its `retryAfterMs`.
 */
export const RETRYABLE: Readonly<Record<BackendErrorCode, boolean>> = {
  offline: true,
  unreachable: true,
  timeout: true,
  unavailable: false,
  feature_disabled: false,
  auth_failed: false,
  rate_limited: true,
  limit_reached: false,
  invalid_input: false,
  invalid_entity: false,
  already_guessed: false,
  blocked_text: false,
  age_required: false,
  age_forbidden: false,
  not_found: false,
  stale: false,
  conflict: false,
  already_played: false,
  expired: false,
  not_open: false,
  full: false,
  locked: false,
  removed: false,
  ended: false,
  not_member: false,
  no_daily: true,
  internal: true,
};

export function isBackendErrorCode(value: unknown): value is BackendErrorCode {
  return (
    typeof value === "string" &&
    (BACKEND_ERROR_CODES as readonly string[]).includes(value)
  );
}

export interface BackendErrorOptions {
  retryable?: boolean;
  retryAfterMs?: number | null;
  limitScope?: "ip" | "player" | "project";
  refId?: string | null;
  current?: unknown;
}

/** A BackendError with the code's default retryability. */
export function backendError(
  code: BackendErrorCode,
  options: BackendErrorOptions = {},
): BackendError {
  const error: BackendError = {
    code,
    retryable: options.retryable ?? RETRYABLE[code],
    retryAfterMs: options.retryAfterMs ?? null,
    refId: options.refId ?? null,
  };
  if (options.limitScope !== undefined) error.limitScope = options.limitScope;
  if (options.current !== undefined) error.current = options.current;
  return error;
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(
  code: BackendErrorCode,
  options: BackendErrorOptions = {},
): Result<T> {
  return { ok: false, error: backendError(code, options) };
}

/** What the off backend and not-yet-built areas answer (§7.6). */
export const UNAVAILABLE: BackendError = Object.freeze(
  backendError("unavailable"),
);

/** A resolved Result that fails with `unavailable`. */
export function unavailable<T = never>(): Promise<Result<T>> {
  return Promise.resolve({ ok: false, error: UNAVAILABLE });
}
