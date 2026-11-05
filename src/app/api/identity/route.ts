/**
 * `POST /api/identity` and `DELETE /api/identity` (ARCHITECTURE §9.3, PRD
 * §3.10.3): set and expire the backup cookie. Nothing else happens here: no
 * Supabase call, no secret of ours, no environment variable but the public
 * site URL, no log.
 *
 * - Both refuse anything but a same-origin request (403): the browser's own
 *   `Sec-Fetch-Site: same-origin`, and an `Origin` naming this site. A
 *   cross-site page can't plant its identity in a player's cookie this way.
 * - POST takes `{ playerId, secret }` as JSON (a v4 UUID and 43 characters
 *   of base64url, at most 1 kB), else 400, and answers 204 with
 *   `__Host-pid=v1.<playerId>.<secret>; Max-Age=34560000; Path=/; Secure;
 *   HttpOnly; SameSite=Lax` (AC-CKE-01).
 * - DELETE answers 204 with the cookie expired ("Delete my data", Under 13).
 * - Every answer is `Cache-Control: no-store`, and none carries a body.
 */
import { getSiteUrl } from "@/lib/env";
import {
  backupCookieHeader,
  expiredBackupCookieHeader,
  hasOwnOrigin,
  isSameOriginFetch,
  readCredentialBody,
} from "@/platform/identity/cookie";

function sameOriginWrite(request: Request): boolean {
  return (
    isSameOriginFetch(request.headers) && hasOwnOrigin(request, getSiteUrl())
  );
}

function answer(status: 204 | 400 | 403, setCookie?: string): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (setCookie !== undefined) headers.set("Set-Cookie", setCookie);
  return new Response(null, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOriginWrite(request)) return answer(403);
  const credential = await readCredentialBody(request);
  if (credential === null) return answer(400);
  return answer(204, backupCookieHeader(credential));
}

export async function DELETE(request: Request): Promise<Response> {
  if (!sameOriginWrite(request)) return answer(403);
  return answer(204, expiredBackupCookieHeader());
}
