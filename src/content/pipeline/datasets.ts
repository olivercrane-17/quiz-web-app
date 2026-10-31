/**
 * `content:datasets`: downloads the pinned datasets of
 * content/datasets/manifest.json into .cache/datasets/<key>/ and verifies
 * every file against its recorded SHA-256 (CONTENT_GUIDE §9.5.1).
 *
 * Sources are raw.githubusercontent.com at a pinned commit, or an npm
 * tarball checked against the registry's sha512 integrity before anything is
 * read from it. Datasets are data: nothing in them is executed, and tarball
 * members are read in memory and written only to the paths the manifest
 * names.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import type { DatasetEntry } from "../schema/datasets.ts";
import { sha256Hex, writeTextFile } from "./json.ts";
import { readTar } from "./tar.ts";

export type Fetcher = (url: string) => Promise<Buffer>;

/** fetch() with retries. Run Node with --use-env-proxy behind a proxy. */
export const httpFetch: Fetcher = async (url) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((done) => setTimeout(done, 500 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

export interface FileResult {
  path: string;
  bytes: number;
  sha256: string;
  status: "downloaded" | "cached" | "mismatch" | "error";
  message?: string;
}

export interface DatasetResult {
  key: string;
  license: string;
  version: string;
  files: FileResult[];
}

/** The local folder of a dataset, refusing any path that escapes it. */
export function datasetPath(
  cacheDir: string,
  key: string,
  path: string,
): string {
  const root = resolve(cacheDir, key);
  const target = resolve(root, path);
  if (!target.startsWith(`${root}${sep}`))
    throw new Error(`${path} escapes the dataset folder`);
  return target;
}

async function cachedOk(target: string, sha256: string): Promise<boolean> {
  if (!existsSync(target)) return false;
  return sha256Hex(await readFile(target)) === sha256;
}

function sriSha512(data: Buffer): string {
  return `sha512-${createHash("sha512").update(data).digest("base64")}`;
}

export interface FetchOptions {
  fetcher?: Fetcher;
  /** Download again even when the cached copy matches. */
  force?: boolean;
}

export async function fetchDataset(
  entry: DatasetEntry,
  cacheDir: string,
  options: FetchOptions = {},
): Promise<DatasetResult> {
  const fetcher = options.fetcher ?? httpFetch;
  const result: DatasetResult = {
    key: entry.key,
    license: entry.license,
    version:
      entry.kind === "github"
        ? entry.commit
        : `${entry.package}@${entry.version}`,
    files: [],
  };
  const record = (file: FileResult) => result.files.push(file);

  if (entry.kind === "github") {
    for (const file of entry.files) {
      const target = datasetPath(cacheDir, entry.key, file.path);
      if (!options.force && (await cachedOk(target, file.sha256))) {
        record({
          path: file.path,
          bytes: file.bytes,
          sha256: file.sha256,
          status: "cached",
        });
        continue;
      }
      if (!file.url.includes(entry.commit)) {
        record({
          path: file.path,
          bytes: 0,
          sha256: "",
          status: "error",
          message: "the URL is not pinned to the manifest's commit",
        });
        continue;
      }
      try {
        const data = await fetcher(file.url);
        const digest = sha256Hex(data);
        if (digest !== file.sha256) {
          record({
            path: file.path,
            bytes: data.length,
            sha256: digest,
            status: "mismatch",
            message: `expected ${file.sha256}`,
          });
          continue;
        }
        await writeTextFile(target, data);
        record({
          path: file.path,
          bytes: data.length,
          sha256: digest,
          status: "downloaded",
        });
      } catch (error) {
        record({
          path: file.path,
          bytes: 0,
          sha256: "",
          status: "error",
          message: (error as Error).message,
        });
      }
    }
    return result;
  }

  const pending: typeof entry.files = [];
  for (const file of entry.files) {
    const target = datasetPath(cacheDir, entry.key, file.path);
    if (!options.force && (await cachedOk(target, file.sha256))) {
      record({
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
        status: "cached",
      });
    } else {
      pending.push(file);
    }
  }
  if (pending.length === 0) return result;
  let members: Map<string, Buffer>;
  try {
    const tarball = await fetcher(entry.tarball);
    const integrity = sriSha512(tarball);
    if (integrity !== entry.integrity)
      throw new Error(
        `tarball integrity ${integrity} does not match the manifest`,
      );
    members = new Map(
      readTar(tarball)
        .filter((m) => m.type === "file")
        .map((m) => [m.name, m.data]),
    );
  } catch (error) {
    for (const file of pending)
      record({
        path: file.path,
        bytes: 0,
        sha256: "",
        status: "error",
        message: (error as Error).message,
      });
    return result;
  }
  for (const file of pending) {
    const data = members.get(file.member);
    if (!data) {
      record({
        path: file.path,
        bytes: 0,
        sha256: "",
        status: "error",
        message: `${file.member} is not in the tarball`,
      });
      continue;
    }
    const digest = sha256Hex(data);
    if (digest !== file.sha256) {
      record({
        path: file.path,
        bytes: data.length,
        sha256: digest,
        status: "mismatch",
        message: `expected ${file.sha256}`,
      });
      continue;
    }
    await writeTextFile(datasetPath(cacheDir, entry.key, file.path), data);
    record({
      path: file.path,
      bytes: data.length,
      sha256: digest,
      status: "downloaded",
    });
  }
  return result;
}

/** Writes a small JSON note next to the files, recording what was fetched. */
export async function writeProvenance(
  cacheDir: string,
  entry: DatasetEntry,
): Promise<void> {
  const note = {
    key: entry.key,
    title: entry.title,
    license: entry.license,
    source:
      entry.kind === "github"
        ? `${entry.repo}@${entry.commit}`
        : `npm:${entry.package}@${entry.version}`,
    retrievedAt: entry.retrievedAt,
    files: entry.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
    })),
  };
  await writeTextFile(
    join(cacheDir, entry.key, "PROVENANCE.json"),
    `${JSON.stringify(note, null, 2)}\n`,
  );
}
