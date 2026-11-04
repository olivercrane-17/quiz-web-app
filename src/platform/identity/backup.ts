/**
 * The device's side of the backup cookie (ARCHITECTURE §9.1, §9.3): asking
 * our own `GET /api/restore` for the identity a wiped store lost, posting
 * the identity to `POST /api/identity` once the server knows it, and
 * expiring the cookie with `DELETE /api/identity`. These routes only set
 * and read the cookie; none of them reaches Supabase. When to call them is
 * `lifecycle.ts`'s and `local.ts`'s business.
 *
 * - Every call is a same-origin `fetch` in the default `cors` mode, so the
 *   browser adds `Sec-Fetch-Site: same-origin` and, on POST and DELETE, the
 *   page's `Origin`, which the routes require. (`mode: "same-origin"` would
 *   make a `Referrer-Policy: no-referrer` page send `Origin: null`.)
 * - `credentials: "same-origin"` sends and stores the cookie; `cache:
 *   "no-store"` keeps every answer out of the HTTP cache.
 * - Each call has one deadline for the whole exchange, body included: a
 *   response that stalls after its headers is aborted at the deadline like
 *   one that never answers. The boot waits on the restore while it holds
 *   the `qz-identity` lock and every island, so it must always end.
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

/**
 * What a backup post found:
 * - `saved`: the route stored the cookie (204).
 * - `refused`: the route turned the request away (403), as it does every
 *   time for a browser that sends no `Sec-Fetch-Site`. Asking again soon
 *   would only be refused again.
 * - `failed`: no answer we can trust (offline, a timeout, another status).
 *   Worth trying again on the next load.
 */
export type BackupSaveOutcome = "saved" | "refused" | "failed";

/** The three backup calls, so tests and device namespaces can swap them out. */
export interface BackupTransport {
  restore(): Promise<RestoreOutcome>;
  save(credential: BackupCredential): Promise<BackupSaveOutcome>;
  /** True once the route expired the cookie (204). */
  remove(): Promise<boolean>;
}

/** The slice of `fetch` the transport uses. */
export type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "json">>;

/** How long the boot waits for `/api/restore`, body included, before minting (it holds every island). */
export const RESTORE_TIMEOUT_MS = 4000;
/** How long a backup write may take, answer included. */
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

/**
 * Runs `fetch`, then `read` on its response, under one deadline: a body
 * that stalls after the headers counts against it too. Null for a
 * rejection, a `read` that throws, or the deadline, which also aborts the
 * request.
 */
async function fetchWithin<T>(
  fetcher: FetchLike,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  read: (response: Pick<Response, "status" | "json">) => T | Promise<T>,
): Promise<T | null> {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, timeoutMs);
  });
  const exchange = (async () =>
    read(
      await fetcher(input, {
        ...init,
        ...(controller === null ? {} : { signal: controller.signal }),
      }),
    ))();
  try {
    return await Promise.race([exchange, deadline]);
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

  /** The status `/api/identity` answered, or null without an answer. */
  const write = async (
    method: "POST" | "DELETE",
    body: string | null,
  ): Promise<number | null> => {
    if (fetcher === null || !isOnline()) return null;
    return fetchWithin(
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
      (response) => response.status,
    );
  };

  return {
    async restore() {
      if (fetcher === null || !isOnline()) return { kind: "failed" };
      const outcome = await fetchWithin(
        fetcher,
        RESTORE_ROUTE,
        { method: "GET", credentials: "same-origin", cache: "no-store" },
        restoreTimeoutMs,
        async (response): Promise<RestoreOutcome> => {
          if (response.status === 204) return { kind: "none" };
          if (response.status === 403) return { kind: "refused" };
          if (response.status !== 200) return { kind: "failed" };
          // The body is read inside the deadline: a 200 whose body stalls fails.
          const credential = parseBackupCredential(await response.json());
          return credential === null
            ? { kind: "failed" }
            : { kind: "restored", credential };
        },
      );
      return outcome ?? { kind: "failed" };
    },
    async save(credential) {
      const status = await write(
        "POST",
        JSON.stringify({
          playerId: credential.playerId,
          secret: credential.secret,
        }),
      );
      if (status === 204) return "saved";
      return status === 403 ? "refused" : "failed";
    },
    async remove() {
      return (await write("DELETE", null)) === 204;
    },
  };
}
