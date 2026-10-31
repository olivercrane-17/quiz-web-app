/**
 * The content master key (ARCHITECTURE §5.4). Read from QZ_CONTENT_KEY
 * (base64) or from ~/.config/quiz-web-app/content.key, never from the repo.
 * The key itself is never printed; only its fingerprint is.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { deriveSealKeys, keyFingerprint, type SealKeys } from "./seal.ts";

export const KEY_ENV = "QZ_CONTENT_KEY";

export function defaultKeyPath(home: string = homedir()): string {
  return join(home, ".config", "quiz-web-app", "content.key");
}

export interface KeySource {
  /** The value of QZ_CONTENT_KEY, if set. */
  envValue: string | undefined;
  keyPath: string;
}

/** Where the scripts look for the key on this machine. */
export function keySourceFromProcess(): KeySource {
  return { envValue: process.env.QZ_CONTENT_KEY, keyPath: defaultKeyPath() };
}

export interface LoadedKey {
  master: Buffer;
  keys: SealKeys;
  source: "env" | "file";
  path: string | null;
  fingerprint: string;
}

/** Decodes a base64 key and insists on exactly 32 bytes. */
export function decodeMasterKey(text: string, label: string): Buffer {
  const trimmed = text.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    throw new Error(`${label} is not base64`);
  }
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length !== 32) {
    throw new Error(`${label} must decode to 32 bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** The key from the environment or the key file, or null when neither exists. */
export async function loadMasterKey(
  source: KeySource,
): Promise<LoadedKey | null> {
  const env = source.envValue?.trim();
  if (env) {
    const master = decodeMasterKey(env, KEY_ENV);
    return {
      master,
      keys: deriveSealKeys(master),
      source: "env",
      path: null,
      fingerprint: keyFingerprint(master),
    };
  }
  if (!existsSync(source.keyPath)) return null;
  const master = decodeMasterKey(
    await readFile(source.keyPath, "utf8"),
    source.keyPath,
  );
  return {
    master,
    keys: deriveSealKeys(master),
    source: "file",
    path: source.keyPath,
    fingerprint: keyFingerprint(master),
  };
}

/**
 * Creates a new random key file (mode 0600 in a 0700 directory). Refuses
 * when the file exists or QZ_CONTENT_KEY is set, so a key is never replaced.
 */
export async function generateKeyFile(
  source: KeySource,
): Promise<{ path: string; fingerprint: string }> {
  if (source.envValue?.trim()) {
    throw new Error(
      `${KEY_ENV} is already set in this environment. Refusing to create a second key.`,
    );
  }
  if (existsSync(source.keyPath)) {
    throw new Error(
      `${source.keyPath} already exists. Refusing to overwrite the content key.`,
    );
  }
  const master = randomBytes(32);
  await mkdir(dirname(source.keyPath), { recursive: true, mode: 0o700 });
  // "wx" fails if the file appeared in the meantime.
  await writeFile(source.keyPath, `${master.toString("base64")}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(source.keyPath, 0o600);
  return { path: source.keyPath, fingerprint: keyFingerprint(master) };
}
