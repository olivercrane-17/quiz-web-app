// @vitest-environment node
// Route handlers run on the server (ARCHITECTURE §9.3, IDN-1's acceptance).
import { describe, expect, it } from "vitest";

import { GET } from "./route";

const ORIGIN = "http://127.0.0.1:3217";
const PLAYER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECRET = "kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w";
const COOKIE = `__Host-pid=v1.${PLAYER}.${SECRET}`;

function restore(headers: Record<string, string>): Request {
  return new Request(`${ORIGIN}/api/restore`, { headers });
}

describe("GET /api/restore", () => {
  it("AC-CKE-03 returns 403 when Sec-Fetch-Site is cross-site or missing", async () => {
    const crossSite = await GET(
      restore({ "sec-fetch-site": "cross-site", cookie: COOKIE }),
    );
    expect(crossSite.status).toBe(403);
    expect(await crossSite.text()).toBe("");
    const missing = await GET(restore({ cookie: COOKIE }));
    expect(missing.status).toBe(403);
    expect(await missing.text()).toBe("");
  });

  it("returns 403 for any other value too, the secret never in it", async () => {
    for (const site of ["same-site", "none", "SAME-ORIGIN", ""]) {
      const response = await GET(
        restore({ "sec-fetch-site": site, cookie: COOKIE }),
      );
      expect(response.status, site).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).not.toContain(SECRET);
    }
  });

  it("returns the identity from a valid cookie (200, no-store)", async () => {
    const response = await GET(
      restore({
        "sec-fetch-site": "same-origin",
        cookie: `theme=dark; ${COOKIE}`,
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ playerId: PLAYER, secret: SECRET });
    // Reading sets nothing.
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 204 without a cookie, or with one that isn't ours", async () => {
    for (const cookie of [
      undefined,
      "theme=dark",
      "__Host-pid=",
      `__Host-pid=v2.${PLAYER}.${SECRET}`,
      `__Host-pid=v1.${PLAYER}.short`,
      `pid=v1.${PLAYER}.${SECRET}`,
    ]) {
      const response = await GET(
        restore({
          "sec-fetch-site": "same-origin",
          ...(cookie === undefined ? {} : { cookie }),
        }),
      );
      expect(response.status, String(cookie)).toBe(204);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
    }
  });
});
