/**
 * Identity (ARCHITECTURE §3.10).
 */
import type { DailyIdentity } from "./daily.ts";
import type { EpochMs, PlayerId, Secret } from "./ids.ts";

export type AgeBand = "under_13" | "13_17" | "18_plus";
/** PRD §3.10.6's five moments. */
export type AgeMoment =
  "nickname" | "group" | "reminder" | "quiz_share" | "room_name";

export interface LocalIdentity {
  v: 1;
  playerId: PlayerId;
  secret: Secret;
  /** The server has seen a write from this credential. */
  registered: boolean;
  createdAt: EpochMs;
  source: "minted" | "cookie" | "sync" | "claim";
  /** Last successful POST /api/identity. */
  cookieSavedAt: EpochMs | null;
}

export interface Profile {
  playerId: PlayerId;
  friendlyName: string;
  nickname: string | null;
  ageBand: AgeBand | null;
  createdAt: EpochMs;
}
export interface RestoredProfile {
  profile: Profile;
  streak: { current: number; best: number };
  lastDaily: DailyIdentity | null;
}
export interface ClaimPreview {
  friendlyName: string;
  nickname: string | null;
  streak: number;
  lastDaily: DailyIdentity | null;
  expiresAt: EpochMs;
}
export interface ServerDataExport {
  exportedAt: EpochMs;
  profile: Profile;
  attempts: unknown[];
  streakDays: unknown[];
  groups: unknown[];
  challenges: unknown[];
  quizzes: unknown[];
}
