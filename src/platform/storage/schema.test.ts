// @vitest-environment node
/**
 * The storage schema is the one list of what the app keeps on the device,
 * and /privacy describes exactly that list (src/features/legal/
 * documents.test.ts). Owners of session keys use sessionStorage directly,
 * past kv, so nothing else would notice a key the schema leaves out:
 * IDN-2's restore note and FIX-PRA's tab run both went unlisted until
 * round 5's integration. So every `qz:` name in the app's source must be a
 * local key or family (STORAGE_KEYS) or a session key (SESSION_KEYS),
 * unless it names no stored value at all.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { SESSION_KEYS, STORAGE_KEYS, keyDefinition } from "./schema";

const SRC = join(process.cwd(), "src");

/**
 * `qz:` names that are no stored value: kv's own prefix, the device
 * namespace prefix (§9.1), and the RPC event src/backend/supabase/rpc.ts
 * dispatches.
 */
const NOT_STORED = new Set(["qz:", "qz:d:", "qz:backend-rpc"]);

/** A `qz:` name in quotes or backticks, as code and doc comments write keys. */
const NAME = /["'`](qz:[a-z0-9:_-]*)["'`]/g;

/** Tests, test helpers and fixtures invent keys and devices on purpose. */
const NOT_APP =
  /(?:\.(?:test|spec|bench)\.tsx?|[/\\]testing\.tsx?)$|[/\\](?:__fixtures__|test)[/\\]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) && !NOT_APP.test(path) ? [path] : [];
  });
}

function covered(name: string): boolean {
  // Under a device namespace a key is still the same key:
  // `qz:d:phone3:identity` is `qz:identity`.
  const key = name.replace(/^qz:d:[a-z0-9-]+:/, "qz:");
  if (NOT_STORED.has(key)) return true;
  if ((SESSION_KEYS as readonly string[]).includes(key)) return true;
  if (keyDefinition(key) !== null) return true;
  return STORAGE_KEYS.some((definition) => definition.key === key);
}

describe("the storage schema (ARCHITECTURE §6.2)", () => {
  it("names every key the app keeps in local or session storage, so /privacy can describe it", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(100);
    const missing: string[] = [];
    for (const file of files) {
      for (const [, name = ""] of readFileSync(file, "utf8").matchAll(NAME)) {
        if (!covered(name)) {
          missing.push(`${relative(process.cwd(), file)}: ${name}`);
        }
      }
    }
    expect(
      missing,
      "add each key to src/platform/storage/schema.ts and a line on /privacy, or to NOT_STORED if it names no stored value",
    ).toEqual([]);
  });

  it("lists IDN-2's restore note and practice's tab run with the session keys", () => {
    expect(SESSION_KEYS).toContain("qz:restore-notice");
    expect(SESSION_KEYS).toContain("qz:practice-run");
    expect(new Set(SESSION_KEYS).size).toBe(SESSION_KEYS.length);
  });
});
