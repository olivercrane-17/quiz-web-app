import { describe, expect, it } from "vitest";

import type { RoomHint } from "@/engine/types";

import { createMockRealtime } from "./realtime";
import type { MockChannelLike } from "./store";

const hint = (version: number): RoomHint =>
  ({
    roomId: "4f9c1a52-8b1d-4c7e-9a3b-2d6e8f0a1b2c",
    version,
    phase: "answering",
    questionIndex: 0,
    deadline: null,
  }) as RoomHint;

/** A BroadcastChannel stand-in that several pages share. */
function bus() {
  const ends: { deliver(data: unknown): void }[] = [];
  return (): MockChannelLike => {
    const listeners: ((event: { data: unknown }) => void)[] = [];
    const self = {
      deliver(data: unknown) {
        for (const listener of listeners) listener({ data });
      },
    };
    ends.push(self);
    return {
      postMessage(message) {
        for (const end of ends) if (end !== self) end.deliver(message);
      },
      addEventListener(_type, listener) {
        listeners.push(listener);
      },
      close() {},
    };
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mock room hints", () => {
  it("deliver a hint to the topic's subscribers in this page and in the others", async () => {
    const channel = bus();
    const host = createMockRealtime({ channel: channel() });
    const phone = createMockRealtime({ channel: channel() });
    const onHost: number[] = [];
    const onPhone: number[] = [];
    const statuses: string[] = [];
    host.subscribe("room:1", {
      hint: (h) => onHost.push(h.version),
      status: () => {},
    });
    phone.subscribe("room:1", {
      hint: (h) => onPhone.push(h.version),
      status: (s) => statuses.push(s),
    });
    phone.subscribe("roomhost:1", {
      hint: () => onPhone.push(-1),
      status: () => {},
    });
    host.emit("room:1", hint(3));
    await flush();
    expect(onHost).toEqual([3]);
    expect(onPhone).toEqual([3]);
    expect(statuses).toEqual(["live"]);
  });

  it("stop while down and report the status to every subscriber", async () => {
    const realtime = createMockRealtime({ channel: null });
    const seen: number[] = [];
    const statuses: string[] = [];
    const unsubscribe = realtime.subscribe("room:1", {
      hint: (h) => seen.push(h.version),
      status: (s) => statuses.push(s),
    });
    await flush();
    realtime.setState("down");
    realtime.emit("room:1", hint(1));
    realtime.setState("live");
    realtime.emit("room:1", hint(2));
    unsubscribe();
    realtime.emit("room:1", hint(3));
    expect(seen).toEqual([2]);
    expect(statuses).toEqual(["live", "down", "live"]);
    expect(realtime.state()).toBe("live");
  });

  it("never reports a stale status last when the state changes as it subscribes", async () => {
    const realtime = createMockRealtime({ channel: null });
    const statuses: string[] = [];
    realtime.subscribe("room:1", {
      hint: () => {},
      status: (s) => statuses.push(s),
    });
    // The switch flips in the same tick, before the first report goes out.
    realtime.setState("down");
    await flush();
    expect(realtime.state()).toBe("down");
    expect(statuses.at(-1)).toBe("down");
    expect(statuses).not.toContain("live");
  });
});
