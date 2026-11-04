/**
 * The backup cookie's formats (ARCHITECTURE §9.3, D9; PRD §3.10.3), shared
 * by the route handlers that set and read it (`/api/identity`,
 * `/api/restore`) and by the client that posts and restores it. Pure
 * functions over strings and `Headers`: no storage, no network, no clock.
 *
 * - The cookie: `__Host-pid=v1.<playerId>.<secret>` with `Path=/`,
 *   `Max-Age=34560000` (400 days, AC-CKE-01), `Secure`, `HttpOnly` and
 *   `SameSite=Lax`. The `__Host-` prefix makes the browser refuse it unless
 *   it is Secure, host-only and on `/`, so no subdomain or sibling path can
 *   plant or shadow it. It is the only cookie the app ever sets (AC-CKE-04).
 * - The body `POST /api/identity` takes and `GET /api/restore` answers:
 *   `{ playerId, secret }`, a v4 UUID and 32 bytes of unpadded base64url.
 * - The same-origin rules (§9.3): a request counts only when the browser
 *   itself says so in `Sec-Fetch-Site: same-origin`, a header page scripts
 *   cannot set; a missing header counts as cross-site (AC-CKE-03). Writes
 *   also need an `Origin` naming this site.
 *
 * A secret travels only from the device to our own origin and back to the
 * same device. Nothing here logs, and no error message carries a value.
 */
import {
  parsePlayerId,
  parseSecret,
  type PlayerId,
  type Secret,
} from "@/engine/types";

/** The backup cookie's name (§9.3). */
export const BACKUP_COOKIE_NAME = "__Host-pid";
/** The value's format version: `v1.<playerId>.<secret>`. */
export const BACKUP_COOKIE_VERSION = "v1";
/** 400 days, the longest lifetime browsers honor (AC-CKE-01). */
export const BACKUP_COOKIE_MAX_AGE_S = 34_560_000;
/** A registered identity re-posts its cookie at most this often, keeping the Max-Age rolling (§9.1 step 3). */
export const BACKUP_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** Where the client posts and deletes the backup (§9.3). */
export const IDENTITY_ROUTE = "/api/identity";
/** Where the client asks for the backup back (§9.3). */
export const RESTORE_ROUTE = "/api/restore";

/**
 * The largest body `POST /api/identity` reads. A valid one is about 100
 * bytes; anything near this is not ours.
 */
export const IDENTITY_BODY_MAX_BYTES = 1024;

/** What the cookie holds, and what the routes take and answer. */
export interface BackupCredential {
  playerId: PlayerId;
  secret: Secret;
}

/**
 * A `{ playerId, secret }` object with both in their formats, or null.
 * Other fields are ignored; the id comes back lower-cased, as the device
 * stores it.
 */
export function parseBackupCredential(raw: unknown): BackupCredential | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const playerId = parsePlayerId(record.playerId);
  const secret = parseSecret(record.secret);
  return playerId === null || secret === null ? null : { playerId, secret };
}

/** The cookie's value: `v1.<playerId>.<secret>` (neither part can hold a dot). */
export function encodeBackupCookieValue(credential: BackupCredential): string {
  return `${BACKUP_COOKIE_VERSION}.${credential.playerId}.${credential.secret}`;
}

/** The credential in a cookie value, or null for any other version or shape. */
export function decodeBackupCookieValue(
  value: string,
): BackupCredential | null {
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== BACKUP_COOKIE_VERSION) return null;
  const playerId = parsePlayerId(parts[1]);
  const secret = parseSecret(parts[2]);
  return playerId === null || secret === null || playerId !== parts[1]
    ? null
    : { playerId, secret };
}

/** The attributes every Set-Cookie of ours carries (a `__Host-` cookie needs Secure and Path=/, and no Domain). */
const ATTRIBUTES = "Path=/; Secure; HttpOnly; SameSite=Lax";

