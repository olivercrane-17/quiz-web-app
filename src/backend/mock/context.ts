/**
 * What every mock area is built with (ARCHITECTURE §7.4): the store, the
 * page clock (so Playwright's page.clock moves the server too), a seeded
 * RNG (so ids and codes repeat run to run), the transport state behind the
 * controls, the identity of the calling device, the sealed fixture content,
 * the round plugins the judge halves come from, and the room hints
 * (realtime.ts).
 *
 * Tests build a context with the echo plugins (`createEchoRegistry()`), a
 * memory store and their own content, so the sealed protocol can be
 * exercised before PRA-1 and MYS-1 build the real plugins.
 */
import { SHARED } from "@/config/shared";
import type { Clock } from "@/engine/clock";
import { createRng, type Rng } from "@/engine/rng";
import { PLUGINS, type PluginRegistry } from "@/engine/rounds";
import type { RoomHint } from "@/engine/types";
import type { IdentityProvider } from "@/platform/identity/provider";

import {
  createMockControls,
  createTransportState,
  type MockControls,
  type MockTransportState,
} from "./controls";
import { fixtureContent, type MockContent } from "./fixtures";
import { createMockRealtime, type MockRealtime } from "./realtime";
import type { MockStore } from "./store";

/** Rules the mock reads from shared config, overridable in tests. */
export interface MockRules {
  /** Options replace typing from this clue (`options_from_clue`, PRD Q3). */
  optionsFromClue: 3 | 4;
  /** Accepted state-changing actions per attempt (§8.4 round_action). */
  actionsPerAttempt: number;
}

export interface MockContext {
  store: MockStore;
  clock: Clock;
  /** The seed's stream. Areas fork it by a label; they never draw from it directly. */
  rng: Rng;
  /** window.__qzMock: what tests use to steer the mock. */
  controls: MockControls;
  /** The state behind the controls: latency, reachability, realtime, shed, failures. */
  transport: MockTransportState;
  /** The calling device's identity (§7.1); throws before the identity boot. */
  identity(): IdentityProvider;
  /** Sends a room hint on a topic (`room:<id>`, `roomhost:<id>`). */
  emitHint(topic: string, hint: RoomHint): void;
  realtime: MockRealtime;
  /** The sealed content the judges read. */
  content: MockContent;
  /** The round plugins; the mock runs their judge halves. */
  plugins: PluginRegistry;
  rules: MockRules;
}

export const DEFAULT_MOCK_RULES: Readonly<MockRules> = Object.freeze({
  optionsFromClue: SHARED.optionsFromClue,
  actionsPerAttempt: 120,
});

export function createMockContext(options: {
  store: MockStore;
  clock: Clock;
  identity: () => IdentityProvider;
  seed?: string;
  transport?: MockTransportState;
  realtime?: MockRealtime;
  content?: MockContent;
  plugins?: PluginRegistry;
  rules?: Partial<MockRules>;
}): MockContext {
  const transport = options.transport ?? createTransportState();
  const realtime =
    options.realtime ?? createMockRealtime({ state: transport.realtime });
  const ctx = {
    store: options.store,
    clock: options.clock,
    rng: createRng(options.seed ?? "qz"),
    transport,
    identity: options.identity,
    emitHint: (topic: string, hint: RoomHint) => {
      realtime.emit(topic, hint);
    },
    realtime,
    content: options.content ?? fixtureContent(),
    plugins: options.plugins ?? PLUGINS,
    rules: { ...DEFAULT_MOCK_RULES, ...options.rules },
  } as Omit<MockContext, "controls"> as MockContext;
  ctx.controls = createMockControls(ctx);
  return ctx;
}
