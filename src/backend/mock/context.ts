/**
 * What every mock area is built with (ARCHITECTURE §7.4): the store, the
 * page clock (so Playwright's page.clock moves the server too), a seeded
 * RNG (so ids and codes repeat run to run), the transport state behind the
 * controls, the identity of the calling device, and the room-hint emitter
 * (realtime.ts, ROM-1).
 */
import type { Clock } from "@/engine/clock";
import { createRng, type Rng } from "@/engine/rng";
import type { RoomHint } from "@/engine/types";
import type { IdentityProvider } from "@/platform/identity/provider";

import {
  createMockControls,
  createTransportState,
  type MockControls,
  type MockTransportState,
} from "./controls";
import type { MockStore } from "./store";

export interface MockContext {
  store: MockStore;
  clock: Clock;
  rng: Rng;
  /** window.__qzMock: what tests use to steer the mock. */
  controls: MockControls;
  /** The state behind the controls: latency, reachability, realtime, shed, failures. */
  transport: MockTransportState;
  /** The calling device's identity (§7.1); throws before the identity boot. */
  identity(): IdentityProvider;
  /** Sends a room hint on a topic (`room:<id>`, `roomhost:<id>`). */
  emitHint(topic: string, hint: RoomHint): void;
}

export function createMockContext(options: {
  store: MockStore;
  clock: Clock;
  identity: () => IdentityProvider;
  seed?: string;
  transport?: MockTransportState;
  emitHint?: (topic: string, hint: RoomHint) => void;
}): MockContext {
  const transport = options.transport ?? createTransportState();
  return {
    store: options.store,
    clock: options.clock,
    rng: createRng(options.seed ?? "qz"),
    controls: createMockControls(options.store, transport),
    transport,
    identity: options.identity,
    emitHint: options.emitHint ?? (() => {}),
  };
}
