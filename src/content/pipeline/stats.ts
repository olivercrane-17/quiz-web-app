/**
 * `content:stats`: counts by pool, category, difficulty band, format and
 * status, the batches' progress, and the Daily runway (§10.7).
 */
import { ANSWER_TYPES } from "../schema/primitives.ts";
import type { Bank } from "./bank.ts";
import type { Pool } from "./ids.ts";
import { bandOf, itemsByBatch } from "./lint/pool-rules.ts";

type Counter = Record<string, number>;

export interface PoolStats {
  total: number;
  byStatus: Counter;
  byCategory: Counter;
  byBand: Counter;
  byFormat: Counter;
}

export interface Stats {
  today: string;
  pools: Record<Pool, PoolStats>;
  lists: Record<string, { active: number; retired: number }>;
  batches: {
    batchId: string;
    status: string;
    target: number;
    drafted: number;
    active: number;
    cut: number;
  }[];
  runway: {
    /** Main-track Dailies scheduled on or after today. */
    scheduled: number;
    /** Consecutive scheduled days starting today. */
    consecutive: number;
    lastDate: string | null;
    /** Below 30 scheduled Dailies the runway alarm sounds (PRD §3.18.2). */
    alarm: boolean;
    /** Active, unscheduled pool items, and the Dailies they could fill (main track). */
    pool: {
      mystery1: number;
      mystery2: number;
      mystery3: number;
      encores: number;
      dailies: number;
    };
    spares: number;
  };
}

const bump = (counter: Counter, key: string) => {
  counter[key] = (counter[key] ?? 0) + 1;
};

