/**
 * The run state machine (ARCHITECTURE §4.5).
 */
export { createRun, reduceRun, toLocalSnapshot } from "./reducer.ts";
export { selectRunView } from "./view.ts";
export {
  isWrongOutcome,
  mysteryCells,
  outcomeFromReveal,
  outcomePoints,
} from "./outcome.ts";
export {
  ACTION_COPY_WAIT_MS,
  CHECKING_AFTER_MS,
  FALLBACK_AFTER_MS,
  PLAIN_COPY_AFTER_MS,
  RATE_LIMITED_RETRY_MS,
  TRANSPORT_RETRY_MS,
  retryDelayMs,
  retryNotice,
} from "./retry.ts";
export type {
  FailingOperation,
  LocalRunSnapshot,
  PendingIntent,
  RetryNotice,
  RoundSlot,
  RoundStatus,
  RunCommand,
  RunError,
  RunEvent,
  RunPhase,
  RunState,
  RunView,
  Transition,
} from "./types.ts";
