/**
 * Extension point (ARCHITECTURE §2.3): "My quizzes" as a question source
 * for a room (PRD §3.8.1, DESIGN §12.29). ROM-2's
 * `src/features/rooms/host/sources.ts` lists it next to "Our packs".
 *
 * A stub until EDT-3, which lists the player's saved quizzes (after the 18+
 * confirmation) as room sources. It lists nothing until then.
 */
import type { R } from "@/backend";
import type { RoomSource } from "@/engine/types";

/** One choice in the host's source picker. */
export interface HostSource {
  source: RoomSource;
  title: string;
  /** The theme line or the quiz's description. */
  detail: string;
  questionCount: number;
}

export interface HostSourceProvider {
  readonly id: string;
  /** The picker's heading for this source: "My quizzes". */
  readonly label: string;
  list(): R<HostSource[]>;
}

export const myQuizzesSource: HostSourceProvider = {
  id: "my_quizzes",
  label: "My quizzes",
  list: () => Promise.resolve({ ok: true, value: [] }),
};
