// @vitest-environment node
// The formats the route handlers use run on the server.
import { describe, expect, it } from "vitest";

import { parsePlayerId, parseSecret } from "@/engine/types";

import {
  BACKUP_COOKIE_MAX_AGE_S,
  BACKUP_COOKIE_NAME,
  BACKUP_REFRESH_MS,
  IDENTITY_BODY_MAX_BYTES,
  backupCookieHeader,
  decodeBackupCookieValue,
  encodeBackupCookieValue,
  expiredBackupCookieHeader,
  hasOwnOrigin,
  isSameOriginFetch,
  parseBackupCredential,
  readBackupCookie,
  readCappedText,
  readCredentialBody,
  type BackupCredential,
} from "./cookie";

const PLAYER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECRET = "kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w";
const CREDENTIAL: BackupCredential = {
  playerId: parsePlayerId(PLAYER)!,
  secret: parseSecret(SECRET)!,
};
const VALUE = `v1.${PLAYER}.${SECRET}`;

describe("the backup cookie's value (§9.3)", () => {
  it("is v1.<playerId>.<secret>, and decodes back", () => {
    expect(encodeBackupCookieValue(CREDENTIAL)).toBe(VALUE);
    expect(decodeBackupCookieValue(VALUE)).toEqual(CREDENTIAL);
  });

  it("refuses other versions, shapes and spellings", () => {
    for (const bad of [
      "",
      `v2.${PLAYER}.${SECRET}`,
      `${PLAYER}.${SECRET}`,
      `v1.${PLAYER}`,
      `v1.${PLAYER}.${SECRET}.extra`,
      `v1.not-a-uuid.${SECRET}`,
      `v1.${PLAYER}.short`,
      // Only the lower-case id we write is ours.
      `v1.${PLAYER.toUpperCase()}.${SECRET}`,
      // A v1 UUID is no player id (§2.4: player ids are v4).
      `v1.0f8fad5b-d9cb-169f-a165-70867728950e.${SECRET}`,
    ]) {
      expect(decodeBackupCookieValue(bad), bad).toBeNull();
    }
  });
});

