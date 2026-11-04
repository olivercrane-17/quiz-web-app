/**
 * Several devices in one browser context (ARCHITECTURE §6.2, §11.4). In mock
 * builds a page that sets `window.__QZ_DEVICE__` before it loads gets its
 * own storage namespace (`qz:d:<device>:`), so it has its own identity and
 * seat token, while every page shares the one mock database (localStorage
 * and Web Locks) and its hints (BroadcastChannel). That is how room specs
 * run a host and five phones in one context.
 *
 * ```ts
 * const host = await openDevice(context, "host", "host");
 * const phones = await Promise.all(
 *   [1, 2, 3].map((n) => openDevice(context, `phone-${n}`, "phone")),
 * );
 * ```
 */
import type { BrowserContext, Page } from "@playwright/test";

/** The host screen's viewport (a laptop or a TV). */
export const HOST_VIEWPORT = { width: 1280, height: 720 } as const;
/** A phone's viewport. */
export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;

const DEVICE_NAME = /^[a-z\d][a-z\d-]{0,31}$/;

/**
 * Gives `page` its own device namespace from its next navigation on. Call
 * it before `page.goto`. Device names are lowercase letters, digits and
 * hyphens ("phone-3").
 */
export async function setDevice(page: Page, device: string): Promise<void> {
  if (!DEVICE_NAME.test(device)) {
    throw new Error(
      `"${device}" is not a device name: use lowercase letters, digits and hyphens, such as "phone-3".`,
    );
  }
  await page.addInitScript((name) => {
    (window as unknown as { __QZ_DEVICE__: string }).__QZ_DEVICE__ = name;
  }, device);
}

/**
 * A new page in `context` that acts as its own device: the host screen at
 * 1280 by 720, or a phone at 390 by 844. Console errors on it fail the test
 * like the main page's do (e2e/support/fixtures.ts watches every page of
 * the context).
 */
export async function openDevice(
  context: BrowserContext,
  device: string,
  kind: "host" | "phone",
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize(kind === "host" ? HOST_VIEWPORT : PHONE_VIEWPORT);
  await setDevice(page, device);
  return page;
}
