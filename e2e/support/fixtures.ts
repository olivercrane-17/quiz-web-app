/**
 * The Playwright fixtures every spec gets (ARCHITECTURE §11.4), through
 * e2e/fixtures.ts:
 *
 * - `consoleErrors` and `externalRequests` guard every test: it fails if the
 *   page logged an error or tried to reach anything but the app under test.
 * - `mock` is the page's mock backend controls (`window.__qzMock`), typed.
 */
import { test as base, expect, type Page } from "@playwright/test";

import { mockControls, type RemoteMockControls } from "./mock";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** True for http(s) and ws(s) URLs that leave this machine. */
function isExternal(url: URL): boolean {
  return (
    /^(?:https?|wss?):$/.test(url.protocol) && !LOCAL_HOSTS.has(url.hostname)
  );
}

export interface Fixtures {
  /**
   * Console errors and uncaught exceptions seen by any page of the test's
   * context: `page`, and every page a test opens beside it (the devices of
   * ./devices.ts), plus the mock backend's own `[mock]` warnings, which
   * mean a spec's setup didn't hold. Every test fails if this list is not
   * empty when it finishes. A test that expects an error should assert on
   * it and then remove it from the list (see ./network.ts for the offline
   * cases).
   */
  consoleErrors: string[];
  /**
   * Requests and WebSockets the page tried to open to anything but the app
   * under test. They are aborted, and every test fails if this list is not
   * empty when it finishes. E2E runs use the mock backend, so a real
   * Supabase call, a CDN font or a third-party script is a bug, even on CI
   * runners that could reach the host. Real-backend tests have their own
   * config (playwright.real.config.ts).
   *
   * Requests sent by a service worker bypass Playwright routing, which is
   * why playwright.config.ts blocks service workers in every project except
   * pwa-chromium.
   */
  externalRequests: string[];
  /**
   * The mock backend's controls for `page`, each call made inside the page
   * once the backend has loaded. Use mockInit() from ./mock.ts for anything
   * that must hold from the first render.
   */
  mock: RemoteMockControls;
}

/** Use this `test` (not the one from @playwright/test) in every spec. */
export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page, context }, use) => {
      const errors: string[] = [];
      const watch = (target: Page) => {
        target.on("console", (message) => {
          if (message.type() === "error") {
            errors.push(`console.error: ${message.text()}`);
          } else if (
            message.type() === "warning" &&
            message.text().startsWith("[mock]")
          ) {
            // The mock warns only when a spec's setup can't hold, such as
            // a mockInit scenario that today's fixture Daily can't host.
            errors.push(`mock warning: ${message.text()}`);
          }
        });
        target.on("pageerror", (error) => {
          errors.push(`uncaught exception: ${error.message}`);
        });
      };
      watch(page);
      context.on("page", watch);

      await use(errors);

      expect(errors, "the page logged errors").toEqual([]);
    },
    { auto: true },
  ],
  externalRequests: [
    async ({ context }, use) => {
      const blocked: string[] = [];
      await context.route(isExternal, async (route) => {
        blocked.push(`request: ${route.request().url()}`);
        await route.abort("blockedbyclient");
      });
      await context.routeWebSocket(isExternal, async (ws) => {
        blocked.push(`websocket: ${ws.url()}`);
        await ws.close();
      });

      await use(blocked);

      expect(blocked, "the page tried to reach an external host").toEqual([]);
    },
    { auto: true },
  ],
  mock: async ({ page }, provide) => {
    await provide(mockControls(page));
  },
});

export { expect };
