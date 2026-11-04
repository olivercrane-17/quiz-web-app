/**
 * The content key and the sealed envelopes (ARCHITECTURE §5.4), in one
 * module. The CLIs in scripts/content/ (keygen, seal, unseal) and the
 * content pipeline (src/content/pipeline/: the seal workspace, the bank's
 * in-memory reads, checker packets) all import it, so the format has exactly
 * one implementation.
 *
 * - File: content/sealed/<folder>/<id>.json.enc holding
 *   { "v": 1, "alg": "A256GCM", "kid": "k1", "iv", "data", "tag" }, the three
 *   binary fields in standard base64. The folders are ARCHITECTURE §2.1's.
 * - Keys: 32-byte keys derived with HKDF-SHA256 from one 32-byte master key
 *   (QZ_CONTENT_KEY, base64, or ~/.config/quiz-web-app/content.key, never the
 *   repository):
 *
 *     salt          = UTF-8 "quiz-web-app/content-seal/v1"
 *     k_enc  info   = UTF-8 "qz-content k1 aes-256-gcm key"
 *     k_iv   info   = UTF-8 "qz-content k1 iv hmac-sha256 key"
 *     k_order info  = UTF-8 "qz-content k1 packet order key"
 *
 *   k_order seeds the option order of checker packets,
 *   HMAC-SHA256(k_order, "<itemId>|<pass>") in src/content/pipeline/packets.ts,
 *   and never encrypts anything. With a public seed anyone could undo the
 *   shuffle and read the key's position off cold.json.
 * - IV: the first 12 bytes of HMAC-SHA256(k_iv, plaintext). Unchanged
 *   plaintext gives an unchanged envelope, so diffs stay clean; an IV repeats
 *   only for identical messages, which GCM tolerates. There is no additional
 *   authenticated data, because the IV covers the plaintext alone, and opening
 *   an envelope checks that its IV belongs to the plaintext it decrypts to.
 *
 * Changing any of these strings changes every envelope, so they never change
 * under kid k1: a new derivation needs a new kid and a full re-seal.
 *
 * The master key is never printed. Only keyFingerprint() is, which is an
 * HMAC of a fixed label under the key and reveals nothing about it.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const HKDF_SALT = "quiz-web-app/content-seal/v1";
export const HKDF_INFO_ENC = "qz-content k1 aes-256-gcm key";
export const HKDF_INFO_IV = "qz-content k1 iv hmac-sha256 key";
export const HKDF_INFO_ORDER = "qz-content k1 packet order key";
export const KEY_ID = "k1";
export const ENVELOPE_VERSION = 1;
export const ENVELOPE_ALG = "A256GCM";
export const ENVELOPE_SUFFIX = ".json.enc";

/**
 * Every folder of content/sealed/ (ARCHITECTURE §2.1, CONTENT_GUIDE §2.2).
 * content:seal and content:unseal move all of them; the content bank reads
 * the kinds it validates (src/content/pipeline/layout.ts). The secret scan
 * (scripts/checks/secret-scan.mjs) keeps its own copy of this list, so it can
 * run before dependencies are installed; a test keeps the two equal.
 */
export const ENVELOPE_FOLDERS = [
  "mysteries",
  "encores",
  "room-packs",
  "schedule",
  "spares",
  "challenge-packs",
  "list-requests",
  "audits",
] as const;
export type EnvelopeFolder = (typeof ENVELOPE_FOLDERS)[number];

export interface Envelope {
  v: 1;
  alg: "A256GCM";
  kid: string;
  iv: string;
  data: string;
  tag: string;
}

export interface SealKeys {
  kid: string;
  enc: Buffer;
  iv: Buffer;
  /** Seeds the option order of checker packets (never used to encrypt). */
  order: Buffer;
}

/** Derives k_enc, k_iv and k_order from the 32-byte master key. */
export function deriveSealKeys(master: Uint8Array): SealKeys {
  if (master.length !== 32) {
    throw new Error(`the content key must be 32 bytes, got ${master.length}`);
  }
  const salt = Buffer.from(HKDF_SALT, "utf8");
  const derive = (info: string) =>
    Buffer.from(
      hkdfSync("sha256", master, salt, Buffer.from(info, "utf8"), 32),
    );
  return {
    kid: KEY_ID,
    enc: derive(HKDF_INFO_ENC),
    iv: derive(HKDF_INFO_IV),
    order: derive(HKDF_INFO_ORDER),
  };
}

/** The deterministic IV: HMAC-SHA256(k_iv, plaintext), first 12 bytes. */
export function deriveIv(keys: SealKeys, plaintext: Uint8Array): Buffer {
  return createHmac("sha256", keys.iv)
    .update(plaintext)
    .digest()
    .subarray(0, 12);
}

