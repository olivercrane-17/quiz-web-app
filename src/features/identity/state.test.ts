/**
 * What the identity screens keep on the device: `qz:sync` (§6.2), the
 * device's public identity facts and progress (§9.2), the one-time note
 * for Today, the values a restore mints, and the claim's steps.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  parseClaimToken,
  parsePlayerId,
  parseSecret,
  parseSyncCode,
  type EpochMs,
  type PlayerId,
  type SyncCode,
} from "@/engine/types";
import { mintIdentity } from "@/platform/identity/local";
import { createKv, createMemoryStorage } from "@/platform/storage";

import { chromeIntentUrl, claimSteps } from "./claim/steps";
import {
  deviceHasProgress,
  hasLocalHistory,
  readDeviceIdentity,
} from "./device";
import { mintClaimToken, mintSecret } from "./mint";
import {
  leaveRestoreNotice,
  resetRestoreNoticeForTests,
  takeRestoreNotice,
} from "./restore-notice";
import { hasRestoreNotice } from "./notice-flag";
import {
  SYNC_KEY,
  decodeSyncRecord,
  isOwnClaim,
  markSyncCodeSaved,
  readSyncRecord,
  rememberClaim,
  storeSyncCode,
  syncCodeSavedAt,
} from "./sync-store";

const A = parsePlayerId("0f8fad5b-d9cb-469f-a165-70867728950e") as PlayerId;
const B = parsePlayerId("7c9e6679-7425-40de-944b-e07fc1f90ae7") as PlayerId;
const CODE = parseSyncCode("K7QX2M9PT4RW8HNC") as SyncCode;
const AT = Date.UTC(2026, 10, 5, 9) as EpochMs;

function kv() {
  return createKv({ storage: createMemoryStorage() });
}

afterEach(() => {
  sessionStorage.clear();
  resetRestoreNoticeForTests();
});

describe("qz:sync", () => {
  it("keeps one player's code, when it was saved, and the claim it made", () => {
    const store = kv();
    expect(readSyncRecord(A, store)).toBeNull();
    storeSyncCode(A, CODE, AT, {}, store);
    expect(readSyncRecord(A, store)).toEqual({
      v: 1,
      playerId: A,
      code: CODE,
      codeCreatedAt: AT,
      savedAt: null,
      claim: null,
    });
    markSyncCodeSaved(A, (AT + 1) as EpochMs, store);
    expect(syncCodeSavedAt(A, store)).toBe(AT + 1);
    const token = mintClaimToken();
    rememberClaim(A, { token, expiresAt: (AT + 600_000) as EpochMs }, store);
    expect(isOwnClaim(A, token, store)).toBe(true);
    expect(isOwnClaim(A, mintClaimToken(), store)).toBe(false);
    // The code survives the claim, and a new code clears the saved mark.
    expect(readSyncRecord(A, store)?.code).toBe(CODE);
    storeSyncCode(A, CODE, AT, {}, store);
    expect(syncCodeSavedAt(A, store)).toBeNull();
  });

  it("belongs to one player: another player's record reads as none", () => {
    const store = kv();
    storeSyncCode(A, CODE, AT, { savedAt: AT }, store);
    expect(readSyncRecord(B, store)).toBeNull();
    expect(syncCodeSavedAt(B, store)).toBeNull();
    // Writing for B starts B's record over.
    markSyncCodeSaved(B, AT, store);
    expect(readSyncRecord(B, store)).toMatchObject({ code: null, savedAt: AT });
    expect(readSyncRecord(A, store)).toBeNull();
  });

  it("refuses anything that isn't a record", () => {
    for (const raw of [
      null,
      [],
      "code",
      {
        v: 2,
        playerId: A,
        code: null,
        codeCreatedAt: null,
        savedAt: null,
        claim: null,
      },
      {
        v: 1,
        playerId: "nope",
        code: null,
        codeCreatedAt: null,
        savedAt: null,
        claim: null,
      },
      {
        v: 1,
        playerId: A,
        code: "short",
        codeCreatedAt: null,
        savedAt: null,
        claim: null,
      },
      {
        v: 1,
        playerId: A,
        code: null,
        codeCreatedAt: "x",
        savedAt: null,
        claim: null,
      },
      {
        v: 1,
        playerId: A,
        code: null,
        codeCreatedAt: null,
        savedAt: null,
        claim: { token: "x", expiresAt: 1 },
      },
    ]) {
      expect(decodeSyncRecord(raw), JSON.stringify(raw)).toBeNull();
    }
    const store = kv();
    store.write(SYNC_KEY, { nope: true });
    expect(readSyncRecord(A, store)).toBeNull();
  });
});

describe("the device", () => {
  it("reads the stored identity's public facts, never its secret", () => {
    const store = kv();
    expect(readDeviceIdentity(store)).toBeNull();
    const identity = { ...mintIdentity(AT), registered: true };
    store.write("qz:identity", identity);
    expect(readDeviceIdentity(store)).toEqual({
      playerId: identity.playerId,
      registered: true,
      source: "minted",
    });
  });

  it("has progress once registered, or once practice history holds a run", () => {
    const store = kv();
    expect(deviceHasProgress(store)).toBe(false);
    store.write("qz:history", []);
    expect(hasLocalHistory(store)).toBe(false);
    store.write("qz:history", [{ runId: "r1" }]);
    expect(deviceHasProgress(store)).toBe(true);
    const other = kv();
    other.write("qz:identity", { ...mintIdentity(AT), registered: false });
    expect(deviceHasProgress(other)).toBe(false);
    other.write("qz:identity", { ...mintIdentity(AT), registered: true });
    expect(deviceHasProgress(other)).toBe(true);
  });
});

describe("Today's note", () => {
  it("is taken once per page load", () => {
    expect(hasRestoreNotice()).toBe(false);
    leaveRestoreNotice({ v: 1, kind: "sync", playerId: A, streak: 4 });
    expect(hasRestoreNotice()).toBe(true);
    const first = takeRestoreNotice();
    expect(first).toEqual({ v: 1, kind: "sync", playerId: A, streak: 4 });
    expect(hasRestoreNotice()).toBe(false);
    // A second take in the same load (React's development remount) agrees.
    expect(takeRestoreNotice()).toEqual(first);
  });

  it("ignores a note it can't read", () => {
    sessionStorage.setItem("qz:restore-notice", '{"v":1,"kind":"other"}');
    expect(takeRestoreNotice()).toBeNull();
  });
});

describe("what a restore mints", () => {
  it("mints 43-character base64url secrets and claim tokens", () => {
    const secret = mintSecret();
    expect(parseSecret(secret)).toBe(secret);
    const token = mintClaimToken();
    expect(parseClaimToken(token)).toBe(token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mintClaimToken()).not.toBe(token);
  });
});

describe("the claim's steps", () => {
  it("names the menu and the item for the platform", () => {
    expect(claimSteps("ios")).toHaveLength(2);
    expect(claimSteps("android")[1]).toContain("Open in Chrome");
    expect(claimSteps("desktop")).toEqual([
      "Open this app's menu.",
      "Choose Open in browser.",
    ]);
  });

  it("builds an intent link that opens the claim in Chrome, falling back to the page", () => {
    expect(
      chromeIntentUrl({ protocol: "https:", host: "knewt.app" }, "/claim/abc"),
    ).toBe(
      "intent://knewt.app/claim/abc#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fknewt.app%2Fclaim%2Fabc;end",
    );
  });
});
