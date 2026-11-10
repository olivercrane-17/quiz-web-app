/**
 * What `late.ts` loads apart from the rounds: nothing here is on a round's
 * first screen, and a reveal shows without it. Never import this file, or the
 * modules it names, any other way: `NumberLine` carries the marker that
 * check:lazy looks for in every route's first load.
 */
export { NumberLine } from "../encore/number-line";
export { CrowdChart } from "./crowd";