describe("Set-Cookie (AC-CKE-01)", () => {
  it("stores __Host-pid for 400 days, HttpOnly, Secure, SameSite=Lax, on /", () => {
    expect(BACKUP_COOKIE_NAME).toBe("__Host-pid");
    expect(BACKUP_COOKIE_MAX_AGE_S).toBe(34_560_000);
    expect(BACKUP_COOKIE_MAX_AGE_S).toBe(400 * 24 * 60 * 60);
    expect(backupCookieHeader(CREDENTIAL)).toBe(
      `__Host-pid=${VALUE}; Max-Age=34560000; Path=/; Secure; HttpOnly; SameSite=Lax`,
    );
  });

  it("expires it with the same prefix rules, so the browser takes the deletion", () => {
    const header = expiredBackupCookieHeader();
    expect(header).toBe(
      "__Host-pid=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
    );
    expect(header).not.toMatch(/Domain=/i);
  });

  it("refreshes every 7 days", () => {
    expect(BACKUP_REFRESH_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("reading the Cookie header", () => {
  it("finds __Host-pid among other cookies", () => {
    expect(
      readBackupCookie(`a=1; ${BACKUP_COOKIE_NAME}=${VALUE}; b=2`),
    ).toEqual(CREDENTIAL);
    expect(readBackupCookie(`${BACKUP_COOKIE_NAME}=${VALUE}`)).toEqual(
      CREDENTIAL,
    );
  });

  it("answers null without a well-formed one", () => {
    expect(readBackupCookie(null)).toBeNull();
    expect(readBackupCookie("")).toBeNull();
    expect(readBackupCookie("a=1; b=2")).toBeNull();
    expect(readBackupCookie(`pid=${VALUE}`)).toBeNull();
    expect(readBackupCookie(`${BACKUP_COOKIE_NAME}=`)).toBeNull();
    expect(readBackupCookie(`${BACKUP_COOKIE_NAME}=v1.x.y`)).toBeNull();
  });

  it("takes the first well-formed value when the name repeats", () => {
    expect(
      readBackupCookie(
        `${BACKUP_COOKIE_NAME}=garbage; ${BACKUP_COOKIE_NAME}=${VALUE}`,
      ),
    ).toEqual(CREDENTIAL);
  });
});

describe("the credential body", () => {
  it("takes a v4 id and a 43-character base64url secret, lower-casing the id", () => {
    expect(
      parseBackupCredential({ playerId: PLAYER.toUpperCase(), secret: SECRET }),
    ).toEqual(CREDENTIAL);
    expect(
      parseBackupCredential({ playerId: PLAYER, secret: SECRET, extra: 1 }),
    ).toEqual(CREDENTIAL);
  });

  it("refuses anything else", () => {
    for (const bad of [
      null,
      "text",
      [PLAYER, SECRET],
      {},
      { playerId: PLAYER },
      { secret: SECRET },
      { playerId: PLAYER, secret: `${SECRET}x` },
      { playerId: PLAYER, secret: SECRET.slice(0, 42) },
      { playerId: "e2e2e2e2", secret: SECRET },
      { playerId: PLAYER, secret: 42 },
    ]) {
      expect(parseBackupCredential(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("same-origin checks (§9.3)", () => {
  it("counts only Sec-Fetch-Site: same-origin (AC-CKE-03)", () => {
    expect(
      isSameOriginFetch(headers({ "sec-fetch-site": "same-origin" })),
    ).toBe(true);
    for (const site of ["cross-site", "same-site", "none", "SAME-ORIGIN"]) {
      expect(isSameOriginFetch(headers({ "sec-fetch-site": site })), site).toBe(
        false,
      );
    }
    expect(isSameOriginFetch(headers({}))).toBe(false);
  });

  /** A request to `url` with these headers, as the route handler sees it. */
  const sentTo = (url: string, init: Record<string, string>) => ({
    url,
    headers: headers(init),
  });

  it("takes an Origin with the scheme and host the request went to", () => {
    expect(
      hasOwnOrigin(
        sentTo("http://127.0.0.1:3217/api/identity", {
          origin: "http://127.0.0.1:3217",
          host: "127.0.0.1:3217",
        }),
        null,
      ),
    ).toBe(true);
    expect(
      hasOwnOrigin(
        sentTo("https://knewt.app/api/identity", {
          origin: "https://knewt.app",
          host: "Knewt.App",
        }),
        null,
      ),
    ).toBe(true);
    // Behind a proxy that names the original scheme and host.
    expect(
      hasOwnOrigin(
        sentTo("http://internal:8080/api/identity", {
          origin: "https://knewt.app",
          host: "internal:8080",
          "x-forwarded-host": "knewt.app, edge",
          "x-forwarded-proto": "https",
        }),
        null,
      ),
    ).toBe(true);
    // Or the configured site URL.
    expect(
      hasOwnOrigin(
        sentTo("http://internal:8080/api/identity", {
          origin: "https://knewt.app",
          host: "internal:8080",
        }),
        "https://knewt.app",
      ),
    ).toBe(true);
  });

  it("refuses a missing, foreign, opaque or malformed Origin", () => {
    const url = "https://knewt.app/api/identity";
    const host = { host: "knewt.app" };
    for (const origin of [
      undefined,
      "https://evil.example",
      "https://knewt.app.evil.example",
      "https://evil.example:443",
      "null",
      "knewt.app",
      "https://knewt.app/path",
      "ftp://knewt.app",
      "https://knewt.app:8443",
      // Another scheme is another origin.
      "http://knewt.app",
    ]) {
      const init: Record<string, string> =
        origin === undefined ? host : { ...host, origin };
      expect(hasOwnOrigin(sentTo(url, init), "https://knewt.app"), origin).toBe(
        false,
      );
    }
    expect(
      hasOwnOrigin(
        sentTo(url, { origin: "https://elsewhere.example" }),
        "not a url",
      ),
    ).toBe(false);
    // A forwarded scheme that isn't the Origin's.
    expect(
      hasOwnOrigin(
        sentTo(url, {
          origin: "https://knewt.app",
          host: "knewt.app",
          "x-forwarded-proto": "http",
        }),
        null,
      ),
    ).toBe(false);
  });
});

function request(body: BodyInit | null, init: Record<string, string> = {}) {
  return new Request("http://127.0.0.1:3217/api/identity", {
    method: "POST",
    headers: { "content-type": "application/json", ...init },
    body,
  });
}

describe("reading the POST body", () => {
  it("reads a JSON credential", async () => {
    await expect(
      readCredentialBody(
        request(JSON.stringify({ playerId: PLAYER, secret: SECRET })),
      ),
    ).resolves.toEqual(CREDENTIAL);
    await expect(
      readCredentialBody(
        request(JSON.stringify({ playerId: PLAYER, secret: SECRET }), {
          "content-type": "Application/JSON; charset=utf-8",
        }),
      ),
    ).resolves.toEqual(CREDENTIAL);
  });

  it("refuses other types, bad JSON, bad fields and oversized bodies", async () => {
    const good = JSON.stringify({ playerId: PLAYER, secret: SECRET });
    await expect(
      readCredentialBody(request(good, { "content-type": "text/plain" })),
    ).resolves.toBeNull();
    await expect(readCredentialBody(request("{"))).resolves.toBeNull();
    await expect(readCredentialBody(request("[]"))).resolves.toBeNull();
    await expect(readCredentialBody(request(null))).resolves.toBeNull();
    const padded = JSON.stringify({
      playerId: PLAYER,
      secret: SECRET,
      pad: "x".repeat(IDENTITY_BODY_MAX_BYTES),
    });
    await expect(readCredentialBody(request(padded))).resolves.toBeNull();
  });

  it("stops reading past the cap, whatever Content-Length says", async () => {
    const chunks = [new Uint8Array(600).fill(32), new Uint8Array(600).fill(32)];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next === undefined) controller.close();
        else controller.enqueue(next);
      },
    });
    // Node's fetch needs `duplex` for a streamed body.
    const streamed = new Request("http://127.0.0.1:3217/api/identity", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readCappedText(streamed, 1024)).resolves.toBeNull();
    await expect(
      readCappedText(request("x", { "content-length": "5000" }), 1024),
    ).resolves.toBeNull();
    await expect(readCappedText(request("é"), 1024)).resolves.toBe("é");
  });

  it("refuses bytes that aren't UTF-8", async () => {
    await expect(
      readCappedText(request(new Uint8Array([0xff, 0xfe])), 1024),
    ).resolves.toBeNull();
  });
});