function emptyPool(): PoolStats {
  return { total: 0, byStatus: {}, byCategory: {}, byBand: {}, byFormat: {} };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeStats(bank: Bank, today: string): Stats {
  const pools: Record<Pool, PoolStats> = {
    practice: emptyPool(),
    mystery: emptyPool(),
    encore: emptyPool(),
    room: emptyPool(),
  };
  for (const { pool, item } of bank.items) {
    const stats = pools[pool];
    stats.total += 1;
    bump(stats.byStatus, item.status);
    bump(stats.byCategory, item.category);
    bump(stats.byBand, bandOf(item));
    bump(
      stats.byFormat,
      "kind" in item
        ? item.kind === "choice"
          ? "mc"
          : item.kind
        : item.format,
    );
  }

  const lists: Stats["lists"] = {};
  for (const type of ANSWER_TYPES) {
    const entities = [...(bank.lists.get(type)?.entities.values() ?? [])];
    lists[type] = {
      active: entities.filter((entity) => entity.status === "active").length,
      retired: entities.filter((entity) => entity.status === "retired").length,
    };
  }

  const byBatch = itemsByBatch(bank);
  const batches = (bank.register?.batches ?? []).map((batch) => {
    if (batch.pool === "list") {
      // List batches add entities, recorded by their source (§2.10).
      const entities = [
        ...(bank.lists.get(batch.answerType ?? "country")?.entities.values() ??
          []),
      ].filter((entity) => entity.source.startsWith(batch.batchId));
      return {
        batchId: batch.batchId,
        status: batch.status,
        target: batch.plan.target,
        drafted: entities.length,
        active: entities.filter((entity) => entity.status === "active").length,
        cut: entities.filter((entity) => entity.status === "retired").length,
      };
    }
    const records = byBatch.get(batch.batchId) ?? [];
    return {
      batchId: batch.batchId,
      status: batch.status,
      target: batch.plan.target,
      drafted: records.length,
      active: records.filter((record) => record.item.status === "active")
        .length,
      cut: records.filter((record) => record.item.status === "cut").length,
    };
  });

  const dates = new Set<string>();
  const used = new Set<string>();
  for (const { month } of bank.schedules) {
    if (month.track !== "main") continue;
    for (const daily of month.dailies) {
      daily.rounds.forEach((round) => used.add(round.contentId));
      if (daily.date >= today) dates.add(daily.date);
    }
  }
  const spares = bank.spares.filter(({ spare }) => spare.track === "main");
  for (const { spare } of spares)
    spare.rounds.forEach((round) => used.add(round.contentId));
  let consecutive = 0;
  while (dates.has(addDays(today, consecutive))) consecutive += 1;
  const sorted = [...dates].sort();
  const free = bank.items.filter(
    (record) =>
      record.item.status === "active" &&
      record.item.region === "global" &&
      !used.has(record.id),
  );
  const slot = (n: number) =>
    free.filter(
      (record) =>
        "kind" in record.item &&
        record.item.kind === "mystery" &&
        record.item.slot === n,
    ).length;
  const encores = free.filter(
    (record) => "kind" in record.item && record.item.kind === "encore",
  ).length;
  const pool = {
    mystery1: slot(1),
    mystery2: slot(2),
    mystery3: slot(3),
    encores,
    dailies: 0,
  };
  pool.dailies = Math.min(
    pool.mystery1,
    pool.mystery2,
    pool.mystery3,
    pool.encores,
  );

  return {
    today,
    pools,
    lists,
    batches,
    runway: {
      scheduled: dates.size,
      consecutive,
      lastDate: sorted.at(-1) ?? null,
      alarm: dates.size < 30,
      pool,
      spares: spares.length,
    },
  };
}

function row(cells: (string | number)[], widths: number[]): string {
  return cells
    .map((cell, i) => String(cell).padEnd(widths[i] ?? 8))
    .join("  ")
    .trimEnd();
}

export function formatStats(stats: Stats): string {
  const lines: string[] = [];
  lines.push(`Content stats for ${stats.today}`, "");
  const pools = ["practice", "mystery", "encore", "room"] as const;
  lines.push(
    row(
      ["pool", "total", "draft", "checking", "active", "cut", "retired"],
      [9, 6, 6, 9, 7, 5, 7],
    ),
  );
  for (const pool of pools) {
    const s = stats.pools[pool];
    const st = (key: string) => s.byStatus[key] ?? 0;
    lines.push(
      row(
        [
          pool,
          s.total,
          st("draft"),
          st("checking"),
          st("active"),
          st("cut"),
          st("retired"),
        ],
        [9, 6, 6, 9, 7, 5, 7],
      ),
    );
  }
  lines.push("");
  for (const pool of pools) {
    const s = stats.pools[pool];
    if (s.total === 0) continue;
    const fmt = (counter: Counter) =>
      Object.entries(counter)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key} ${value}`)
        .join(", ");
    lines.push(`${pool}: categories ${fmt(s.byCategory)}`);
    lines.push(
      `${pool}: difficulty ${fmt(s.byBand)}; format ${fmt(s.byFormat)}`,
    );
  }
  lines.push("", "Answer lists (active entries):");
  lines.push(
    Object.entries(stats.lists)
      .map(([type, { active }]) => `${type} ${active}`)
      .join(", "),
  );
  const r = stats.runway;
  lines.push(
    "",
    `Daily runway: ${r.scheduled} scheduled from today (${r.consecutive} consecutive), last ${r.lastDate ?? "none"}${r.alarm ? "  ALARM: below 30 (§10.7)" : ""}`,
    `Unscheduled active pool: Mystery 1 ${r.pool.mystery1}, Mystery 2 ${r.pool.mystery2}, Mystery 3 ${r.pool.mystery3}, encores ${r.pool.encores}: enough for ${r.pool.dailies} more Dailies. Spare sets: ${r.spares}.`,
  );
  const open = stats.batches.filter(
    (batch) => batch.status !== "planned" || batch.drafted > 0,
  );
  lines.push(
    "",
    `Batches: ${stats.batches.length} in the register, ${stats.batches.filter((b) => b.status === "planned").length} planned.`,
  );
  if (open.length > 0) {
    lines.push(
      row(
        ["batch", "status", "target", "drafted", "active", "cut"],
        [24, 10, 7, 8, 7, 5],
      ),
    );
    for (const batch of open) {
      lines.push(
        row(
          [
            batch.batchId,
            batch.status,
            batch.target,
            batch.drafted,
            batch.active,
            batch.cut,
          ],
          [24, 10, 7, 8, 7, 5],
        ),
      );
    }
  }
  return lines.join("\n");
}
