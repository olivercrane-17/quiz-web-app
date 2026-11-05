// @vitest-environment node
/**
 * Replays src/engine/fixtures/room-scoring.json: every row of PRD §4.5.5,
 * the AC-ROM-08 grace boundaries, voids, rounding, a game's streaks, the
 * ranking and the gaps between seats.
 */
import { describe, expect, it } from "vitest";

import table from "../fixtures/room-scoring.json";
import { parseSeatId, type SeatId } from "../types/ids.ts";
import {
  ROOM_GRACE_MS,
  rankRoom,
  roomAnswerWindow,
  roomEffectiveMs,
  roomPoints,
  standingGap,
  type RoomAnswer,
  type RoomSeatScore,
} from "./room.ts";

function seatId(text: string): SeatId {
  const id = parseSeatId(text);
  if (id === null) throw new Error(`bad seat id ${text}`);
  return id;
}

const titleOf = (row: { ac?: string; title: string }) =>
  row.ac === undefined ? row.title : `${row.ac} ${row.title}`;

function seats(
  rows: readonly {
    seatId: string;
    name: string;
    score: number;
    correctMs: number;
  }[],
): RoomSeatScore[] {
  return rows.map((row) => ({ ...row, seatId: seatId(row.seatId) }));
}

describe("room-scoring.json points", () => {
  it.each(table.points.map((row) => [titleOf(row), row] as const))(
    "%s",
    (_, row) => {
      expect(
        roomPoints({
          scoring: row.scoring as "classic" | "accuracy",
          answer: row.answer as RoomAnswer,
          limitMs: row.limitMs,
          tServerMs: row.tServerMs,
          tClientMs: row.tClientMs,
          streakBefore: row.streakBefore,
          final: row.final,
        }),
      ).toEqual(row.expect);
    },
  );

  it("covers every worked example of PRD §4.5.5", () => {
    const prd = table.points.filter((row) => row.id.startsWith("prd-"));
    expect(prd).toHaveLength(8);
  });
});

describe("room-scoring.json windows", () => {
  const deadline = 1_800_000_000_000;

  it.each(table.windows.map((row) => [titleOf(row), row] as const))(
    "%s",
    (_, row) => {
      const receivedAt = deadline + (row.offsetMs ?? 0);
      expect(
        roomAnswerWindow(receivedAt, row.offsetMs === null ? null : deadline),
      ).toBe(row.expect);
    },
  );

  it("names the grace", () => {
    expect(ROOM_GRACE_MS).toBe(500);
  });
});

describe("room-scoring.json sequences", () => {
  it.each(table.sequences.map((row) => [row.title, row] as const))(
    "%s",
    (_, row) => {
      let streak = 0;
      let total = 0;
      let correctMs = 0;
      const points: number[] = [];
      const streaks: number[] = [];
      for (const answer of row.answers) {
        const result = roomPoints({
          scoring: row.scoring as "classic" | "accuracy",
          answer: answer.answer as RoomAnswer,
          limitMs: row.limitMs,
          tServerMs: answer.tServerMs,
          tClientMs: answer.tClientMs,
          streakBefore: streak,
          final: answer.final,
        });
        streak = result.streak;
        total += result.points;
        correctMs += result.effectiveMs ?? 0;
        points.push(result.points);
        streaks.push(result.streak);
      }
      expect({ points, streaks, total, correctMs }).toEqual(row.expect);
    },
  );
});

describe("room-scoring.json ranking", () => {
  it.each(table.ranking.map((row) => [row.title, row] as const))(
    "%s",
    (_, row) => {
      const standings = rankRoom(seats(row.seats));
      expect(
        standings.map(({ seatId: id, rank }) => ({ seatId: id, rank })),
      ).toEqual(row.expect);
    },
  );

  it.each(table.gaps.map((row) => [row.title, row] as const))(
    "%s",
    (_, row) => {
      const standings = rankRoom(seats(row.seats));
      for (const [id, gap] of Object.entries(row.expect)) {
        expect(standingGap(standings, seatId(id)), id).toEqual(gap);
      }
    },
  );

  it("gives an unknown seat no gap, and a tied leader the lead over the next rank", () => {
    const standings = rankRoom(
      seats([
        {
          seatId: "00000000-0000-4000-8000-00000000000a",
          name: "A",
          score: 900,
          correctMs: 1,
        },
        {
          seatId: "00000000-0000-4000-8000-00000000000b",
          name: "B",
          score: 900,
          correctMs: 1,
        },
        {
          seatId: "00000000-0000-4000-8000-00000000000c",
          name: "C",
          score: 500,
          correctMs: 1,
        },
      ]),
    );
    expect(
      standingGap(standings, seatId("00000000-0000-4000-8000-00000000000d")),
    ).toEqual({
      above: null,
      below: null,
    });
    expect(
      standingGap(standings, seatId("00000000-0000-4000-8000-00000000000b")),
    ).toEqual({
      above: null,
      below: { name: "C", gap: 400 },
    });
  });
});

describe("roomEffectiveMs", () => {
  it("leaves the time unclamped when the timer is off", () => {
    expect(roomEffectiveMs(70_400, 65_000, null)).toBe(70_000);
    expect(roomEffectiveMs(70_400, 65_000, 60_000)).toBe(60_000);
  });
});
