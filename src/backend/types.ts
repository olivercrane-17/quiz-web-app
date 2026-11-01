/**
 * GameBackend and its sub-interfaces (ARCHITECTURE §7.2).
 *
 * One interface, three implementations (`supabase`, `mock`, `off`), picked
 * by NEXT_PUBLIC_BACKEND_MODE at build time. Features import only
 * `@/backend` (getBackend() and these types).
 *
 * - Results, not exceptions: every method resolves to Result<T>. Expected
 *   failures never throw; a thrown error is a bug.
 * - Identity is implicit: the backend adds the player id and secret to every
 *   call that needs them. Feature code never handles secrets.
 * - Callers own idempotency and retries: writes take a key from the caller,
 *   and the backend itself never retries a write.
 * - Every response carries server time, fed to the server clock (§4.3).
 */
import type {
  BrowserContextKind,
  EventEnvelope,
  Platform,
} from "@/analytics/dictionary";
import type { BackendMode } from "@/lib/env";
import type {
  AchievementId,
  AgeBand,
  AgeMoment,
  ArchiveListing,
  AttemptId,
  AttemptSnapshot,
  ChallengeCode,
  ChallengeLanding,
  ChallengeParticipants,
  ChallengeShelf,
  ChoiceCrowd,
  ClaimPreview,
  ClaimToken,
  DailyResults,
  DailyTodayCard,
  EncoreCrowd,
  EpochMs,
  FinishSummary,
  GroupAdminAction,
  GroupBoard,
  GroupId,
  GroupInvitePreview,
  GroupSummary,
  GroupTodayRank,
  HeadToHead,
  HeartInput,
  HostToken,
  IdempotencyKey,
  InviteCode,
  ItemId,
  MysteryCrowd,
  NoticeId,
  PercentileView,
  PlayerId,
  PlayerServerStats,
  Profile,
  QuizDraft,
  QuizId,
  QuizShareCode,
  ReportInput,
  RestoredProfile,
  Result,
  RoomCode,
  RoomHint,
  RoomHostAction,
  RoomHostView,
  RoomId,
  RoomPlayerView,
  RoomSettings,
  RoomSource,
  RoundIntent,
  RoundStart,
  RoundVerdict,
  RunMode,
  ScoreHistogram,
  SealedSource,
  SeatId,
  SeatToken,
  Secret,
  ServerDataExport,
  ServiceStatus,
  StreakState,
  SyncCode,
  TimeZone,
  UserQuiz,
  SharedQuizLanding,
} from "@/engine/types";

/** What every backend method resolves to. */
export type R<T> = Promise<Result<T>>;

export interface BrowserContextInfo {
  context: BrowserContextKind;
  app: AppTag;
  platform: Platform;
}
export type AppTag =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "messenger"
  | "tiktok"
  | "snapchat"
  | "linkedin"
  | "telegram"
  | "google"
  | "other"
  | "none";
export type NicknameInput = { custom: string } | { generated: string };

export type { BackendMode };

export interface GameBackend {
  readonly mode: BackendMode;
  readonly identity: IdentityApi;
  /** Daily, archive, challenge, pack and shared-quiz plays. */
  readonly sealed: SealedRunApi;
  readonly daily: DailyApi;
  readonly streaks: StreakApi;
  readonly stats: StatsApi;
  readonly challenges: ChallengeApi;
  readonly groups: GroupApi;
  /** Beta. */
  readonly rooms: RoomApi;
  /** Beta. */
  readonly quizzes: QuizApi;
  readonly reports: ReportApi;
  readonly practice: PracticeSyncApi;
  readonly analytics: AnalyticsApi;
  readonly health: HealthApi;
}

/** The areas of GameBackend, in the order the implementations compose them. */
export const BACKEND_AREAS = [
  "identity",
  "sealed",
  "daily",
  "streaks",
  "stats",
  "challenges",
  "groups",
  "rooms",
  "quizzes",
  "reports",
  "practice",
  "analytics",
  "health",
] as const satisfies readonly Exclude<keyof GameBackend, "mode">[];
export type BackendArea = (typeof BACKEND_AREAS)[number];

