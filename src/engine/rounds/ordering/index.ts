/**
 * The ordering plugin is reserved (PRD §3.3.2: Later). It stays a stub that
 * throws `unsupported_round_type` on every call, and the content schema
 * refuses ordering items in v1 (ARCHITECTURE §2.3, §4.4.1).
 */
import {
  UnsupportedRoundTypeError,
  type AnyRoundPlugin,
  type RoundPlugin,
} from "../types.ts";

const unsupported = (): never => {
  throw new UnsupportedRoundTypeError("ordering");
};

export const orderingPlugin: RoundPlugin<"ordering", never, never, never> = {
  family: "ordering",
  types: ["ordering"],
  maxPoints: unsupported,
  init: unsupported,
  check: unsupported,
  apply: unsupported,
  outcome: unsupported,
  announce: unsupported,
  open: unsupported,
  judge: unsupported,
} satisfies AnyRoundPlugin;
