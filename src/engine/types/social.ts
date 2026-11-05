/**
 * Challenges and Groups (ARCHITECTURE §3.6).
 */
import type { DailyIdentity } from "./daily.ts";
import type { ChallengeCode, EpochMs, GroupId, LocalDate } from "./ids.ts";
import type { EncoreError, ShareCell } from "./rounds.ts";

export interface SideResult {
  nickname: string;
  points: number;
  maxPoints: number;
  rows: ShareCell[][];
  encore: EncoreError | null;
  totalMs: number;
}

export interface ChallengeLanding {
  code: ChallengeCode;
  state: "valid" | "expired" | "full" | "not_open" | "invalid";
  relation: "new" | "already_played" | "self";
  challenger: SideResult | null;
  /** null for packs. */
  daily: DailyIdentity | null;
  playAs: "ranked" | "archive" | "challenge_only" | "pack" | null;
  /** Set when state is 'not_open'. */
  unlocksAt: EpochMs | null;
  /** false for a rematch its sender hasn't played yet. */
  challengerPlayed: boolean;
}

export interface HeadToHead {
  code: ChallengeCode;
  you: SideResult;
  them: SideResult;
  verdict: {
    winner: "you" | "them" | "tie";
    decidedBy: "points" | "encore" | "time" | "tie";
  };
  rematchAvailable: boolean;
}

export interface ChallengeShelfItem {
  code: ChallengeCode;
  daily: DailyIdentity | null;
  counterpart: string;
  state: "to_play" | "waiting" | "won" | "lost" | "tied";
  createdAt: EpochMs;
}
export interface ChallengeShelf {
  received: ChallengeShelfItem[];
  waiting: ChallengeShelfItem[];
  finished: ChallengeShelfItem[];
}
export interface ChallengeParticipants {
  /** nickname: the participant's chosen nickname, or their generated friendly name; nothing else. */
  rows: {
    nickname: string;
    points: number;
    maxPoints: number;
    outcome: "win" | "loss" | "tie";
  }[];
}

export interface GroupSummary {
  id: GroupId;
  name: string;
  memberCount: number;
  role: "admin" | "member";
  myNickname: string;
}
export interface GroupInvitePreview {
  state: "valid" | "full" | "invalid";
  name: string | null;
  memberCount: number | null;
}

/** memberNo is a per-group handle. Player ids never leave the server. */
export interface GroupTodayRow {
  memberNo: number;
  nickname: string;
  isMe: boolean;
  status: "finished" | "not_yet";
  rank: number | null;
  points: number | null;
  maxPoints: number | null;
  /** All null until the viewer has finished. */
  rows: ShareCell[][] | null;
  encore: EncoreError | null;
}
/** points, daysPlayed and currentStreak leave today out until the viewer has finished today's Daily,
 *  so the week totals can't reveal anyone's score for today (AC-GRP-06). */
export interface GroupWeekRow {
  rank: number;
  memberNo: number;
  nickname: string;
  isMe: boolean;
  points: number;
  daysPlayed: number;
  currentStreak: number;
  /**
   * paused: currentStreak holds the pre-break count, shown as "23 · paused",
   * never 0 (PRD §3.7.2, AC-RPR-09).
   */
  streakPaused: boolean;
}

/** One line of the stop screen's Groups row and the home card's Group line (PRD §3.1.6 item 4). */
export interface GroupTodayRank {
  groupId: GroupId;
  name: string;
  /** null until the viewer has finished today's Daily. */
  rank: number | null;
  tied: boolean;
  finishers: number;
  notYet: number;
}
export interface GroupBoard {
  group: GroupSummary;
  today: {
    daily: DailyIdentity;
    viewerFinished: boolean;
    playedCount: number;
    rows: GroupTodayRow[];
  };
  week: {
    start: LocalDate;
    end: LocalDate;
    through: LocalDate;
    maxPoints: number;
    rows: GroupWeekRow[];
  };
  /** Everyone tied on the top points (AC-GRP-15). */
  lastWeek: { nicknames: string[]; points: number } | null;
  fetchedAt: EpochMs;
}
export type GroupAdminAction =
  | { kind: "rename"; name: string }
  | { kind: "regenerate_invite" }
  | { kind: "transfer_admin"; memberNo: number }
  | { kind: "remove"; memberNo: number }
  /** After both confirm steps on the client (AC-GRP-13). */
  | { kind: "delete" };