export function sealBytes(keys: SealKeys, plaintext: Uint8Array): Envelope {
  const iv = deriveIv(keys, plaintext);
  const cipher = createCipheriv("aes-256-gcm", keys.enc, iv);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALG,
    kid: keys.kid,
    iv: iv.toString("base64"),
    data: data.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** The exact text written to a .json.enc file. */
export function envelopeText(envelope: Envelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Structural check of an envelope, without a key. Returns problems. */
export function envelopeProblems(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["not a JSON object"];
  }
  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  const keys = Object.keys(record).sort().join(",");
  if (keys !== "alg,data,iv,kid,tag,v") {
    problems.push(
      `has keys ${keys}, expected exactly v, alg, kid, iv, data, tag`,
    );
  }
  if (record.v !== ENVELOPE_VERSION) problems.push("v is not 1");
  if (record.alg !== ENVELOPE_ALG) problems.push("alg is not A256GCM");
  if (typeof record.kid !== "string" || !/^k[0-9]+$/.test(record.kid)) {
    problems.push("kid is not k<number>");
  }
  const sizes: [string, number | null][] = [
    ["iv", 12],
    ["tag", 16],
    ["data", null],
  ];
  for (const [field, size] of sizes) {
    const raw = record[field];
    if (typeof raw !== "string" || !BASE64.test(raw) || raw.length % 4 !== 0) {
      problems.push(`${field} is not base64`);
      continue;
    }
    const bytes = Buffer.from(raw, "base64").length;
    if (size !== null && bytes !== size)
      problems.push(`${field} is ${bytes} bytes, expected ${size}`);
    if (size === null && bytes === 0) problems.push("data is empty");
  }
  return problems;
}

export function isEnvelope(value: unknown): value is Envelope {
  return envelopeProblems(value).length === 0;
}

/**
 * Decrypts an envelope. Throws on a wrong key, tampering, or an IV that does
 * not belong to the plaintext.
 */
export function openEnvelope(keys: SealKeys, envelope: Envelope): Buffer {
  if (envelope.kid !== keys.kid) {
    throw new Error(
      `envelope key ${envelope.kid} does not match the loaded key ${keys.kid}`,
    );
  }
  const iv = Buffer.from(envelope.iv, "base64");
  const decipher = createDecipheriv("aes-256-gcm", keys.enc, iv);
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]);
  } catch (error) {
    throw new Error(
      "decryption failed: wrong content key, or the envelope was modified",
      { cause: error },
    );
  }
  if (!timingSafeEqual(deriveIv(keys, plaintext), iv)) {
    throw new Error("the envelope IV does not match its plaintext");
  }
  return plaintext;
}

/** A short, safe-to-print fingerprint of a master key. */
export function keyFingerprint(master: Uint8Array): string {
  return createHmac("sha256", master)
    .update("quiz-web-app content key fingerprint v1")
    .digest("hex")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Envelope files

export interface EnvelopeFile {
  folder: EnvelopeFolder;
  /** The file name without .json.enc, normally the item id. */
  stem: string;
  abs: string;
}

/**
 * Every <folder>/<stem>.json.enc under the envelope directory, folders in
 * ENVELOPE_FOLDERS order and names sorted, so output is stable. Anything else
 * in there is the secret scan's business.
 */
export async function listEnvelopeFiles(
  envelopeDir: string,
): Promise<EnvelopeFile[]> {
  const out: EnvelopeFile[] = [];
  for (const folder of ENVELOPE_FOLDERS) {
    const dir = join(envelopeDir, folder);
    if (!existsSync(dir)) continue;
    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(ENVELOPE_SUFFIX))
      .map((entry) => entry.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      out.push({
        folder,
        stem: name.slice(0, -ENVELOPE_SUFFIX.length),
        abs: join(dir, name),
      });
    }
  }
  return out;
}

/** Reads, checks and decrypts one envelope file. Throws with a short reason. */
export async function openEnvelopeFile(
  keys: SealKeys,
  abs: string,
): Promise<Buffer> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(abs, "utf8"));
  } catch {
    throw new Error("not a valid envelope: not JSON");
  }
  const problems = envelopeProblems(value);
  if (problems.length > 0) {
    throw new Error(`not a valid envelope: ${problems.join("; ")}`);
  }
  return openEnvelope(keys, value as Envelope);
}

export interface EnvelopeCheck {
  /** Envelope files found. */
  total: number;
  /** Envelopes that decrypt with the key. */
  opened: number;
  failures: { abs: string; reason: string }[];
}