export interface IdentityApi {
  /** Writes register implicitly; this exists for flows that need a profile before any write. */
  register(browser: BrowserContextInfo): R<Profile>;
  getProfile(): R<Profile>;
  setAgeBand(band: AgeBand, moment: AgeMoment): R<Profile>;
  /** Custom text needs the 18+ band. */
  setNickname(nickname: NicknameInput): R<Profile>;
  /** Replaces the previous code. */
  createSyncCode(): R<{ code: SyncCode; createdAt: EpochMs }>;
  redeemSyncCode(
    code: string,
    newSecret: Secret,
  ): R<RestoredProfile & { playerId: PlayerId }>;
  /** Device-minted; a retry with the same token returns the same claim. */
  createClaim(token: ClaimToken): R<{ expiresAt: EpochMs }>;
  peekClaim(token: ClaimToken): R<ClaimPreview>;
  redeemClaim(
    token: ClaimToken,
    newSecret: Secret,
  ): R<RestoredProfile & { playerId: PlayerId }>;
  exportData(): R<ServerDataExport>;
  deletePlayer(): R<void>;
}

export interface SealedRunApi {
  /** A new attempt comes back with round 0 already open, so its first clue or stem arrives with the start (PRD §4.1.4). */
  start(
    source: SealedSource,
    ctx: { tz: TimeZone; browser: BrowserContextInfo; appVersion: string },
  ): R<AttemptSnapshot>;
  get(attemptId: AttemptId): R<AttemptSnapshot>;
  /**
   * converted: true once the window's close has turned the attempt into an
   * unranked archive run (§8.7). A voided round arrives withdrawn.
   */
  beginRound(
    attemptId: AttemptId,
    index: number,
  ): R<{
    start: RoundStart;
    finished: FinishSummary | null;
    converted: boolean;
    serverTime: EpochMs;
  }>;
  act(input: {
    attemptId: AttemptId;
    index: number;
    /** The clue number (mystery) or 1; a mismatch returns 'stale'. */
    step: number;
    intent: RoundIntent;
    clientActiveMs: number;
    /** Honest-play report: hidden or blurred time in this round so far. */
    hiddenMs: number;
    key: IdempotencyKey;
  }): R<{
    verdict: RoundVerdict;
    finished: FinishSummary | null;
    converted: boolean;
    serverTime: EpochMs;
  }>;
  /** Idempotent; the last act() already finishes. */
  finish(attemptId: AttemptId): R<FinishSummary>;
}

export interface DailyApi {
  /** Callable before any identity exists. */
  today(tz: TimeZone): R<DailyTodayCard>;
  results(attemptId: AttemptId): R<DailyResults>;
  /** The caller's finished attempts only; refetched on every visit. */
  numbers(attemptId: AttemptId): R<{
    percentile: PercentileView;
    histogram: ScoreHistogram | null;
    /** One per round. */
    crowd: (MysteryCrowd | EncoreCrowd | ChoiceCrowd | null)[];
  }>;
  /**
   * Repair is not a separate call: finishing an archive attempt of a
   * repairable date repairs the streak (§8.10).
   */
  archive(tz: TimeZone): R<ArchiveListing>;
}

export interface StreakApi {
  /** Evaluates gaps on the server, idempotent. */
  get(tz: TimeZone): R<StreakState>;
  acknowledge(ids: NoticeId[]): R<void>;
}

export interface StatsApi {
  get(tz: TimeZone): R<PlayerServerStats>;
  recordAchievements(
    ids: AchievementId[],
  ): R<{ newlyRecorded: AchievementId[] }>;
}

export interface ChallengeApi {
  create(
    attemptId: AttemptId,
    clientId: IdempotencyKey,
  ): R<{ code: ChallengeCode; expiresAt: EpochMs }>;
  /** Callable without identity. */
  landing(code: ChallengeCode, tz: TimeZone): R<ChallengeLanding>;
  headToHead(code: ChallengeCode): R<HeadToHead>;
  rematch(
    code: ChallengeCode,
    tz: TimeZone,
    clientId: IdempotencyKey,
  ): R<{ code: ChallengeCode }>;
  shelf(): R<ChallengeShelf>;
  /** The challenger only. */
  participants(code: ChallengeCode): R<ChallengeParticipants>;
}

export interface GroupApi {
  create(input: {
    name: string;
    nickname: NicknameInput;
    clientId: IdempotencyKey;
  }): R<{ group: GroupSummary; invite: InviteCode }>;
  /** Callable without identity. */
  preview(invite: InviteCode): R<GroupInvitePreview>;
  join(invite: InviteCode, nickname: NicknameInput): R<GroupSummary>;
  /** deleted: Groups the caller belonged to that their admin deleted, shown once and then acked (AC-GRP-13). */
  list(): R<{
    groups: GroupSummary[];
    deleted: { noticeId: NoticeId; name: string }[];
  }>;
  board(groupId: GroupId, tz: TimeZone): R<GroupBoard>;
  /** The stop screen's row and the home card's line. */
  todayRanks(tz: TimeZone): R<GroupTodayRank[]>;
  invite(groupId: GroupId): R<{ invite: InviteCode }>;
  setNickname(groupId: GroupId, nickname: NicknameInput): R<GroupSummary>;
  /** Both null after 'delete'. */
  admin(
    groupId: GroupId,
    action: GroupAdminAction,
  ): R<{ group: GroupSummary | null; invite: InviteCode | null }>;
  leave(groupId: GroupId): R<void>;
}

