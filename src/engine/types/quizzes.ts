/**
 * User quizzes, Beta (ARCHITECTURE §3.8).
 */
import type { EpochMs, QuizId, QuizShareCode } from "./ids.ts";

export interface UserQuizQuestion {
  format: "mc" | "tf";
  stem: string;
  options: string[];
  correct: number;
  explanation: string;
}
export type QuizState = "private" | "shared" | "hidden" | "taken_down";

export interface UserQuiz {
  id: QuizId;
  title: string;
  description: string;
  questions: UserQuizQuestion[];
  /** The immutable version that plays, rooms and challenges reference (§8.3). */
  version: number;
  updatedAt: EpochMs;
  shareCode: QuizShareCode | null;
  state: QuizState;
  stats: { plays: number; averageScore: number | null };
}

export interface QuizDraft {
  localId: string;
  serverId: QuizId | null;
  baseVersion: number | null;
  title: string;
  description: string;
  questions: UserQuizQuestion[];
  updatedAt: EpochMs;
  savedAt: EpochMs | null;
}

export type BlockingRule =
  | "B_TITLE"
  | "B_STEM"
  | "B_OPTIONS_MIN"
  | "B_OPTION_EMPTY"
  | "B_OPTION_DUP"
  | "B_CORRECT"
  | "B_LENGTH"
  | "B_TEXT"
  | "B_COUNT";
export type LintRule = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7" | "L8";
export interface LintFinding {
  rule: LintRule | BlockingRule;
  severity: "warning" | "blocking";
  path: string;
  message: string;
}

export interface SharedQuizLanding {
  code: QuizShareCode;
  state: "available" | "hidden" | "unavailable";
  title: string | null;
  description: string | null;
  questionCount: number | null;
}
export interface ImportRow {
  row: number;
  status: "ok" | "warning" | "error";
  question: UserQuizQuestion | null;
  messages: string[];
}
