// @vitest-environment node
// Route handlers run on the server (ARCHITECTURE §9.3, IDN-1's acceptance).
import { describe, expect, it } from "vitest";

import { getSiteUrl } from "@/lib/env";

import { DELETE, POST } from "./route";

const ORIGIN = "http://127.0.0.1:3217";
const PLAYER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECRET = "kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w";
const BODY = JSON.stringify({ playerId: PLAYER, secret: SECRET });

/** What a same-origin fetch from the app sends. */
const SAME_ORIGIN = {
  host: "127.0.0.1:3217",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
};

function post(
  headers: Record<string, string> = SAME_ORIGIN,
  body: string | null = BODY,
): Request {
  return new Request(`${ORIGIN}/api/identity`, {
    method: "POST",
    headers,
    body,
  });
}

function remove(headers: Record<string, string> = SAME_ORIGIN): Request {
  return new Request(`${ORIGIN}/api/identity`, { method: "DELETE", headers });
}

function without(name: string): Record<string, string> {
  const headers: Record<string, string> = { ...SAME_ORIGIN };
  delete headers[name];
  return headers;
}

describe("POST /api/identity", () => {
  it("AC-CKE-01 sets __Host-pid with HttpOnly, Secure, SameSite=Lax, Path=/ and a Max-Age of 34,560,000", async () => {
    const response = await POST(post());
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toEqual([
      `__Host-pid=v1.${PLAYER}.${SECRET}; Max-Age=34560000; Path=/; Secure; HttpOnly; SameSite=Lax`,
    ]);
    const attributes = (cookies[0] ?? "")
      .split(";")
      .slice(1)
      .map((part) => part.trim());
    expect(attributes).toEqual(
      expect.arrayContaining([
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Path=/",
        "Max-Age=34560000",
      ]),
    );
    expect(attributes.some((part) => /^domain=/i.test(part))).toBe(false);
    // Nothing comes back but the cookie: no body, so no echo of the secret.
    expect(await response.text()).toBe("");
  });

  it("refuses a cross-site request (403), whatever it carries", async () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      const response = await POST(
        post({ ...SAME_ORIGIN, "sec-fetch-site": site }),
      );
      expect(response.status, site).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    const missing = await POST(post(without("sec-fetch-site")));
    expect(missing.status).toBe(403);
  });

  it("refuses a missing or foreign Origin (403)", async () => {
    expect((await POST(post(without("origin")))).status).toBe(403);
    for (const origin of [
      "https://evil.example",
      "null",
      "http://127.0.0.1:3218",
      "https://127.0.0.1:3217",
    ]) {
      const response = await POST(post({ ...SAME_ORIGIN, origin }));
      expect(response.status, origin).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("takes the configured site URL as our origin behind a proxy", async () => {
    const site = new URL(getSiteUrl());
    const response = await POST(
      post({ ...SAME_ORIGIN, host: "internal:8080", origin: site.origin }),
    );
    expect(response.status).toBe(204);
  });

  it("refuses a malformed body (400) and sets nothing", async () => {
    const bodies: (string | null)[] = [
      null,
      "",
      "{",
      "[]",
      JSON.stringify({ playerId: PLAYER }),
      JSON.stringify({ secret: SECRET }),
      JSON.stringify({ playerId: "not-a-uuid", secret: SECRET }),
      JSON.stringify({ playerId: PLAYER, secret: "too-short" }),
      JSON.stringify({
        playerId: PLAYER,
        secret: SECRET,
        pad: "x".repeat(2000),
      }),
    ];
    for (const body of bodies) {
      const response = await POST(post(SAME_ORIGIN, body));
      expect(response.status, String(body)).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
    }
  });

  it("refuses a body that isn't JSON (a form post, text/plain) with 400", async () => {
    for (const type of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      const response = await POST(
        post({ ...SAME_ORIGIN, "content-type": type }),
      );
      expect(response.status, type).toBe(400);
    }
    expect((await POST(post(without("content-type")))).status).toBe(400);
  });

  it("checks the origin before it reads the body", async () => {
    const response = await POST(
      post({ ...SAME_ORIGIN, "sec-fetch-site": "cross-site" }, "{"),
    );
    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/identity", () => {
  it("expires the cookie (204)", async () => {
    const response = await DELETE(remove());
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual([
      "__Host-pid=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
    ]);
  });

  it("refuses a cross-site request or a foreign Origin (403)", async () => {
    for (const headers of [
      { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" },
      without("sec-fetch-site"),
      without("origin"),
      { ...SAME_ORIGIN, origin: "https://evil.example" },
    ]) {
      const response = await DELETE(remove(headers));
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });
});
