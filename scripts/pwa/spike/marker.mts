/**
 * The first line of every worker the spike builds. build.mts checks for it
 * before it overwrites or deletes public/sw.js, so it only ever touches its
 * own output, and the spec checks that `next start` serves it at /sw.js.
 */
export const SPIKE_BANNER =
  "/* qz:pwa-spike (PWA-0): throwaway worker from scripts/pwa/spike. PWA-1 replaces it. */";

/** True when `source` is a worker the spike built. */
export function isSpikeWorker(source: string): boolean {
  return source.startsWith(SPIKE_BANNER);
}
