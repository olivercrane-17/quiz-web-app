/**
 * Writing the build's outputs, and the drift check (ARCHITECTURE §5.3,
 * §5.7): CI rebuilds every output and fails on any difference from what is
 * committed, so a content change without a rebuild never merges.
 *
 * The build owns OUTPUT_DIRS outright (a file there that the build did not
 * write is stale) and the single files in OUTPUT_FILES.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { OUTPUT_DIRS, OUTPUT_FILES, type Output } from "./outputs.ts";

async function filesUnder(root: string, dir: string): Promise<string[]> {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of await readdir(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await filesUnder(root, rel)));
    else out.push(rel);
  }
  return out.sort();
}

/** Every file the build owns that exists under `root` now. */
export async function existingOutputs(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const dir of OUTPUT_DIRS) found.push(...(await filesUnder(root, dir)));
  for (const file of OUTPUT_FILES) {
    if (existsSync(join(root, file))) found.push(file);
  }
  return found.sort();
}

export interface Drift {
  /** Outputs whose bytes differ from the committed file. */
  changed: string[];
  /** Outputs with no file yet. */
  missing: string[];
  /** Files in the build's directories that the build did not produce. */
  stale: string[];
}

export function driftCount(drift: Drift): number {
  return drift.changed.length + drift.missing.length + drift.stale.length;
}

/** Compares the outputs with the files under `root` (usually the repository). */
export async function compareOutputs(
  root: string,
  outputs: readonly Output[],
): Promise<Drift> {
  const drift: Drift = { changed: [], missing: [], stale: [] };
  const produced = new Set(outputs.map((output) => output.path));
  for (const output of outputs) {
    const abs = join(root, output.path);
    if (!existsSync(abs)) drift.missing.push(output.path);
    else if (readFileSync(abs, "utf8") !== output.content)
      drift.changed.push(output.path);
  }
  for (const path of await existingOutputs(root)) {
    if (!produced.has(path)) drift.stale.push(path);
  }
  return drift;
}

/**
 * Writes the outputs under `root` and removes stale files from the build's
 * own directories. Returns what changed.
 */
export async function writeOutputs(
  root: string,
  outputs: readonly Output[],
): Promise<Drift> {
  const drift = await compareOutputs(root, outputs);
  for (const output of outputs) {
    const abs = join(root, output.path);
    await mkdir(dirname(abs), { recursive: true });
    if (!existsSync(abs) || readFileSync(abs, "utf8") !== output.content) {
      await writeFile(abs, output.content, "utf8");
    }
  }
  for (const path of drift.stale) await rm(join(root, path), { force: true });
  return drift;
}
