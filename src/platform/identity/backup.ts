/**
 * The device's side of the backup cookie (ARCHITECTURE §9.1, §9.3): asking
 * our own `GET /api/restore` for the identity a wiped store lost, posting
 * the identity to `POST /api/identity` once the server knows it, and
 * expiring the cookie with `DELETE /api/identity`. These routes only set
 * and read the cookie; none of them reaches Supabase.
 *
 * - Every call is a same-origin `fetch` in the default `cors` mode, so the
 *   browser adds `Sec-Fetch-Site: same-origin` and, on POST and DELETE, the
 *   page's `Origin`, which the routes require. (`mode: "same-origin"` would
 *   make a `Referrer-Policy: no-referrer` page send `Origin: null`.)
 * - `credentials: "same-origin"` sends and stores the cookie; `cache:
 *   "no-store"` keeps every answer out of the HTTP cache.
 * - Nothing here throws or logs: a failure comes back as an outcome, and no
 *   message ever carries the secret.
 */
import {
  IDENTITY_ROUTE,
  RESTORE_ROUTE,
  parseBackupCredential,
  type BackupCredential,
} from "./cookie";

/**
 * What a restore found:
 * - `restored`: the cookie held an identity (200).
 * - `none`: no cookie (204). The device mints, and that answer is final.
 * - `refused`: the route turned the request away as cross-site (403), which
 *   is what a browser that sends no `Sec-Fetch-Site` gets. Final too.
 * - `failed`: no answer we can trust (offline, a timeout, a server error,
 *   a body that isn't an identity). The question stays open.
 */
export type RestoreOutcome =
  | { kind: "restored"; credential: BackupCredential }
  | { kind: "none" }
  | { kind: "refused" }
  | { kind: "failed" };

/** The three backup calls, so tests and device namespaces can swap them out. */
export interface BackupTransport {
  restore(): Promise<RestoreOutcome>;
  /** True once the route stored the cookie (204). */
  save(credential: BackupCredential): Promise<boolean>;
  /** True once the route expired the cookie (204). */
  remove(): Promise<boolean>;
}

/** The slice of `fetch` the transport uses. */
export type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "json">>;

/** How long the boot waits for `/api/restore` before minting (it holds every island). */
export const RESTORE_TIMEOUT_MS = 4000;
/** How long a backup write may take. */
export const SAVE_TIMEOUT_MS = 8000;

export interface HttpBackupOptions {
  fetch?: FetchLike;
  /** False skips the restore at once: it could only fail. */
  isOnline?: () => boolean;
  restoreTimeoutMs?: number;
  saveTimeoutMs?: number;
}

function browserFetch(): FetchLike | null {
  try {
    return typeof globalThis.fetch === "function"
      ? (input, init) => globalThis.fetch(input, init)
      : null;
  } catch {
    return null;
  }
}

function browserOnline(): boolean {
  try {
    return globalThis.navigator?.onLine !== false;
  } catch {
    return true;
  }
}

/** Runs `fetch` with a deadline; null for a rejection or a timeout. */
async function fetchWithin(
  fetcher: FetchLike,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Pick<Response, "status" | "json"> | null> {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetcher(input, {
        ...init,
        ...(controller === null ? {} : { signal: controller.signal }),
      }),
      deadline,
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The backup routes over HTTP, on the page's own origin. */
export function createHttpBackup(
  options: HttpBackupOptions = {},
): BackupTransport {
  const fetcher = options.fetch ?? browserFetch();
  const isOnline = options.isOnline ?? browserOnline;
  const restoreTimeoutMs = options.restoreTimeoutMs ?? RESTORE_TIMEOUT_MS;
  const saveTimeoutMs = options.saveTimeoutMs ?? SAVE_TIMEOUT_MS;

  const write = async (
    method: "POST" | "DELETE",
    body: string | null,
  ): Promise<boolean> => {
    if (fetcher === null || !isOnline()) return false;
    const response = await fetchWithin(
      fetcher,
      IDENTITY_ROUTE,
      {
        method,
        credentials: "same-origin",
        cache: "no-store",
        ...(body === null
          ? {}
          : { headers: { "Content-Type": "application/json" }, body }),
      },
      saveTimeoutMs,
    );
    return response?.status === 204;
  };

  return {
    async restore() {
      if (fetcher === null || !isOnline()) return { kind: "failed" };
      const response = await fetchWithin(
        fetcher,
        RESTORE_ROUTE,
        { method: "GET", credentials: "same-origin", cache: "no-store" },
        restoreTimeoutMs,
      );
      if (response === null) return { kind: "failed" };
      if (response.status === 204) return { kind: "none" };
      if (response.status === 403) return { kind: "refused" };
      if (response.status !== 200) return { kind: "failed" };
      try {
        const credential = parseBackupCredential(await response.json());
        return credential === null
          ? { kind: "failed" }
          : { kind: "restored", credential };
      } catch {
        return { kind: "failed" };
      }
    },
    save(credential) {
      return write(
        "POST",
        JSON.stringify({
          playerId: credential.playerId,
          secret: credential.secret,
        }),
      );
    },
    remove() {
      return write("DELETE", null);
    },
  };
}
