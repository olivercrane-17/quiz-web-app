import { expect, test } from "./fixtures";

test.describe("smoke", () => {
  test("home page loads with a heading and no console errors", async ({
    page,
    consoleErrors,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("html")).toHaveAttribute("lang", /\S/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Let hydration and any late scripts finish before checking the console.
    await page.waitForLoadState("networkidle");
    expect(consoleErrors).toEqual([]);
  });

  // The exact values, path by path, are e2e/security/headers.spec.ts's.
  test("responses carry the security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["content-security-policy"]).toMatch(
      /^default-src 'self'; .*frame-ancestors 'none'/,
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
