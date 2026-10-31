/**
 * Results and errors (ARCHITECTURE §3.11). The same error codes come back
 * from SQL (§8.4), from the mock and from transport mapping (§7.3).
 */

export const BACKEND_ERROR_CODES = [
  // transport and mode
  "offline",
  "unreachable",
  "timeout",
  "unavailable",
  "feature_disabled",
  // identity and limits
  "auth_failed",
  "rate_limited",
  "limit_reached",
  // validation
  "invalid_input",
  "invalid_entity",
  "already_guessed",
  "blocked_text",
  "age_required",
  "age_forbidden",
  // state
  "not_found",
  "stale",
  "conflict",
  "already_played",
  "expired",
  "not_open",
  "full",
  "locked",
  "removed",
  "ended",
  "not_member",
  "no_daily",
  "internal",
] as const;
export type BackendErrorCode = (typeof BACKEND_ERROR_CODES)[number];

export interface BackendError {
  code: BackendErrorCode;
  retryable: boolean;
  /** Set on every 'rate_limited', and on 'unavailable' while the server sheds. */
  retryAfterMs: number | null;
  /** 'rate_limited' only: whose limit refused, which picks AC-IDN-04's copy. */
  limitScope?: "ip" | "player" | "project";
  /** The short reference shown in small text. */
  refId: string | null;
  /** 'stale' and 'conflict' carry the current server state. */
  current?: unknown;
}

export type Result<T> =
  { ok: true; value: T } | { ok: false; error: BackendError };
