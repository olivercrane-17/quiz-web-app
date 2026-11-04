import { describe, expect, it } from "vitest";

import {
  QZ_CHANNEL,
  createIdentityChannel,
  type ChannelLike,
  type StorageEventSource,
} from "./broadcast";

/** BroadcastChannel semantics in memory: a post reaches every other member. */
function createHub() {
  const members = new Set<{
    listeners: Set<(event: { data: unknown }) => void>;
  }>();
  return {
    join(): ChannelLike {
      const member = {
        listeners: new Set<(event: { data: unknown }) => void>(),
      };
      members.add(member);
      return {
        postMessage(message) {
          for (const other of members) {
            if (other === member) continue;
            for (const listener of other.listeners) listener({ data: message });
          }
        },
        addEventListener(_type, listener) {
          member.listeners.add(listener);
        },
        removeEventListener(_type, listener) {
          member.listeners.delete(listener);
        },
        close() {
          members.delete(member);
        },
      };
    },
  };
}

function storageSource() {
  const listeners = new Set<(event: { key: string | null }) => void>();
  const source: StorageEventSource = {
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
  };
  return {
    source,
    fire(key: string | null) {
      for (const listener of listeners) listener({ key });
    },
  };
}

describe("the identity channel (§6.4)", () => {
  it("is the app's one channel, qz", () => {
    expect(QZ_CHANNEL).toBe("qz");
  });

  it("tells the other tabs, and never the tab that announced", () => {
    const hub = createHub();
    const a = createIdentityChannel({
      device: null,
      channel: hub.join(),
      storageEvents: null,
    });
    const b = createIdentityChannel({
      device: null,
      channel: hub.join(),
      storageEvents: null,
    });
    let heardA = 0;
    let heardB = 0;
    a.listen(() => (heardA += 1));
    const stop = b.listen(() => (heardB += 1));
    a.announce();
    expect([heardA, heardB]).toEqual([0, 1]);
    stop();
    a.announce();
    expect(heardB).toBe(1);
  });

  it("keeps device namespaces apart (mock builds, §6.1)", () => {
    const hub = createHub();
    const phone = createIdentityChannel({
      device: "phone-1",
      channel: hub.join(),
      storageEvents: null,
    });
    const host = createIdentityChannel({
      device: "host",
      channel: hub.join(),
      storageEvents: null,
    });
    const samePhone = createIdentityChannel({
      device: "phone-1",
      channel: hub.join(),
      storageEvents: null,
    });
    let host_ = 0;
    let phone_ = 0;
    host.listen(() => (host_ += 1));
    samePhone.listen(() => (phone_ += 1));
    phone.announce();
    expect([host_, phone_]).toEqual([0, 1]);
  });

  it("says when the other tab forgot the identity (Delete my data, Under 13)", () => {
    const hub = createHub();
    const a = createIdentityChannel({
      device: null,
      channel: hub.join(),
      storageEvents: null,
    });
    const b = createIdentityChannel({
      device: null,
      channel: hub.join(),
      storageEvents: null,
    });
    const heard: boolean[] = [];
    b.listen((news) => heard.push(news.forgotten));
    a.announce();
    a.announce({ forgotten: true });
    a.announce({ forgotten: false });
    expect(heard).toEqual([false, true, false]);
  });

  it("ignores other messages on the shared channel", () => {
    const hub = createHub();
    const sender = hub.join();
    const tab = createIdentityChannel({
      device: null,
      channel: hub.join(),
      storageEvents: null,
    });
    let heard = 0;
    tab.listen(() => (heard += 1));
    for (const message of [
      { type: "settings_changed" },
      { type: "identity_changed", device: 3 },
      { type: "identity_changed", device: null, forgotten: "yes" },
      "identity_changed",
      null,
    ]) {
      sender.postMessage(message);
    }
    expect(heard).toBe(0);
  });

  it("falls back to storage events for identity keys, the Under 13 flag and cleared storage", () => {
    const storage = storageSource();
    const tab = createIdentityChannel({
      device: null,
      channel: null,
      storageEvents: storage.source,
    });
    const heard: boolean[] = [];
    tab.listen((news) => heard.push(news.forgotten));
    storage.fire("qz:identity");
    storage.fire("qz:d:phone-1:identity");
    storage.fire(null);
    // The tab re-reads storage, where the flag speaks for itself.
    storage.fire("qz:under13");
    storage.fire("qz:d:phone-1:under13");
    storage.fire("qz:settings");
    storage.fire("qz:profile");
    storage.fire("qz-mock:db:v1");
    expect(heard).toEqual([false, false, false, false, false]);
    tab.close();
    storage.fire("qz:identity");
    expect(heard).toHaveLength(5);
  });

  it("survives a channel that throws", () => {
    const broken: ChannelLike = {
      postMessage() {
        throw new Error("closed");
      },
      addEventListener() {
        throw new Error("closed");
      },
      removeEventListener() {
        throw new Error("closed");
      },
      close() {
        throw new Error("closed");
      },
    };
    const tab = createIdentityChannel({
      device: null,
      channel: broken,
      storageEvents: null,
    });
    expect(() => tab.announce()).not.toThrow();
    expect(() => tab.close()).not.toThrow();
  });
});
