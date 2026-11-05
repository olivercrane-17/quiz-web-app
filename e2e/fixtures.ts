/**
 * Where every spec takes `test` and `expect` from. The fixtures and the
 * helpers of ARCHITECTURE §11.4 live in ./support/: mock.ts (mockInit,
 * mockControls), clock.ts (setClock), devices.ts, network.ts, axe.ts
 * (expectNoSeriousAxe) and sealed.ts (expectSealedPayloads).
 */
export { expect, test, type Fixtures } from "./support/fixtures";
