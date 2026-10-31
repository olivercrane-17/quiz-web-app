/**
 * `content:seal` and `content:unseal`: moving sealed files between the
 * plaintext workspace (content/.sealed-plain/, git-ignored) and the
 * envelopes in content/sealed/ (committed). See seal.ts for the format.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { listEnvelopes } from "./bank.ts";
import { writeTextFile } from "./json.ts";
import { SEALED_FOLDERS, repoRelative, type Layout } from "./layout.ts";
import {
  envelopeText,
  isEnvelope,
  openEnvelope,
  sealBytes,
  type SealKeys,
} from "./seal.ts";
import { assertWorkspaceIgnored } from "./store.ts";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

export interface SealReport {
  written: string[];
  unchanged: number;
  invalidJson: string[];
  skipped: string[];
  /** Envelopes with no plaintext in the workspace (left alone). */
  orphans: string[];
}

export interface SealOptions {
  skipGuard?: boolean;
}

/** Encrypts every workspace file whose envelope is missing or out of date. */
export async function sealWorkspace(
  layout: Layout,
  keys: SealKeys,
  options: SealOptions = {},
): Promise<SealReport> {
  if (!layout.envelopeDir)
    throw new Error("fixture banks are plaintext and are never sealed");
  if (!options.skipGuard) assertWorkspaceIgnored(layout);
  const report: SealReport = {
    written: [],
    unchanged: 0,
    invalidJson: [],
    skipped: [],
    orphans: [],
  };
  const plainStems = new Set<string>();
  for (const folder of SEALED_FOLDERS) {
    const dir = join(layout.workspaceDir, folder);
    if (!existsSync(dir)) continue;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const source = join(dir, entry.name);
      if (!SAFE_NAME.test(entry.name)) {
        report.skipped.push(repoRelative(layout, source));
        continue;
      }
      const bytes = await readFile(source);
      try {
        JSON.parse(bytes.toString("utf8"));
      } catch {
        // Sealed anyway, so work in progress is never lost; reported as an error.
        report.invalidJson.push(repoRelative(layout, source));
      }
      plainStems.add(`${folder}/${entry.name.slice(0, -5)}`);
      const target = join(layout.envelopeDir, folder, `${entry.name}.enc`);
      const text = envelopeText(sealBytes(keys, bytes));
      const current = existsSync(target)
        ? await readFile(target, "utf8")
        : null;
      if (current === text) {
        report.unchanged += 1;
        continue;
      }
      await writeTextFile(target, text);
      report.written.push(repoRelative(layout, target));
    }
  }
  for (const envelope of await listEnvelopes(layout)) {
    if (!plainStems.has(`${envelope.folder}/${envelope.stem}`))
      report.orphans.push(repoRelative(layout, envelope.abs));
  }
  return report;
}

export interface UnsealReport {
  written: string[];
  unchanged: number;
  /** Workspace files that differ from their envelope and were kept. */
  conflicts: string[];
  failed: { file: string; reason: string }[];
}

export interface UnsealOptions extends SealOptions {
  /** Overwrite workspace files that differ from their envelope. */
  force?: boolean;
}

/** Decrypts every envelope into the workspace. */
export async function unsealEnvelopes(
  layout: Layout,
  keys: SealKeys,
  options: UnsealOptions = {},
): Promise<UnsealReport> {
  if (!layout.envelopeDir)
    throw new Error("fixture banks are plaintext and are never sealed");
  if (!options.skipGuard) assertWorkspaceIgnored(layout);
  const report: UnsealReport = {
    written: [],
    unchanged: 0,
    conflicts: [],
    failed: [],
  };
  for (const { folder, stem, abs } of await listEnvelopes(layout)) {
    const rel = repoRelative(layout, abs);
    if (!SAFE_NAME.test(`${stem}.json`)) {
      report.failed.push({ file: rel, reason: "unsafe file name" });
      continue;
    }
    let plaintext: Buffer;
    try {
      const envelope: unknown = JSON.parse(await readFile(abs, "utf8"));
      if (!isEnvelope(envelope)) throw new Error("not a valid envelope");
      plaintext = openEnvelope(keys, envelope);
    } catch (error) {
      report.failed.push({ file: rel, reason: (error as Error).message });
      continue;
    }
    const target = join(layout.workspaceDir, folder, `${stem}.json`);
    if (existsSync(target)) {
      const current = await readFile(target);
      if (current.equals(plaintext)) {
        report.unchanged += 1;
        continue;
      }
      if (!options.force) {
        report.conflicts.push(repoRelative(layout, target));
        continue;
      }
    }
    await writeTextFile(target, plaintext);
    report.written.push(repoRelative(layout, target));
  }
  return report;
}

/**
 * Decrypts every envelope in memory and counts the results, writing
 * nothing (`content:unseal -- --verify`, ARCHITECTURE §5.4 recovery check).
 */
export async function verifyEnvelopes(
  layout: Layout,
  keys: SealKeys,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const { abs } of await listEnvelopes(layout)) {
    try {
      const envelope: unknown = JSON.parse(await readFile(abs, "utf8"));
      if (!isEnvelope(envelope)) throw new Error("not a valid envelope");
      openEnvelope(keys, envelope);
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}