export interface RoomApi {
  /** hostToken is minted on the device and doubles as the idempotency key with clientId. */
  create(input: {
    source: RoomSource;
    settings: RoomSettings;
    hostToken: HostToken;
    clientId: IdempotencyKey;
  }): R<{ roomId: RoomId; code: RoomCode }>;
  /** seatToken is minted on the device before the first join and stored, so a retry finds the same seat. */
  join(input: {
    code: RoomCode;
    method: "qr" | "code";
    seatToken: SeatToken;
  }): R<{
    roomId: RoomId;
    seatId: SeatId;
    name: string;
    rejoined: boolean;
    scoresFrom: number;
  }>;
  shuffleName(roomId: RoomId, seat: SeatToken): R<{ name: string }>;
  /** Typed names only; 18+ from the profile or the seat. */
  setName(
    roomId: RoomId,
    seat: SeatToken,
    name: string,
    ageBand?: AgeBand,
  ): R<{ name: string }>;
  heartbeat(roomId: RoomId, seat: SeatToken): R<{ version: number }>;
  playerState(roomId: RoomId, seat: SeatToken): R<RoomPlayerView>;
  hostState(roomId: RoomId, host: HostToken): R<RoomHostView>;
  hostAction(
    roomId: RoomId,
    host: HostToken,
    action: RoomHostAction,
    expectedVersion: number,
  ): R<RoomHostView>;
  answer(input: {
    roomId: RoomId;
    seat: SeatToken;
    questionIndex: number;
    option: number;
    clientMs: number;
    key: IdempotencyKey;
  }): R<{ accepted: boolean; late: boolean }>;
  leave(roomId: RoomId, seat: SeatToken): R<void>;
  /** Hints only. Returns an unsubscribe function. The sync controller adds polling (§8.11). */
  subscribe(
    roomId: RoomId,
    audience: "players" | "host",
    on: {
      hint(hint: RoomHint): void;
      status(status: "live" | "down"): void;
    },
  ): () => void;
}

export interface QuizApi {
  listMine(): R<UserQuiz[]>;
  /**
   * A first save sends draft.localId (a UUID) as its key; 'conflict' carries
   * the server copy in error.current.
   */
  save(draft: QuizDraft): R<UserQuiz>;
  remove(quizId: QuizId): R<void>;
  share(
    quizId: QuizId,
    confirm: { adult: true; policy: true },
  ): R<{ code: QuizShareCode }>;
  unshare(quizId: QuizId): R<void>;
  /** Callable without identity. */
  landing(code: QuizShareCode): R<SharedQuizLanding>;
}

export interface ReportApi {
  /** stored: false for a duplicate. */
  submit(input: ReportInput): R<{ stored: boolean }>;
  heart(input: HeartInput): R<void>;
}

/** One practice first attempt, as uploaded (§3.3.1). */
export interface PracticeAnswerUpload {
  itemId: ItemId;
  correct: boolean;
  /** In source order (the ChoiceItem.correct index space). */
  option: number;
  timeBucket: "0-5" | "5-15" | "15-30" | "30+";
  mode: RunMode;
  /** A run in a category the player chose: counts half (CONTENT_GUIDE §8.6). */
  selfPicked: boolean;
  clientId: IdempotencyKey;
}

export interface PracticeSyncApi {
  /** option is in source order (the ChoiceItem.correct index space). Once the identity is registered the
   *  backend adds its credential, and only those answers count toward report weight (§8.12). At most 50 per call. */
  uploadAnswers(batch: PracticeAnswerUpload[]): R<{ accepted: number }>;
  pulledItems(sinceVersion: number): R<{ version: number; itemIds: ItemId[] }>;
}

export interface AnalyticsApi {
  /** At most 50. */
  log(
    batch: (EventEnvelope & { props: Record<string, unknown> })[],
  ): R<{ accepted: number }>;
}

export interface HealthApi {
  status(): R<ServiceStatus>;
}
