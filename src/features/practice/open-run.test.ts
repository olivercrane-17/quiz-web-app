/**
 * The open run's label, read the way Today's Quick play reads it: after the
 * client boot, from the tab's session storage and the device's runs, which
 * a real controller wrote (R1-36).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { TUNABLES } from "@/config/tunables";
import { createFakeClock } from "@/engine/clock";
import { localDate, syntheticPool } from "@/engine/practice/testing";
import { getKv } from "@/platform/storage";

import { QUICK_PLAY_INTENT } from "./intent";
import { createPracticeController } from "./model/controller";
import { uuidV4 } from "./model/ids";
import { sessionTabRun } from "./model/tab-run";
import { openRunLabel } from "./open-run";

const boot = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/features/identity", () => ({
  bootClient: () => {
    boot.calls += 1;
    return Promise.resolve();
  },
}));

const POOL = syntheticPool();

function controller() {
  let n = 0;
  return createPracticeController({
    clock: createFakeClock(Date.UTC(2026, 10, 1, 9)),
    kv: getKv(),
    loadPool: async () => ({ ok: true, value: POOL }),
    newId: () => {
      n += 1;
      return uuidV4((bytes) => bytes.map((_, i) => (n * 13 + i * 5) & 0xff));
    },
    today: () => localDate("2026-11-01"),
    seen: () => new Map(),
    denylist: () => new Set(),
    plan: { bands: TUNABLES.practice },
    tab: sessionTabRun,
  });
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  boot.calls = 0;
});

describe("the open run's label", () => {
  it("R1-36 names the run Quick play carries on: Continue practice · 3 of 10", async () => {
    const practice = controller();
    await practice.begin(QUICK_PLAY_INTENT);
    for (let i = 0; i < 2; i += 1) {
      practice.answer({ family: "choice", kind: "answer", option: 0 });
      practice.continue();
    }
    expect(practice.getState().view?.index).toBe(2);
    expect(await openRunLabel()).toBe("Continue practice · 3 of 10");
    // Storage is read only after the boot.
    expect(boot.calls).toBe(1);
  });

  it("is null with no run open, so Quick play starts one", async () => {
    expect(await openRunLabel()).toBeNull();
    const practice = controller();
    await practice.begin(QUICK_PLAY_INTENT);
    for (let i = 0; i < 10; i += 1) {
      practice.answer({ family: "choice", kind: "answer", option: 0 });
      practice.continue();
    }
    expect(practice.getState().status).toBe("finished");
    expect(await openRunLabel()).toBeNull();
  });
});
