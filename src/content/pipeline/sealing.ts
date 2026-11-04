/**
 * `content:seal` and `content:unseal`: moving sealed files between the
 * plaintext workspace (content/.sealed-plain/, git-ignored) and the
 * envelopes in content/sealed/ (committed), for every folder of ARCHITECTURE
 * §2.1. The format and the key live in scripts/content/crypto.ts, which the
 * CLIs share with this module.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  ENVELOPE_FOLDERS,
  checkEnvelopes,
  envelopeText,
  keyMatchesEnvelopes,
  listEnvelopeFiles,
  openEnvelopeFile,
  sealBytes,
  type SealKeys,
} from "../../../scripts/content/crypto.ts";
import { writeTextFile } from "./json.ts";
import { repoRelative, type Layout } from "./layout.ts";
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
  /** Skip the git-ignore guard. Tests only. */
  skipGuard?: boolean;
}

/**
 * Encrypts every workspace file whose envelope is missing or out of date.
 *
 * Refuses, before writing anything, when the key opens none of the envelopes
 * already in content/sealed/: sealing with a new or wrong key would leave the
 * folder split between two keys under one kid.
 */
export async function sealWorkspace(
  layout: Layout,
  keys: SealKeys,
  options: SealOptions = {},
): Promise<SealReport> {
  if (!layout.envelopeDir)
    throw new Error("fixture banks are plaintext and are never sealed");
  if (!options.skipGuard) assertWorkspaceIgnored(layout);
  const { matches, checked } = await keyMatchesEnvelopes(
    keys,
    layout.envelopeDir,
  );
  if (!matches) {
    throw new Error(
      `the content key opens none of the ${checked} envelope(s) in ${repoRelative(layout, layout.envelopeDir)}/, so it is not the key they were sealed with. Nothing was sealed: restore the project's key (content/sealed/README.md, "Recovering the key").`,
    );
  }
  const report: SealReport = {
    written: [],
    unchanged: 0,
    invalidJson: [],
    skipped: [],
    orphans: [],
  };
  const plainStems = new Set<string>();
  for (const folder of ENVELOPE_FOLDERS) {
    const dir = join(layout.workspaceDir, folder);
    if (!existsSync(dir)) continue;
    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      const source = join(dir, name);
      if (!SAFE_NAME.test(name)) {
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
      plainStems.add(`${folder}/${name.slice(0, -5)}`);
      const target = join(layout.envelopeDir, folder, `${name}.enc`);
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
  for (const envelope of await listEnvelopeFiles(layout.envelopeDir)) {
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
  for (const { folder, stem, abs } of await listEnvelopeFiles(
    layout.envelopeDir,
  )) {
    const rel = repoRelative(layout, abs);
    if (!SAFE_NAME.test(`${stem}.json`)) {
      report.failed.push({ file: rel, reason: "unsafe file name" });
      continue;
    }
    let plaintext: Buffer;
    try {
      plaintext = await openEnvelopeFile(keys, abs);
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

export interface VerifyReport {
  ok: number;
  failed: number;
  /** Each envelope that did not open, and why (no content, ever). */
  failures: { file: string; reason: string }[];
}

/**
 * Decrypts every envelope in memory and counts the results, writing
 * nothing (`content:unseal -- --verify`, ARCHITECTURE §5.4 recovery check).
 */
export async function verifyEnvelopes(
  layout: Layout,
  keys: SealKeys,
): Promise<VerifyReport> {
  if (!layout.envelopeDir) return { ok: 0, failed: 0, failures: [] };
  const check = await checkEnvelopes(keys, layout.envelopeDir);
  return {
    ok: check.opened,
    failed: check.failures.length,
    failures: check.failures.map(({ abs, reason }) => ({
      file: repoRelative(layout, abs),
      reason,
    })),
  };
}
