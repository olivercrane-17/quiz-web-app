import { test as base, expect } from "@playwright/test";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** True for http(s) and ws(s) URLs that leave this machine. */
function isExternal(url: URL): boolean {
  return (
    /^(?:https?|wss?):$/.test(url.protocol) && !LOCAL_HOSTS.has(url.hostname)
  );
}

interface Fixtures {
  /**
   * Console errors and uncaught exceptions seen by the page. Every test fails
   * if this list is not empty when it finishes. A test that expects an error
   * should assert on it and then remove it from the list.
   */
  consoleErrors: string[];
  /**
   * Requests and WebSockets the page tried to open to anything but the app
   * under test. They are aborted, and every test fails if this list is not
   * empty when it finishes. E2E runs use the mock backend, so a real
   * Supabase call, a CDN font or a third-party script is a bug, even on CI
   * runners that could reach the host. Real-backend tests need their own
   * Playwright config.
   *
   * Requests sent by a service worker bypass Playwright routing. Once the
   * app registers one, set `serviceWorkers: "block"` in specs that rely on
   * this guard.
   */
  externalRequests: string[];
}

/** Use this `test` (not the one from @playwright/test) in every spec. */
export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(`console.error: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        errors.push(`uncaught exception: ${error.message}`);
      });

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
});

export { expect };
