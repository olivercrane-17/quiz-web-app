/**
 * Reading and writing content JSON.
 *
 * Every file the tools write goes through Prettier with the repository's
 * settings, so `npm run format:check` stays green and a rewritten item
 * differs from its last version only where something changed.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface JsonFile {
  raw: string;
  data: unknown;
}

/** Reads a UTF-8 JSON file. Throws with the path in the message. */
export async function readJsonFile(path: string): Promise<JsonFile> {
  const raw = await readFile(path, "utf8");
  return { raw, data: parseJsonText(raw, path) };
}

export function parseJsonText(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw.replace(/^﻿/, "")) as unknown;
  } catch (error) {
    throw new Error(`${label}: invalid JSON (${(error as Error).message})`, {
      cause: error,
    });
  }
}

type Formatter = (source: string) => Promise<string>;
let formatterPromise: Promise<Formatter> | undefined;

/** Prettier's JSON formatting with the repo's options, loaded once. */
function getFormatter(): Promise<Formatter> {
  formatterPromise ??= (async () => {
    try {
      const prettier = await import("prettier");
      return (source: string) =>
        prettier.format(source, {
          parser: "json",
          tabWidth: 2,
          useTabs: false,
          endOfLine: "lf",
        });
    } catch {
      // Prettier is a devDependency; without it, plain two-space JSON.
      return (source: string) => Promise.resolve(source);
    }
  })();
  return formatterPromise;
}

/** The canonical text of a JSON value: two-space indent, Prettier layout. */
export async function formatJson(value: unknown): Promise<string> {
  const format = await getFormatter();
  const formatted = await format(`${JSON.stringify(value, null, 2)}\n`);
  return formatted.endsWith("\n") ? formatted : `${formatted}\n`;
}

/** Writes JSON atomically (temp file, then rename). */
export async function writeJsonFile(
  path: string,
  value: unknown,
): Promise<void> {
  await writeTextFile(path, await formatJson(value));
}

export async function writeTextFile(
  path: string,
  content: string | Buffer,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, content);
  await rename(temp, path);
}

/** JSON with sorted object keys, for hashing. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** A deep copy of plain JSON data. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
