/**
 * What an identity screen says when a call fails (ARCHITECTURE §7.3): no
 * connection, a limit (with how long it lasts), a server without the
 * feature, or anything else, which offers Try again.
 */
import type { BackendError } from "@/engine/types";

export type ScreenError =
  "offline" | "rate_limited" | "unavailable" | "generic";

export function screenError(error: BackendError): ScreenError {
  switch (error.code) {
    case "offline":
      return "offline";
    case "rate_limited":
      return "rate_limited";
    case "unavailable":
    case "feature_disabled":
      return "unavailable";
    default:
      return "generic";
  }
}
