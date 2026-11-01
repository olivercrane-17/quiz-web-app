/**
 * Reports and hearts (ARCHITECTURE §3.9).
 */
import type {
  DailyNumber,
  EntityId,
  IdempotencyKey,
  ItemId,
  QuizShareCode,
  RoomId,
} from "./ids.ts";

/** The first on Mystery reveals only. */
export type ItemReportReason =
  | "guess_should_count"
  | "wrong_answer"
  | "ambiguous"
  | "out_of_date"
  | "offensive"
  | "typo";
export type QuizReportReason =
  "hateful" | "sexual" | "harassment" | "spam" | "wrong_answers" | "other";

export type ReportTarget =
  | { kind: "practice_item"; itemId: ItemId }
  | { kind: "daily_round"; dailyNumber: DailyNumber; round: number }
  | { kind: "pack_question"; itemId: ItemId }
  | { kind: "room_question"; roomId: RoomId; questionIndex: number }
  | { kind: "quiz"; code: QuizShareCode }
  | { kind: "quiz_question"; code: QuizShareCode; index: number };

export interface ReportInput {
  target: ReportTarget;
  reason: ItemReportReason | QuizReportReason;
  /** 'guess_should_count': the chosen wrong guess, null for "I couldn't find my answer". */
  guessEntityId?: EntityId | null;
  /** 280 chars or fewer; links stripped on both sides. */
  note: string | null;
  /** The outbox key; one report per identity per target. */
  clientId: IdempotencyKey;
}

/** itemRef: 'p.geo.0142', 'daily:42:2', 'room:<roomId>:7', 'quiz:<code>:3' */
export interface HeartInput {
  itemRef: string;
  on: boolean;
  clientId: IdempotencyKey;
}