/** The `Set-Cookie` header that stores the backup (AC-CKE-01). */
export function backupCookieHeader(credential: BackupCredential): string {
  return `${BACKUP_COOKIE_NAME}=${encodeBackupCookieValue(credential)}; Max-Age=${BACKUP_COOKIE_MAX_AGE_S}; ${ATTRIBUTES}`;
}

/** The `Set-Cookie` header that expires the backup (`DELETE /api/identity`, PRD §3.10.3). */
export function expiredBackupCookieHeader(): string {
  return `${BACKUP_COOKIE_NAME}=; Max-Age=0; ${ATTRIBUTES}`;
}

/**
 * The backup credential in a request's `Cookie` header, or null. The first
 * well-formed `__Host-pid` wins; other cookies are ignored.
 */
export function readBackupCookie(
  cookieHeader: string | null,
): BackupCredential | null {
  if (cookieHeader === null) return null;
  for (const pair of cookieHeader.split(";")) {
    const at = pair.indexOf("=");
    if (at === -1 || pair.slice(0, at).trim() !== BACKUP_COOKIE_NAME) {
      continue;
    }
    const credential = decodeBackupCookieValue(pair.slice(at + 1).trim());
    if (credential !== null) return credential;
  }
  return null;
}

/**
 * True only when the browser says the request comes from our own origin
 * (`Sec-Fetch-Site: same-origin`). `cross-site`, `same-site`, `none` and a
 * missing header all count as cross-site (§9.3, AC-CKE-03): a browser
 * old enough to send none gets no backup, and keeps its identity in
 * storage as before.
 */
export function isSameOriginFetch(headers: Headers): boolean {
  return headers.get("sec-fetch-site") === "same-origin";
}

/** The first value of a comma-separated header such as `X-Forwarded-Host`. */
function firstValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "" ? null : first;
}

/** The scheme the request arrived on: `X-Forwarded-Proto` behind a proxy, else the request URL's. */
function requestScheme(request: Pick<Request, "headers" | "url">): string {
  const forwarded = firstValue(request.headers.get("x-forwarded-proto"));
  if (forwarded !== null) return `${forwarded}:`;
  try {
    return new URL(request.url).protocol;
  } catch {
    return "";
  }
}

/**
 * True when the request's `Origin` is this site's origin (§9.3): the scheme
 * and host the request was sent to (`Host`, or the `X-Forwarded-Host` a
 * proxy adds, with `X-Forwarded-Proto`), or the configured site URL. A
 * missing, opaque (`null`) or malformed Origin fails. This backs up
 * `isSameOriginFetch`, which already shuts out every cross-site page, for
 * writes in particular.
 */
export function hasOwnOrigin(
  request: Pick<Request, "headers" | "url">,
  siteUrl: string | null,
): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.origin !== origin.toLowerCase()
  ) {
    return false;
  }
  const hosts = [
    firstValue(request.headers.get("host")),
    firstValue(request.headers.get("x-forwarded-host")),
  ];
  if (
    parsed.protocol === requestScheme(request) &&
    hosts.includes(parsed.host)
  ) {
    return true;
  }
  if (siteUrl === null) return false;
  try {
    return new URL(siteUrl).origin === parsed.origin;
  } catch {
    return false;
  }
}

/**
 * Reads a request body as text, up to `maxBytes`, or null when it is
 * longer (the stream is cancelled there) or unreadable.
 */
export async function readCappedText(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The credential in a `POST /api/identity` body: JSON (`application/json`),
 * at most IDENTITY_BODY_MAX_BYTES, holding a well-formed `{ playerId,
 * secret }`. Null for anything else (400).
 */
export async function readCredentialBody(
  request: Request,
): Promise<BackupCredential | null> {
  const type = request.headers.get("content-type") ?? "";
  if (type.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return null;
  }
  const text = await readCappedText(request, IDENTITY_BODY_MAX_BYTES);
  if (text === null) return null;
  try {
    return parseBackupCredential(JSON.parse(text));
  } catch {
    return null;
  }
}
