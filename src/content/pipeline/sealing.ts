/**
 * `content:seal` and `content:unseal`: moving sealed files between the
 * plaintext workspace (content/.sealed-plain/, git-ignored) and the
 * envelopes in content/sealed/ (committed), for every folder of ARCHITECTURE
 * §2.1. The format and the key live in scripts/content/crypto.ts, which the
 * CLIs share with this module.
 *
 * The workspace is private to its owner, like the key that decrypts it:
 * content:unseal keeps the workspace and its folders at mode 0700 and
 * writes each plaintext file at mode 0600, so on a shared machine no other
 * account can read a decrypted Daily.
 */
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  ENVELOPE_FOLDERS,
  checkEnvelopes,
  envelopeText,
  keyMatchesEnvelopes,
  listEnvelopeFiles,
  openEnvelopeFile,
  placementProblem,
  sealBytes,
  type SealKeys,
} from "../../../scripts/content/crypto.ts";
import { writeTextFile } from "./json.ts";
import { repoRelative, type Layout } from "./layout.ts";
import { assertWorkspaceIgnored } from "./store.ts";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

/** Creates a workspace folder, or tightens an existing one, to mode 0700. */
async function privateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // mkdir sets the mode only on a folder it creates, filtered by the umask.
  await chmod(dir, 0o700);
}

/** Writes a plaintext file at mode 0600: temp file, then rename. */
async function writePrivateFile(path: string, bytes: Buffer): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, bytes, { mode: 0o600 });
  // The mode above is filtered by the umask; set it exactly.
  await chmod(temp, 0o600);
  await rename(temp, path);
}

export interface SealReport {
  written: string[];
  unchanged: number;
  invalidJson: string[];
  /**
   * Files whose id is not their file name (or, for a schedule month, whose
   * dates are not in its month): sealed anyway, so work is never lost, but
   * content:unseal and --verify refuse the envelope until it is fixed.
   */
  misplaced: string[];
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
    misplaced: [],
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
      const stem = name.slice(0, -5);
      try {
        JSON.parse(bytes.toString("utf8"));
      } catch {
        // Sealed anyway, so work in progress is never lost; reported as an error.
        report.invalidJson.push(repoRelative(layout, source));
      }
      if (placementProblem(folder, stem, bytes))
        report.misplaced.push(repoRelative(layout, source));
      plainStems.add(`${folder}/${stem}`);
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

/**
 * Decrypts every envelope into the workspace. An envelope that does not
 * belong under its name (moved or copied, placementProblem) fails and is
 * not written.
 */
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
  // Tighten a workspace an older unseal left readable to everyone.
  if (existsSync(layout.workspaceDir)) {
    await chmod(layout.workspaceDir, 0o700);
    for (const folder of ENVELOPE_FOLDERS) {
      const dir = join(layout.workspaceDir, folder);
      if (existsSync(dir)) await chmod(dir, 0o700);
    }
  }
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
    const misplaced = placementProblem(folder, stem, plaintext);
    if (misplaced) {
      report.failed.push({ file: rel, reason: misplaced });
      continue;
    }
    const target = join(layout.workspaceDir, folder, `${stem}.json`);
    if (existsSync(target)) {
      await chmod(target, 0o600);
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
    await privateDir(layout.workspaceDir);
    await privateDir(dirname(target));
    await writePrivateFile(target, plaintext);
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
