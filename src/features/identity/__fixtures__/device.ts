/**
 * A test device for the identity feature's component tests: the real
 * client boot over jsdom's storage, with the backup routes stubbed, and the
 * mock backend at zero latency. Test code only.
 */
import { vi } from "vitest";

import { getBackend, resetBackendForTests } from "@/backend";
import type { MockBackend } from "@/backend/mock";
import { hashSecret, type MockPlayerRow } from "@/backend/mock/server/identity";
import type { BrowserContextInfo } from "@/backend";
import type { OfferContext } from "@/features/offers";
import type { TrackedEvent } from "@/features/analytics/track";
import {
  parsePlayerId,
  type ClaimToken,
  type EpochMs,
  type LocalIdentity,
  type PlayerId,
  type SyncCode,
} from "@/engine/types";
import { resetBrowserContextForTests } from "@/platform/browser-context";
import { mintIdentity } from "@/platform/identity/local";

import { bootClient, resetBootForTests } from "../boot";
import { resetRestoreNoticeForTests } from "../restore-notice";

export const BROWSER: BrowserContextInfo = {
  context: "browser",
  app: "none",
  platform: "desktop",
};

export const WHATSAPP: BrowserContextInfo = {
  context: "in_app",
  app: "whatsapp",
  platform: "ios",
};

/** Requests the stubbed backup routes received. */
export interface RouteCall {
  url: string;
  method: string;
  body: unknown;
}

/** Stubs fetch for /api/restore (204: no cookie) and /api/identity (204). */
export function stubBackupRoutes(): RouteCall[] {
  const calls: RouteCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      });
      return Promise.resolve({
        status: 204,
        json: () => Promise.resolve(null),
      });
    }),
  );
  return calls;
}

export function trackLog(): TrackedEvent[] {
  return (
    (window as unknown as { __qzTrackLog?: TrackedEvent[] }).__qzTrackLog ?? []
  );
}

/** The stored identity, secret included (tests only). */
export function storedIdentity(): LocalIdentity | null {
  return JSON.parse(
    localStorage.getItem("qz:identity") ?? "null",
  ) as LocalIdentity | null;
}

/**
 * Boots a fresh device and returns its mock backend; `registered` plays
 * the first write, so the server knows the identity.
 */
export async function bootDevice(
  options: { registered?: boolean } = {},
): Promise<{ backend: MockBackend; calls: RouteCall[] }> {
  const calls = stubBackupRoutes();
  (window as unknown as { __QZ_MOCK_INIT__?: unknown }).__QZ_MOCK_INIT__ = {
    latencyMs: 0,
  };
  await bootClient();
  const backend = (await getBackend()) as MockBackend;
  if (options.registered === true) {
    const registered = await backend.identity.register(BROWSER);
    if (!registered.ok) throw new Error(registered.error.code);
  }
  return { backend, calls };
}

export interface SeedOptions {
  friendlyName?: string;
  nickname?: string | null;
  at?: EpochMs;
  /** A sync code the player made. */
  code?: SyncCode;
  /** A claim link the player made in an in-app browser. */
  claim?: {
    token: ClaimToken;
    expiresAt?: EpochMs;
    redeemedAt?: EpochMs | null;
  };
  /** Finished ranked Dailies, by local date and number. */
  finished?: { date: string; dailyNumber: number }[];
}

/**
 * Puts another player on the mock server, as if made on another device,
 * with what it made there. Codes and tokens are stored as hashes, like the
 * server's.
 */
export async function seedPlayer(
  backend: MockBackend,
  options: SeedOptions = {},
): Promise<PlayerId> {
  const other = mintIdentity(options.at ?? Date.now());
  const playerId = parsePlayerId(other.playerId) as PlayerId;
  const at = options.at ?? Date.now();
  await backend.context.store.write((db) => {
    const players = (db.players ?? {}) as Record<string, MockPlayerRow>;
    players[playerId] = {
      id: playerId,
      createdAt: at,
      isTest: false,
      track: "main",
      friendlyName: options.friendlyName ?? "Plucky Otter",
      nickname: options.nickname ?? null,
      ageBand: null,
      tz: null,
      maxLocalDate: null,
      lastSeenAt: at,
      firstContext: "in_app",
      firstApp: "whatsapp",
    };
    db.players = players;
    const credentials = (db.credentials ?? {}) as Record<string, unknown>;
    credentials[`${playerId}:${hashSecret(other.secret)}`] = {
      playerId,
      secretHash: hashSecret(other.secret),
      source: "mint",
      createdAt: at,
      lastUsedAt: at,
    };
    db.credentials = credentials;
    if (options.code !== undefined) {
      const codes = (db.syncCodes ?? {}) as Record<string, unknown>;
      codes[playerId] = {
        playerId,
        codeHash: hashSecret(options.code),
        createdAt: at,
      };
      db.syncCodes = codes;
    }
    if (options.claim !== undefined) {
      const claims = (db.claims ?? {}) as Record<string, unknown>;
      claims[playerId] = {
        playerId,
        tokenHash: hashSecret(options.claim.token),
        createdAt: at,
        expiresAt: options.claim.expiresAt ?? at + 10 * 60_000,
        redeemedAt: options.claim.redeemedAt ?? null,
      };
      db.claims = claims;
    }
    if (options.finished !== undefined) {
      const attempts = (db.attempts ?? {}) as Record<string, unknown>;
      options.finished.forEach((finish, n) => {
        const id = `seed-${playerId}-${n}`;
        attempts[id] = {
          id,
          playerId,
          kind: "daily",
          ranked: true,
          status: "finished",
          dailyNumber: finish.dailyNumber,
          localDate: finish.date,
          finishedAt: at - (options.finished?.length ?? 0) + n,
        };
      });
      db.attempts = attempts;
    }
  });
  return playerId;
}

/** Another player with a sync code. */
export function seedPlayerWithCode(
  backend: MockBackend,
  code: SyncCode,
  options: Omit<SeedOptions, "code"> = {},
): Promise<PlayerId> {
  return seedPlayer(backend, { ...options, code });
}

/** An offer context for a finish, with the history it carries. */
export function offerContext(
  overrides: Partial<OfferContext> & { earlierFinishes?: number } = {},
): OfferContext {
  const { earlierFinishes = 0, ...rest } = overrides;
  return {
    summary: {
      attemptId: "a1" as OfferContext["summary"]["attemptId"],
      points: 9,
      maxPoints: 12,
      encore: null,
      totalMs: 180_000,
      ranked: true,
      streak: null,
      facts: {
        perfect: false,
        newBestScore: false,
        firstFinish: earlierFinishes === 0,
        milestone: null,
        freezeEarned: false,
        hardestSolvedOnClue1: false,
        bullseye: false,
        earlierFinishes,
      },
    },
    streak: null,
    ageBand: null,
    browser: BROWSER,
    groupCount: null,
    history: {},
    now: Date.UTC(2026, 10, 5, 9) as EpochMs,
    ...rest,
  };
}

/** Undoes everything a device test did to the page. */
export function resetDevice(): void {
  resetBootForTests();
  resetBackendForTests();
  resetBrowserContextForTests();
  resetRestoreNoticeForTests();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  const page = window as unknown as Record<string, unknown>;
  delete page.__qzMock;
  delete page.__qzTrackLog;
  delete page.__QZ_MOCK_INIT__;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}
