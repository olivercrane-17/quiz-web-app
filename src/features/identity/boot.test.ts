import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBackend, resetBackendForTests } from "@/backend";
import type { MockBackend } from "@/backend/mock";
import type { TrackedEvent } from "@/features/analytics/track";
import { mintIdentity } from "@/platform/identity/local";

import {
  bootClient,
  forgetIdentity,
  onIdentityChange,
  recoverIdentity,
  resetBootForTests,
} from "./boot";

const NOW = Date.UTC(2026, 10, 1, 9);

interface FakeResponse {
  status: number;
  json(): Promise<unknown>;
}

/** Stubs fetch for the backup routes: GET /api/restore answers `restore`, POST and DELETE 204. */
function stubRoutes(restore: { status: number; body?: unknown } | "throw") {
  const calls: { url: string; method: string }[] = [];
  const fetch = vi.fn(
    (url: string, init: RequestInit = {}): Promise<FakeResponse> => {
      const method = init.method ?? "GET";
      calls.push({ url, method });
      if (url === "/api/restore") {
        if (restore === "throw") {
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        return Promise.resolve({
          status: restore.status,
          json: () => Promise.resolve(restore.body),
        });
      }
      return Promise.resolve({
        status: 204,
        json: () => Promise.resolve(null),
      });
    },
  );
  vi.stubGlobal("fetch", fetch);
  return calls;
}

function trackLog(): TrackedEvent[] {
  return (
    (window as unknown as { __qzTrackLog?: TrackedEvent[] }).__qzTrackLog ?? []
  );
}

beforeEach(() => {
  delete (window as { __qzTrackLog?: unknown }).__qzTrackLog;
});

afterEach(() => {
  resetBootForTests();
  resetBackendForTests();
  localStorage.clear();
  delete (window as { __qzMock?: unknown }).__qzMock;
  delete (window as { __qzTrackLog?: unknown }).__qzTrackLog;
});

describe("bootClient", () => {
  it("migrates storage before anything reads it, once per tab", async () => {
    stubRoutes({ status: 204 });
    localStorage.setItem("qz:history", "not json{");
    const first = bootClient();
    expect(bootClient()).toBe(first);
    await first;
    expect(JSON.parse(localStorage.getItem("qz:meta") ?? "null")).toMatchObject(
      { storageVersion: 1 },
    );
    expect(localStorage.getItem("qz:history")).toBeNull();
    expect(localStorage.getItem("qz:quarantine:history")).toBe("not json{");
  });

  it("mints the identity when there is no cookie and hands it to the backend (§9.1)", async () => {
    const calls = stubRoutes({ status: 204 });
    await bootClient();
    const stored = JSON.parse(localStorage.getItem("qz:identity") ?? "null");
    expect(stored).toMatchObject({ v: 1, registered: false, source: "minted" });
    expect(calls).toEqual([{ url: "/api/restore", method: "GET" }]);
    const backend = (await getBackend()) as MockBackend;
    expect(backend.context.identity().current()).toEqual(stored);

    // The next tab finds the same identity, and asks the cookie nothing.
    resetBootForTests();
    resetBackendForTests();
    calls.length = 0;
    await bootClient();
    const again = (await getBackend()) as MockBackend;
    expect(again.context.identity().current().playerId).toBe(stored.playerId);
    expect(calls).toEqual([]);
    expect(trackLog()).toEqual([]);
  });

  it("AC-CKE-02 restores a wiped store from the backup cookie silently, and logs identity_restored and storage_lost", async () => {
    const lost = { ...mintIdentity(NOW), registered: true };
    const calls = stubRoutes({
      status: 200,
      body: { playerId: lost.playerId, secret: lost.secret },
    });
    await bootClient();
    const stored = JSON.parse(localStorage.getItem("qz:identity") ?? "null");
    expect(stored).toMatchObject({
      playerId: lost.playerId,
      secret: lost.secret,
      registered: true,
      source: "cookie",
    });
    const backend = (await getBackend()) as MockBackend;
    expect(backend.context.identity().current().playerId).toBe(lost.playerId);
    expect(trackLog()).toEqual([
      { name: "identity_restored", props: { source: "cookie" } },
      { name: "storage_lost", props: {} },
    ]);
    // The restored identity's cookie is posted again, its age unknown.
    await vi.waitFor(() => {
      expect(calls).toContainEqual({ url: "/api/identity", method: "POST" });
    });
  });

  it("never rejects, even when the cookie can't be asked", async () => {
    stubRoutes("throw");
    await expect(bootClient()).resolves.toBeUndefined();
    const backend = (await getBackend()) as MockBackend;
    expect(backend.context.identity().current().source).toBe("minted");
    // Kept in memory until the cookie question has an answer.
    expect(localStorage.getItem("qz:identity")).toBeNull();
  });

  it("never rejects when no identity can be minted (§9.1 step 5)", async () => {
    stubRoutes({ status: 204 });
    vi.stubGlobal("crypto", {});
    await expect(bootClient()).resolves.toBeUndefined();
    const backend = await getBackend();
    // Calls that need an identity answer an error instead of throwing.
    const result = await backend.identity.getProfile();
    expect(result.ok).toBe(false);
  });
});

describe("after the boot", () => {
  it("recovers from auth_failed with a new identity when the cookie can't help (§9.6)", async () => {
    stubRoutes({ status: 204 });
    await bootClient();
    const before = JSON.parse(localStorage.getItem("qz:identity") ?? "null");
    const heard: string[] = [];
    const stop = onIdentityChange((next) => heard.push(next.playerId));
    await expect(recoverIdentity(before)).resolves.toBe("minted");
    const after = JSON.parse(localStorage.getItem("qz:identity") ?? "null");
    expect(after.playerId).not.toBe(before.playerId);
    expect(heard).toEqual([after.playerId]);
    const backend = (await getBackend()) as MockBackend;
    expect(backend.context.identity().current().playerId).toBe(after.playerId);
    // A second write that was sent with the old credential changes nothing.
    await expect(recoverIdentity(before)).resolves.toBe("restored");
    expect(
      JSON.parse(localStorage.getItem("qz:identity") ?? "null").playerId,
    ).toBe(after.playerId);
    stop();
  });

  it("hands the backend IDN-1's recovery as IdentityProvider.recover, so a refused credential restores the cookie's identity (§9.6)", async () => {
    stubRoutes({ status: 204 });
    await bootClient();
    const backend = (await getBackend()) as MockBackend;
    const provider = backend.context.identity();
    const failed = provider.current();
    // The backup cookie now holds the player's identity (another tab
    // registered and posted it), which the wrapper's recovery finds.
    const saved = { ...mintIdentity(NOW), registered: true };
    stubRoutes({
      status: 200,
      body: { playerId: saved.playerId, secret: saved.secret },
    });
    await expect(provider.recover?.(failed)).resolves.toBe("restored");
    expect(provider.current()).toMatchObject({
      playerId: saved.playerId,
      secret: saved.secret,
      registered: true,
      source: "cookie",
    });
    expect(
      JSON.parse(localStorage.getItem("qz:identity") ?? "null").playerId,
    ).toBe(saved.playerId);
  });

  it("stops listening when unsubscribed before the boot finished", async () => {
    stubRoutes({ status: 204 });
    const heard: string[] = [];
    const stop = onIdentityChange((next) => heard.push(next.playerId));
    stop();
    await bootClient();
    const current = JSON.parse(localStorage.getItem("qz:identity") ?? "null");
    await recoverIdentity(current);
    expect(heard).toEqual([]);
  });

  it("forgetIdentity() removes the identity and the profile, and expires the cookie (Delete my data)", async () => {
    const calls = stubRoutes({ status: 204 });
    await bootClient();
    const before = JSON.parse(localStorage.getItem("qz:identity") ?? "null");
    localStorage.setItem(
      "qz:profile",
      JSON.stringify({ playerId: before.playerId }),
    );
    const heard: string[] = [];
    const stop = onIdentityChange((next) => heard.push(next.playerId));
    await expect(forgetIdentity()).resolves.toBe(true);
    expect(localStorage.getItem("qz:identity")).toBeNull();
    expect(localStorage.getItem("qz:profile")).toBeNull();
    expect(calls).toContainEqual({ url: "/api/identity", method: "DELETE" });
    // The tab carries on with a new identity it never stores.
    const backend = (await getBackend()) as MockBackend;
    const now = backend.context.identity().current();
    expect(now.playerId).not.toBe(before.playerId);
    expect(heard).toEqual([now.playerId]);
    backend.context.identity().markRegistered();
    expect(localStorage.getItem("qz:identity")).toBeNull();
    stop();
  });

  it("after an Under 13 answer, a load never reads or posts the cookie and stores no identity (§9.7)", async () => {
    const child = { ...mintIdentity(NOW), registered: true };
    const calls = stubRoutes({
      status: 200,
      body: { playerId: child.playerId, secret: child.secret },
    });
    localStorage.setItem("qz:under13", JSON.stringify({ since: NOW }));
    await bootClient();
    expect(localStorage.getItem("qz:identity")).toBeNull();
    expect(calls).toEqual([]);
    const backend = (await getBackend()) as MockBackend;
    expect(backend.context.identity().current().playerId).not.toBe(
      child.playerId,
    );
    expect(trackLog()).toEqual([]);
    // Expiring the cookie again (an earlier expiry may have failed offline) still works.
    await expect(forgetIdentity()).resolves.toBe(true);
    expect(calls).toEqual([{ url: "/api/identity", method: "DELETE" }]);
    expect(localStorage.getItem("qz:identity")).toBeNull();
  });
});
