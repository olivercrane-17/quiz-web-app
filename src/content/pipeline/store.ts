/**
 * Writing items back. Practice items go to their own file; mysteries and
 * encores to their plaintext workspace file; room questions back into their
 * pack. Items decrypted from envelopes are never written.
 *
 * Before anything lands in content/.sealed-plain/, the git-ignore guard of
 * CONTENT_GUIDE §11.2 runs: `git check-ignore -q content/.sealed-plain/probe.json`
 * must succeed, or nothing is written.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import type { AnyItem } from "../schema/items.ts";
import type { Bank, BankFile, BankItem } from "./bank.ts";
import { cloneJson, writeJsonFile } from "./json.ts";
import type { Layout } from "./layout.ts";

/** Throws unless `probe` (a path that need not exist) is git-ignored. */
function assertIgnored(layout: Layout, probe: string): void {
  if (layout.kind === "fixtures") return;
  const result = spawnSync("git", ["check-ignore", "-q", probe], {
    cwd: layout.repoRoot,
  });
  if (result.status !== 0) {
    throw new Error(
      `${probe} is not git-ignored (git check-ignore exit ${String(result.status)}). ` +
        "Stop and tell the editor: sealed plaintext must never be committed (CONTENT_GUIDE §11.2).",
    );
  }
}

/** Throws unless the plaintext workspace is git-ignored. */
export function assertWorkspaceIgnored(layout: Layout): void {
  assertIgnored(layout, join(layout.workspaceDir, "probe.json"));
}

/**
 * Throws unless .cache/packets/ is git-ignored. Packets of sealed items hold
 * their clues and keys in plaintext, so content:packet runs this first.
 */
export function assertPacketsIgnored(layout: Layout): void {
  assertIgnored(layout, join(layout.packetsDir, "probe.json"));
}

export interface SaveOptions {
  /** Skip the git-ignore guard. Tests only. */
  skipGuard?: boolean;
}

/** Writes updated items, one write per file. Returns the files written. */
export async function saveItems(
  bank: Bank,
  updates: Map<string, AnyItem>,
  options: SaveOptions = {},
): Promise<string[]> {
  const byFile = new Map<BankFile, { record: BankItem; item: AnyItem }[]>();
  for (const [id, item] of updates) {
    const record = bank.itemsById.get(id);
    if (!record) throw new Error(`${id} is not in the bank`);
    if (record.file.fromEnvelope) {
      throw new Error(
        `${id} was read from an envelope; run content:unseal and work in the workspace`,
      );
    }
    const list = byFile.get(record.file) ?? [];
    list.push({ record, item });
    byFile.set(record.file, list);
  }
  if (!options.skipGuard && [...byFile.keys()].some((file) => file.sealed)) {
    assertWorkspaceIgnored(bank.layout);
  }
  const written: string[] = [];
  for (const [file, changes] of byFile) {
    let data: unknown;
    if (file.kind === "room-pack") {
      const pack = cloneJson(file.data) as { questions: unknown[] };
      for (const { record, item } of changes) {
        if (record.index === undefined)
          throw new Error(`${record.id} has no position in its pack`);
        pack.questions[record.index] = item;
      }
      data = pack;
    } else {
      const [change] = changes;
      if (!change || changes.length > 1)
        throw new Error(`${file.rel} holds one item`);
      data = change.item;
    }
    await writeJsonFile(file.abs, data);
    file.data = data;
    for (const { record, item } of changes) record.item = item;
    written.push(file.rel);
  }
  return written;
}
