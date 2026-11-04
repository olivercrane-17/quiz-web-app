/**
 * The backend contract harness (ARCHITECTURE §7.5, §11.1, §11.7).
 *
 * A contract is one behavioral suite per GameBackend area, written once
 * against the interface and run against both implementations:
 *
 *   // src/backend/contract/identity.contract.ts (SQL-2)
 *   export const identityContract = defineContract("identity", (test) => {
 *     test("register", "AC-IDN-02 a first write registers the identity", async ({ backend }) => {
 *       ...
 *     });
 *   });
 *   // identity.mock.test.ts: runContract(identityContract, "mock");
 *   // identity.real.test.ts: runContract(identityContract, "real");
 *
 * - The mock run (every `npm test`) builds the mock backend in memory and
 *   skips each test whose method the mock area does not list in its
 *   MOCK_CAPABILITIES, so a SQL ticket can land its suite before the
 *   feature ticket that builds the mock behavior.
 * - The real run (`*.real.test.ts`, the `contract-real` project) skips
 *   itself unless QZ_REAL_BACKEND=1, which only the backend-contract
 *   workflow sets: the sandbox cannot reach Supabase. It builds the Supabase
 *   backend in Node, over the built-in public URL and publishable key.
 * - Each test gets a fresh test identity: an `e2e2e2e2-` player id and a
 *   random secret, so real writes land on the e2e track, stay out of every
 *   statistic and are deleted after a day (§8.17).
 *
 * Test infrastructure only: no app code imports this module.
 */
import { describe, it } from "vitest";

import {
  TEST_PLAYER_PREFIX,
  parsePlayerId,
  parseSecret,
  type LocalIdentity,
} from "@/engine/types";
import { getSupabaseConfig, type SupabaseConfig } from "@/lib/env";
import type { IdentityProvider } from "@/platform/identity/provider";
import { createServerClock } from "@/platform/server-clock";

import type { AREA_METHODS } from "../areas";
import { createMockBackend } from "../mock";
import { MOCK_CAPABILITIES as analytics } from "../mock/server/analytics";
import { MOCK_CAPABILITIES as challenges } from "../mock/server/challenges";
import { MOCK_CAPABILITIES as daily } from "../mock/server/daily";
import { MOCK_CAPABILITIES as groups } from "../mock/server/groups";
import { MOCK_CAPABILITIES as health } from "../mock/server/health";
import { MOCK_CAPABILITIES as identity } from "../mock/server/identity";
import { MOCK_CAPABILITIES as practice } from "../mock/server/practice";
import { MOCK_CAPABILITIES as quizzes } from "../mock/server/quizzes";
import { MOCK_CAPABILITIES as reports } from "../mock/server/reports";
import { MOCK_CAPABILITIES as rooms } from "../mock/server/rooms";
import { MOCK_CAPABILITIES as sealed } from "../mock/server/sealed";
import { MOCK_CAPABILITIES as stats } from "../mock/server/stats";
import { MOCK_CAPABILITIES as streaks } from "../mock/server/streaks";
import { createMemoryStore } from "../mock/store";
import { createSupabaseBackend } from "../supabase";
import type { BackendArea, GameBackend } from "../types";

export type ContractTarget = "mock" | "real";

/** True only in the backend-contract workflow (QZ_REAL_BACKEND=1). */
export const REAL_BACKEND = process.env.QZ_REAL_BACKEND === "1";

/** Per-test timeout against the real project, as vitest.config.mts sets for that project. */
export const REAL_TIMEOUT_MS = 30_000;

/** The methods each mock area really implements (§7.5). */
export const MOCK_CAPABILITY_MAP: {
  readonly [A in BackendArea]: readonly string[];
} = {
  identity,
  sealed,
  daily,
  streaks,
  stats,
  challenges,
  groups,
  rooms,
  quizzes,
  reports,
  practice,
  analytics,
  health,
};

export type AreaMethod<A extends BackendArea> =
  (typeof AREA_METHODS)[A][number];

/** The tab's identity for one contract test, with what the backend did to it. */
export interface TestIdentity extends IdentityProvider {
  /** How often the backend called markRegistered(). */
  readonly registrations: number;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/**
 * A fresh test identity: a v4 player id with the reserved test prefix and a
 * 32-byte base64url secret, unregistered until the backend says otherwise.
 */
export function createTestIdentity(
  random: (bytes: number) => Uint8Array = (bytes) =>
    crypto.getRandomValues(new Uint8Array(bytes)),
): TestIdentity {
  const idBytes = random(16);
  const hex = toHex(idBytes);
  const variant = "89ab"[(idBytes[8] ?? 0) & 3];
  const playerId = parsePlayerId(
    `${TEST_PLAYER_PREFIX}${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
  );
  const secret = parseSecret(toBase64Url(random(32)));
  if (playerId === null || secret === null) {
    throw new Error(
      "createTestIdentity: the random source gave a malformed identity",
    );
  }
  let current: LocalIdentity = {
    v: 1,
    playerId,
    secret,
    registered: false,
    createdAt: Date.now(),
    source: "minted",
    cookieSavedAt: null,
  };
  let registrations = 0;
  return {
    current: () => current,
    markRegistered() {
      registrations += 1;
      current = { ...current, registered: true };
    },
    replace(next) {
      current = next;
    },
    get registrations() {
      return registrations;
    },
  };
}

export interface ContractEnv {
  readonly target: ContractTarget;
  readonly backend: GameBackend;
  readonly identity: TestIdentity;
}

/** A backend of the target kind, with a fresh test identity and server clock. */
export function createContractEnv(target: ContractTarget): ContractEnv {
  const testIdentity = createTestIdentity();
  const deps = {
    identity: () => testIdentity,
    serverClock: createServerClock(),
  };
  const backend =
    target === "mock"
      ? createMockBackend(deps, {
          store: createMemoryStore(),
          init: { latencyMs: 0 },
          attachControls: false,
        })
      : createSupabaseBackend(deps);
  return { target, backend, identity: testIdentity };
}

export type ContractTest<A extends BackendArea> = (
  method: AreaMethod<A>,
  title: string,
  body: (env: ContractEnv) => Promise<void>,
) => void;

export interface ContractSuite<A extends BackendArea = BackendArea> {
  readonly area: A;
  readonly define: (test: ContractTest<A>) => void;
}

/** One behavioral suite for an area. Each test names the method it exercises. */
export function defineContract<A extends BackendArea>(
  area: A,
  define: (test: ContractTest<A>) => void,
): ContractSuite<A> {
  return { area, define };
}

/** Registers the suite's tests against one target. */
export function runContract<A extends BackendArea>(
  suite: ContractSuite<A>,
  target: ContractTarget,
): void {
  const implemented =
    target === "mock" ? new Set<string>(MOCK_CAPABILITY_MAP[suite.area]) : null;
  describe.skipIf(target === "real" && !REAL_BACKEND)(
    `${suite.area} contract (${target})`,
    () => {
      suite.define((method, title, body) => {
        const register =
          implemented === null || implemented.has(method) ? it : it.skip;
        register(
          title,
          async () => {
            await body(createContractEnv(target));
          },
          target === "real" ? REAL_TIMEOUT_MS : undefined,
        );
      });
    },
  );
}

/** The real project's public URL and publishable key, for HTTP-level checks. */
export function realProject(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (config === null) {
    throw new Error(
      "The contract-real project needs NEXT_PUBLIC_BACKEND_MODE=supabase (vitest.config.mts sets it).",
    );
  }
  return config;
}
