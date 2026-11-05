/**
 * PWA-0's throwaway service worker (ARCHITECTURE §10.7, §12.3). It proves
 * the chain `next build`, `serwist build`, `next start`, and that a
 * precached practice shell plays offline. PWA-1 writes the real one in
 * src/pwa/sw.ts; once that one is in public/sw.js, the spike's spec skips
 * itself and this directory can go.
 *
 * `serwist build` (scripts/pwa/spike/serwist.config.mts) bundles this file
 * with esbuild and replaces `self.__SW_MANIFEST` with the practice shell's
 * precache list. The worker follows the runtime rules of §10.7 that the
 * spike needs:
 *
 * 1. It never touches `/api/*` or another origin: those requests go to the
 *    network as if no worker were installed.
 * 2. Precached files are served cache first, through Serwist's precache
 *    route. Nothing else is cached at runtime, so a file the precache list
 *    missed fails offline instead of being hidden by a runtime cache.
 * 3. Navigations go to the network first, for up to 3 s, then fall back to
 *    the precached shell for that path. They are handled here, ahead of
 *    Serwist's router, because its precache route answers every precached
 *    URL cache first, navigations included, and it is registered before any
 *    other route.
 *
 * For PWA-1: rule 3 here looks the shell up by the navigation's own path,
 * which is enough for the two practice shells the spike precaches, because
 * each is served at its own path. It is not enough for §10.7, which also
 * precaches one shell per rewritten pattern (§10.1): `/c/AB12CD34` is served
 * by `/shell/challenge`, so a lookup by path misses it offline. PWA-1's
 * fallback must map each rewrite source onto its `/shell/<name>` entry
 * first. The table is SHELL_ROUTES in src/features/shell/shell-routes.ts,
 * which src/pwa may not import (§2.2); where the worker gets it from is an
 * open decision for the architecture owner (see PWA-0's pull request).
 *
 * A new worker installs and waits; Serwist activates it when a page posts
 * `{ type: "SKIP_WAITING" }`, which PWA-1's `useSafePoint()` will send.
 */
import {
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type RequestRule,
} from "serwist";

/*
 * The worker scope, as far as this file uses it. tsconfig.json loads the
 * DOM lib only, and adding lib.webworker (or a triple-slash reference to
 * it) would put worker globals such as `clients` and `importScripts` in
 * scope for every app file, so the few types needed here are declared
 * locally. Serwist's own declarations name the webworker types, which
 * `skipLibCheck` lets through.
 */
interface WorkerExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerInstallEvent extends WorkerExtendableEvent {
  /** The Static Routing API, where the browser has it. */
  addRoutes?(rules: RequestRule | RequestRule[]): Promise<void>;
}

interface WorkerFetchEvent extends WorkerExtendableEvent {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface SpikeWorkerScope {
  /** The precache list, injected by `serwist build`. */
  readonly __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  readonly location: { readonly origin: string };
  addEventListener(
    type: "install",
    listener: (event: WorkerInstallEvent) => void,
  ): void;
  addEventListener(
    type: "activate",
    listener: (event: WorkerExtendableEvent) => void,
  ): void;
  addEventListener(
    type: "fetch",
    listener: (event: WorkerFetchEvent) => void,
  ): void;
}

declare const self: SpikeWorkerScope;

/** How long a navigation waits for the network before the shell answers (§10.7 rule 5). */
const NAVIGATION_TIMEOUT_SECONDS = 3;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Wait for SKIP_WAITING: an update never interrupts a question (AC-PWA-04).
  skipWaiting: false,
  clientsClaim: false,
});

const navigations = new NetworkOnly({
  networkTimeoutSeconds: NAVIGATION_TIMEOUT_SECONDS,
  plugins: [
    {
      // The spike precaches the practice shells only, and each one is
      // served at its own path. A rewritten per-user path is not: /c/:code
      // is served by /shell/challenge (§10.1), so PWA-1 maps the path onto
      // its shell before this lookup (see the note at the top).
      handlerDidError: ({ request }) =>
        serwist.matchPrecache(new URL(request.url).pathname),
    },
  ],
});

/** Rule 1: `/api/*` and other origins (Supabase RPCs and Realtime) are never the worker's. */
function isOurs(url: URL): boolean {
  return (
    url.origin === self.location.origin && !url.pathname.startsWith("/api/")
  );
}

self.addEventListener("install", (event) => {
  void serwist.handleInstall(event);
});

self.addEventListener("activate", (event) => {
  void serwist.handleActivate(event);
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isOurs(new URL(request.url))) return;
  if (request.mode === "navigate") {
    event.respondWith(navigations.handle({ event, request }));
    return;
  }
  // Only the precache route matches; anything else passes to the network.
  serwist.handleFetch(event);
});
