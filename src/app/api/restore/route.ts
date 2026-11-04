/**
 * `GET /api/restore` (ARCHITECTURE §9.3, PRD §3.10.3): hands a device whose
 * storage was wiped its identity back from the backup cookie. It reads the
 * cookie and nothing else: no Supabase call, no secret of ours, no log.
 *
 * - 403 unless the browser says the request is same-origin
 *   (`Sec-Fetch-Site: same-origin`); a missing header counts as cross-site
 *   (AC-CKE-03), so no other site, frame or script tag can read it.
 * - 200 `{ playerId, secret }` when the request carries a well-formed
 *   `__Host-pid` cookie, else 204.
 * - Always `Cache-Control: no-store`.
 *
 * Its first step reads the request's headers, which keeps the handler out
 * of the build's prerender (Cache Components): it answers per request, as
 * every route that reads the request must (§10.2 rule 1).
 */
import {
  isSameOriginFetch,
  readBackupCookie,
} from "@/platform/identity/cookie";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginFetch(request.headers)) {
    return new Response(null, { status: 403, headers: NO_STORE });
  }
  const credential = readBackupCookie(request.headers.get("cookie"));
  if (credential === null) {
    return new Response(null, { status: 204, headers: NO_STORE });
  }
  return Response.json(
    { playerId: credential.playerId, secret: credential.secret },
    { status: 200, headers: NO_STORE },
  );
}
