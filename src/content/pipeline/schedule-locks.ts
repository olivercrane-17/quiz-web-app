/**
 * Where the schedule holds an item (CNT-2b): the main-track Dailies, spare
 * sets and challenge packs that name it, read from the sealed workspace.
 * `content:batch -- retire` refuses an item a Daily still to close, a spare
 * set or a challenge pack names unless --allow-frozen, as content:release
 * refuses changes to frozen Dailies (ARCHITECTURE §5.4, §8.7): the release
 * that followed would otherwise put a retired item on a Daily that has not
 * closed. An item that only played on Dailies that have closed retires
 * freely, as the database's item_locks lets it. The database alone decides
 * what is frozen; this is the view the files give, taken conservatively.
 * The e2e track holds invented fixtures and has no locks, as in the release.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { ChallengePackSchema } from "../schema/challenge-packs.ts";
import { listEnvelopes, type Bank, type BankItem } from "./bank.ts";

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * True once the Daily of local date `date` has closed everywhere, by the
 * UTC date `today`. A Daily plays from 00:00 at UTC+14 to 24:00 at UTC-12,
 * so it closes at 12:00 UTC the day after its date
 * (private.daily_closes_at, §8.7); from the date alone that is certain two
 * days after it.
 */
export function dailyHasClosed(date: string, today: string): boolean {
  return date <= addDays(today, -2);
}

export interface ScheduleLocks {
  /** Main-track Dailies naming the item whose window has not closed. */
  open: number;
  /** Of those, the ones the schedule marks frozen or published. */
  frozen: number;
  /** Main-track Dailies naming the item that have closed: it played there. */
  played: number;
  /** Main-track spare sets naming the item. */
  spares: number;
  /** Main-track challenge packs naming the item. */
  challengePacks: number;
  /**
   * Schedule and spare envelopes in content/sealed/ with no workspace
   * file, so the guard cannot see them: run content:unseal first.
   */
  unsealed: number;
}

/** What locks one item: anything but `played` keeps it from retiring freely. */
export function isLocked(locks: ScheduleLocks): boolean {
  return (
    locks.open > 0 ||
    locks.spares > 0 ||
    locks.challengePacks > 0 ||
    locks.unsealed > 0
  );
}

/** Main-track challenge packs in the workspace that name the item. */
async function challengePacksNaming(
  bank: Bank,
  itemId: string,
): Promise<number> {
  const dir = join(bank.layout.workspaceDir, "challenge-packs");
  if (!existsSync(dir)) return 0;
  let found = 0;
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith(".json")) continue;
    const raw = await readFile(join(dir, name), "utf8");
    let pack: unknown;
    try {
      pack = JSON.parse(raw);
    } catch {
      pack = undefined;
    }
    const parsed = ChallengePackSchema.safeParse(pack);
    if (parsed.success) {
      if (
        parsed.data.track === "main" &&
        parsed.data.rounds.some((round) => round.contentId === itemId)
      )
        found += 1;
    } else if (raw.includes(JSON.stringify(itemId))) {
      // A pack content:check would refuse still counts while it names the
      // item: the guard errs towards a lock.
      found += 1;
    }
  }
  return found;
}

/** Schedule and spare envelopes the workspace has no plaintext file for. */
async function unsealedSchedule(bank: Bank): Promise<number> {
  if (bank.layout.kind !== "content" || bank.sealedSource === "envelopes")
    return 0;
  const present = new Set(
    bank.files
      .filter((file) => file.kind === "schedule" || file.kind === "spare")
      .map((file) => `${file.kind}/${file.stem}`),
  );
  return (await listEnvelopes(bank.layout)).filter(
    ({ folder, stem }) =>
      (folder === "schedule" || folder === "spares") &&
      !present.has(`${folder === "spares" ? "spare" : "schedule"}/${stem}`),
  ).length;
}

/**
 * Where the main track's schedule holds an item, by the UTC date `today`.
 * Only sealed items are ever scheduled (a Daily's rounds name mysteries,
 * encores and sealed choice questions), so for a practice item the
 * workspace's completeness does not matter.
 */
export async function scheduleLocks(
  bank: Bank,
  record: BankItem,
  today: string,
): Promise<ScheduleLocks> {
  const itemId = record.id;
  const locks: ScheduleLocks = {
    open: 0,
    frozen: 0,
    played: 0,
    spares: 0,
    challengePacks: 0,
    unsealed: 0,
  };
  for (const { month } of bank.schedules) {
    if (month.track !== "main") continue;
    for (const daily of month.dailies) {
      if (!daily.rounds.some((round) => round.contentId === itemId)) continue;
      if (dailyHasClosed(daily.date, today)) locks.played += 1;
      else {
        locks.open += 1;
        if (daily.status !== "assembled") locks.frozen += 1;
      }
    }
  }
  for (const { spare } of bank.spares) {
    if (
      spare.track === "main" &&
      spare.rounds.some((round) => round.contentId === itemId)
    )
      locks.spares += 1;
  }
  if (record.file.sealed) {
    locks.challengePacks = await challengePacksNaming(bank, itemId);
    locks.unsealed = await unsealedSchedule(bank);
  }
  return locks;
}