/**
 * Decrypts every envelope in memory and counts the results, writing nothing
 * and keeping no plaintext (the recovery check of ARCHITECTURE §5.4).
 */
export async function checkEnvelopes(
  keys: SealKeys,
  envelopeDir: string,
): Promise<EnvelopeCheck> {
  const files = await listEnvelopeFiles(envelopeDir);
  const check: EnvelopeCheck = { total: files.length, opened: 0, failures: [] };
  for (const { abs } of files) {
    try {
      await openEnvelopeFile(keys, abs);
      check.opened += 1;
    } catch (error) {
      check.failures.push({ abs, reason: (error as Error).message });
    }
  }
  return check;
}

/**
 * Whether the key belongs to the envelopes already sealed: true when there
 * are none to judge by, when the key opens at least one, or when none is even
 * structurally valid. A GCM tag cannot be forged by accident, so one opened
 * envelope proves the key; it stops at the first one.
 */
export async function keyMatchesEnvelopes(
  keys: SealKeys,
  envelopeDir: string,
): Promise<{ matches: boolean; checked: number }> {
  let checked = 0;
  for (const { abs } of await listEnvelopeFiles(envelopeDir)) {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(abs, "utf8"));
    } catch {
      continue;
    }
    if (!isEnvelope(value)) continue;
    checked += 1;
    try {
      openEnvelope(keys, value);
      return { matches: true, checked };
    } catch {
      // Keep looking: this one may have been modified.
    }
  }
  return { matches: checked === 0, checked };
}

// ---------------------------------------------------------------------------
// The key file

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

function loaded(
  master: Buffer,
  source: "env" | "file",
  path: string | null,
): LoadedKey {
  return {
    master,
    keys: deriveSealKeys(master),
    source,
    path,
    fingerprint: keyFingerprint(master),
  };
}

/** The key from the environment or the key file, or null when neither exists. */
export async function loadMasterKey(
  source: KeySource,
): Promise<LoadedKey | null> {
  const env = source.envValue?.trim();
  if (env) return loaded(decodeMasterKey(env, KEY_ENV), "env", null);
  if (!existsSync(source.keyPath)) return null;
  const master = decodeMasterKey(
    await readFile(source.keyPath, "utf8"),
    source.keyPath,
  );
  return loaded(master, "file", source.keyPath);
}

/** The one-line hint for a machine without a key. */
export function missingKeyMessage(envelopes: number): string {
  return envelopes > 0
    ? `no content key: set ${KEY_ENV} or restore the key file from the owner's copy (content/sealed/README.md, "Recovering the key")`
    : `no content key: set ${KEY_ENV} or run npm run content:keygen`;
}

/** Throws unless a key file may be written: never beside QZ_CONTENT_KEY, never over a file. */
export function assertKeyFileFree(source: KeySource, action: string): void {
  if (source.envValue?.trim()) {
    throw new Error(
      `${KEY_ENV} is already set in this environment. Refusing to ${action}.`,
    );
  }
  if (existsSync(source.keyPath)) {
    throw new Error(
      `${source.keyPath} already exists. Refusing to overwrite the content key.`,
    );
  }
}

/** Writes the key as base64 (mode 0600 in a 0700 directory), never over a file. */
async function writeKeyFile(path: string, master: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // "wx" fails if the file appeared in the meantime.
  await writeFile(path, `${master.toString("base64")}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  // The mode above is filtered by the umask; set it exactly.
  await chmod(path, 0o600);
}

/**
 * Creates a new random key file. Refuses when the file exists or
 * QZ_CONTENT_KEY is set, so a key is never replaced. (content:keygen also
 * refuses while envelopes exist, since a new key could never open them.)
 */
export async function generateKeyFile(
  source: KeySource,
): Promise<{ path: string; fingerprint: string }> {
  assertKeyFileFree(source, "create a second key");
  const master = randomBytes(32);
  await writeKeyFile(source.keyPath, master);
  return { path: source.keyPath, fingerprint: keyFingerprint(master) };
}

/**
 * Writes a recovered key to the key file (ARCHITECTURE §5.4 recovery), with
 * the same guards as generateKeyFile. Checking that it is the right key is
 * the caller's job: content:keygen -- --restore tries it on the envelopes
 * first.
 */
export async function restoreKeyFile(
  source: KeySource,
  master: Buffer,
): Promise<{ path: string; fingerprint: string }> {
  if (master.length !== 32) {
    throw new Error(`the content key must be 32 bytes, got ${master.length}`);
  }
  assertKeyFileFree(source, "restore a key file it would not use");
  await writeKeyFile(source.keyPath, master);
  return { path: source.keyPath, fingerprint: keyFingerprint(master) };
}
