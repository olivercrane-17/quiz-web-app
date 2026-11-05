import { describe, expect, it, vi } from "vitest";

import { parsePlayerId, parseSecret } from "@/engine/types";

import { createHttpBackup, type FetchLike } from "./backup";
import type { BackupCredential } from "./cookie";

const CREDENTIAL: BackupCredential = {
  playerId: parsePlayerId("0f8fad5b-d9cb-469f-a165-70867728950e")!,
  secret: parseSecret("kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w")!,
};

interface Call {
  input: string;
  init: RequestInit;
}

/** A fetch that answers `status` (and `body` as JSON), recording each call. */
function fakeFetch(status: number, body?: unknown) {
  const calls: Call[] = [];
  const fetch: FetchLike = (input, init) => {
    calls.push({ input, init });
    return Promise.resolve({
      status,
      json: () =>
        body === undefined
          ? Promise.reject(new SyntaxError("no body"))
          : Promise.resolve(body),
    });
  };
  return { fetch, calls };
}

describe("restore (§9.1 step 1)", () => {
  it("asks GET /api/restore on our own origin, uncached, with the cookie", async () => {
    const { fetch, calls } = fakeFetch(200, CREDENTIAL);
    const backup = createHttpBackup({ fetch });
    await expect(backup.restore()).resolves.toEqual({
      kind: "restored",
      credential: CREDENTIAL,
    });
    expect(calls).toHaveLength(1);
    const [{ input, init }] = calls as [Call];
    expect(input).toBe("/api/restore");
    expect(init).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    // The default `cors` mode keeps a real Origin under no-referrer.
    expect(init.mode).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps 204 to none, 403 to refused, and anything else to failed", async () => {
    await expect(
      createHttpBackup({ fetch: fakeFetch(204).fetch }).restore(),
    ).resolves.toEqual({ kind: "none" });
    await expect(
      createHttpBackup({ fetch: fakeFetch(403).fetch }).restore(),
    ).resolves.toEqual({ kind: "refused" });
    for (const status of [500, 502, 404, 401, 429]) {
      await expect(
        createHttpBackup({ fetch: fakeFetch(status).fetch }).restore(),
        String(status),
      ).resolves.toEqual({ kind: "failed" });
    }
  });

  it("treats a 200 that holds no identity as failed, never as a restore", async () => {
    for (const body of [
      undefined,
      "<html>captive portal</html>",
      { playerId: "x", secret: "y" },
      null,
    ]) {
      await expect(
        createHttpBackup({ fetch: fakeFetch(200, body).fetch }).restore(),
      ).resolves.toEqual({ kind: "failed" });
    }
  });

  it("fails without a request while offline, and on a rejected fetch", async () => {
    const offline = fakeFetch(200, CREDENTIAL);
    await expect(
      createHttpBackup({
        fetch: offline.fetch,
        isOnline: () => false,
      }).restore(),
    ).resolves.toEqual({ kind: "failed" });
    expect(offline.calls).toHaveLength(0);
    await expect(
      createHttpBackup({
        fetch: () => Promise.reject(new TypeError("Failed to fetch")),
      }).restore(),
    ).resolves.toEqual({ kind: "failed" });
  });

  it("gives up after its timeout and aborts the request", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const backup = createHttpBackup({
        fetch: (_input, init) => {
          signal = init.signal ?? undefined;
          return new Promise(() => {});
        },
        restoreTimeoutMs: 4000,
      });
      const outcome = backup.restore();
      await vi.advanceTimersByTimeAsync(3999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(outcome).resolves.toEqual({ kind: "failed" });
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts a body that stalls after the headers against the same deadline", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const backup = createHttpBackup({
        fetch: (_input, init) => {
          signal = init.signal ?? undefined;
          // The headers arrive at once; the body never does.
          return Promise.resolve({
            status: 200,
            json: () => new Promise<unknown>(() => {}),
          });
        },
        restoreTimeoutMs: 4000,
      });
      let settled = false;
      const outcome = backup.restore().finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(3999);
      expect(settled).toBe(false);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(outcome).resolves.toEqual({ kind: "failed" });
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails when reading the body fails", async () => {
    const backup = createHttpBackup({
      fetch: () =>
        Promise.resolve({
          status: 200,
          json: () => Promise.reject(new TypeError("network error")),
        }),
    });
    await expect(backup.restore()).resolves.toEqual({ kind: "failed" });
  });
});

describe("save and remove (§9.3)", () => {
  it("posts { playerId, secret } as JSON and reports a 204 as saved", async () => {
    const { fetch, calls } = fakeFetch(204);
    await expect(createHttpBackup({ fetch }).save(CREDENTIAL)).resolves.toBe(
      "saved",
    );
    const [{ input, init }] = calls as [Call];
    expect(input).toBe("/api/identity");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    expect(init.mode).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual({
      playerId: CREDENTIAL.playerId,
      secret: CREDENTIAL.secret,
    });
  });

  it("reports a 403 as refused, and anything else as failed", async () => {
    // A browser that sends no Sec-Fetch-Site gets 403 every time.
    await expect(
      createHttpBackup({ fetch: fakeFetch(403).fetch }).save(CREDENTIAL),
    ).resolves.toBe("refused");
    for (const status of [400, 429, 500, 502]) {
      await expect(
        createHttpBackup({ fetch: fakeFetch(status).fetch }).save(CREDENTIAL),
        String(status),
      ).resolves.toBe("failed");
    }
    await expect(
      createHttpBackup({
        fetch: () => Promise.reject(new TypeError("offline")),
      }).save(CREDENTIAL),
    ).resolves.toBe("failed");
  });

  it("gives up on a write after its timeout", async () => {
    vi.useFakeTimers();
    try {
      const backup = createHttpBackup({
        fetch: () => new Promise(() => {}),
        saveTimeoutMs: 8000,
      });
      const saved = backup.save(CREDENTIAL);
      const removed = backup.remove();
      await vi.advanceTimersByTimeAsync(8000);
      await expect(saved).resolves.toBe("failed");
      await expect(removed).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires the cookie with DELETE and no body", async () => {
    const { fetch, calls } = fakeFetch(204);
    await expect(createHttpBackup({ fetch }).remove()).resolves.toBe(true);
    const [{ input, init }] = calls as [Call];
    expect(input).toBe("/api/identity");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("sends nothing while offline", async () => {
    const { fetch, calls } = fakeFetch(204);
    const backup = createHttpBackup({ fetch, isOnline: () => false });
    await expect(backup.save(CREDENTIAL)).resolves.toBe("failed");
    await expect(backup.remove()).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });
});
