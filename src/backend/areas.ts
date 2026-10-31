/**
 * The methods of every GameBackend area, listed once, so implementations
 * can be composed and stubbed generically and tests can name a method as
 * `<area>.<method>` (`sealed.act`, `rooms.answer`).
 */
import { unavailable } from "./errors";
import type { BackendArea, BackendMode, GameBackend } from "./types";

export const AREA_METHODS = {
  identity: [
    "register",
    "getProfile",
    "setAgeBand",
    "setNickname",
    "createSyncCode",
    "redeemSyncCode",
    "createClaim",
    "peekClaim",
    "redeemClaim",
    "exportData",
    "deletePlayer",
  ],
  sealed: ["start", "get", "beginRound", "act", "finish"],
  daily: ["today", "results", "numbers", "archive"],
  streaks: ["get", "acknowledge"],
  stats: ["get", "recordAchievements"],
  challenges: [
    "create",
    "landing",
    "headToHead",
    "rematch",
    "shelf",
    "participants",
  ],
  groups: [
    "create",
    "preview",
    "join",
    "list",
    "board",
    "todayRanks",
    "invite",
    "setNickname",
    "admin",
    "leave",
  ],
  rooms: [
    "create",
    "join",
    "shuffleName",
    "setName",
    "heartbeat",
    "playerState",
    "hostState",
    "hostAction",
    "answer",
    "leave",
    "subscribe",
  ],
  quizzes: ["listMine", "save", "remove", "share", "unshare", "landing"],
  reports: ["submit", "heart"],
  practice: ["uploadAnswers", "pulledItems"],
  analytics: ["log"],
  health: ["status"],
} as const satisfies { [A in BackendArea]: readonly (keyof GameBackend[A])[] };

type Unlisted<A extends BackendArea> = Exclude<
  keyof GameBackend[A],
  (typeof AREA_METHODS)[A][number]
>;
/** Fails to compile if an interface method is missing from AREA_METHODS. */
type AssertComplete<T extends { [A in BackendArea]: true }> = T;
export type _AreaMethodsComplete = AssertComplete<{
  [A in BackendArea]: [Unlisted<A>] extends [never] ? true : false;
}>;

/** `<area>.<method>`, as mock controls and contract tests name a call. */
export type BackendMethod = {
  [A in BackendArea]: `${A}.${(typeof AREA_METHODS)[A][number]}`;
}[BackendArea];

/**
 * An area whose every method answers `unavailable` (§7.6), and whose room
 * subscription is a no-op. The off backend uses it, and so do areas that
 * no ticket has built yet.
 */
export function unavailableArea<A extends BackendArea>(
  area: A,
): GameBackend[A] {
  const out: Record<string, unknown> = {};
  for (const method of AREA_METHODS[area]) {
    out[method] =
      area === "rooms" && method === "subscribe"
        ? () => () => {}
        : () => unavailable();
  }
  return out as unknown as GameBackend[A];
}

/** Builds a GameBackend from one factory per area. */
export function composeBackend(
  mode: BackendMode,
  make: <A extends BackendArea>(area: A) => GameBackend[A],
): GameBackend {
  return {
    mode,
    identity: make("identity"),
    sealed: make("sealed"),
    daily: make("daily"),
    streaks: make("streaks"),
    stats: make("stats"),
    challenges: make("challenges"),
    groups: make("groups"),
    rooms: make("rooms"),
    quizzes: make("quizzes"),
    reports: make("reports"),
    practice: make("practice"),
    analytics: make("analytics"),
    health: make("health"),
  };
}
