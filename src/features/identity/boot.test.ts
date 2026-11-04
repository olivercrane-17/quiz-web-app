import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBackend, resetBackendForTests } from "@/backend";
import type { MockBackend } from "@/backend/mock";
import type { TrackedEvent } from "@/features/analytics/track";
import { mintIdentity } from "@/platform/identity/local";

import {
  bootClient,
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
    await expect(recoverIdentity()).resolves.toBe("minted");
    const after = JSON.parse(localStorage.getItem("qz:identity") ?? "null");
    expect(after.playerId).not.toBe(before.playerId);
    expect(heard).toEqual([after.playerId]);
    const backend = (await getBackend()) as MockBackend;
    expect(backend.context.identity().current().playerId).toBe(after.playerId);
    stop();
  });

  it("stops listening when unsubscribed before the boot finished", async () => {
    stubRoutes({ status: 204 });
    const heard: string[] = [];
    const stop = onIdentityChange((next) => heard.push(next.playerId));
    stop();
    await bootClient();
    await recoverIdentity();
    expect(heard).toEqual([]);
  });
});
