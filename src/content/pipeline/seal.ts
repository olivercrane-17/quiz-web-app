/**
 * Sealed content envelopes, exactly as ARCHITECTURE §5.4 defines them.
 *
 * - File: content/sealed/<folder>/<id>.json.enc holding
 *   { "v": 1, "alg": "A256GCM", "kid": "k1", "iv", "data", "tag" }, all three
 *   binary fields in standard base64.
 * - Keys: 32-byte keys derived with HKDF-SHA256 from one 32-byte master
 *   key (QZ_CONTENT_KEY, base64, or ~/.config/quiz-web-app/content.key):
 *
 *     salt          = UTF-8 "quiz-web-app/content-seal/v1"
 *     k_enc  info   = UTF-8 "qz-content k1 aes-256-gcm key"
 *     k_iv   info   = UTF-8 "qz-content k1 iv hmac-sha256 key"
 *     k_order info  = UTF-8 "qz-content k1 packet order key"
 *
 *   k_order seeds the option order of checker packets:
 *   HMAC-SHA256(k_order, "<itemId>|<pass>") (packets.ts). With a public
 *   seed anyone could undo the shuffle and read the key's position off
 *   cold.json.
 *
 * - IV: the first 12 bytes of HMAC-SHA256(k_iv, plaintext). Unchanged
 *   plaintext gives unchanged ciphertext, so diffs stay clean; an IV repeats
 *   only for identical messages, which GCM tolerates. No additional
 *   authenticated data, because the IV covers the plaintext alone. The item
 *   id inside the plaintext is checked against the file name after
 *   decryption instead.
 *
 * Changing any of these strings changes every envelope: bump `kid` and
 * re-seal if that is ever needed.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  timingSafeEqual,
} from "node:crypto";

export const HKDF_SALT = "quiz-web-app/content-seal/v1";
export const HKDF_INFO_ENC = "qz-content k1 aes-256-gcm key";
export const HKDF_INFO_IV = "qz-content k1 iv hmac-sha256 key";
export const HKDF_INFO_ORDER = "qz-content k1 packet order key";
export const KEY_ID = "k1";
export const ENVELOPE_VERSION = 1;
export const ENVELOPE_ALG = "A256GCM";

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
      {
        cause: error,
      },
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
