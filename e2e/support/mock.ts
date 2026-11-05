/**
 * The mock backend from a spec (ARCHITECTURE §7.4, §11.4).
 *
 * ```ts
 * await mockInit(page, { scenario: "finished_today", seed: "ac-dly-07" }); // before page.goto
 * const mock = mockControls(page);          // or the `mock` fixture
 * await mock.failNext("sealed.act", "unreachable", { times: 2 });
 * const attempts = await mock.inspect<Record<string, unknown>>("attempts");
 * ```
 *
 * Only types come from src/backend/mock: the controls themselves run inside
 * the page, in the build under test.
 */
import type { Page } from "@playwright/test";

import type {
  MockControls,
  MockInit,
  MockMethod,
  MockScenario,
} from "../../src/backend/mock";

export type { MockControls, MockInit, MockMethod, MockScenario };

/**
 * Sets `window.__QZ_MOCK_INIT__` for every document the page loads from now
 * on, so a scenario, the RNG seed, injected failures, latency and the
 * realtime state hold from the very first render. Call it before
 * `page.goto`. A scenario seeds an empty mock database only, so a reload
 * keeps whatever the test played since.
 */
export async function mockInit(page: Page, init: MockInit): Promise<void> {
  await page.addInitScript((value) => {
    (window as unknown as { __QZ_MOCK_INIT__: unknown }).__QZ_MOCK_INIT__ =
      value;
  }, init);
}

type Remote<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : never;

/** MockControls with every call answered as a promise, since it runs in the page. */
export type RemoteMockControls = {
  [K in Exclude<keyof MockControls, "inspect">]: Remote<MockControls[K]>;
} & {
  /** Read-only, e.g. 'attempts' or 'attempts.<id>.rounds.0'. */
  inspect<T = unknown>(path: string): Promise<T>;
};

const METHODS = [
  "reset",
  "seed",
  "failNext",
  "setLatency",
  "setReachable",
  "setRealtime",
  "setShed",
  "addFinishers",
  "setServiceState",
  "addIncident",
  "inspect",
  "responses",
] as const satisfies readonly (keyof MockControls)[];

// A control added to MockControls must be listed above, or this fails to compile.
const EVERY_CONTROL_LISTED: [
  Exclude<keyof MockControls, (typeof METHODS)[number]>,
] extends [never]
  ? true
  : never = true;
void EVERY_CONTROL_LISTED;

export interface MockControlsOptions {
  /** How long to wait for the page to load its backend; default 10 s. */
  timeout?: number;
}

/**
 * A typed proxy to the page's `window.__qzMock`. Each call waits until the
 * page has loaded its backend (the app loads it lazily, the first time an
 * island needs it), then runs inside the page. Calls made before any page
 * loads can't reach a mock; use mockInit() for those.
 */
export function mockControls(
  page: Page,
  options: MockControlsOptions = {},
): RemoteMockControls {
  const timeout = options.timeout ?? 10_000;

  async function call(method: string, args: unknown[]): Promise<unknown> {
    try {
      await page.waitForFunction(() => "__qzMock" in window, undefined, {
        timeout,
      });
    } catch (error) {
      throw new Error(
        `window.__qzMock did not appear within ${timeout} ms, so mock.${method}() could not run. Is this a mock build (NEXT_PUBLIC_BACKEND_MODE=mock), and has the page asked for its backend yet?`,
        { cause: error },
      );
    }
    return page.evaluate(
      async ([name, values]) => {
        const controls = (
          window as unknown as {
            __qzMock: Record<string, (...args: unknown[]) => unknown>;
          }
        ).__qzMock;
        const control = controls[name];
        if (typeof control !== "function") {
          throw new Error(`the mock has no control named ${name}`);
        }
        return await control(...values);
      },
      [method, args] as const,
    );
  }

  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      (...args: unknown[]) => call(method, args),
    ]),
  ) as unknown as RemoteMockControls;
}
