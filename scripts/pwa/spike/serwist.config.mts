/**
 * The `serwist build` configuration for PWA-0's spike worker: Serwist's
 * post-build CLI mode (@serwist/cli 9.5.13, the "configurator mode" of
 * ARCHITECTURE D15), run after `next build`. scripts/pwa/spike/build.mts
 * runs it; by hand, from the project directory (the CLI's working
 * directory is the project it builds for):
 *
 *   node node_modules/@serwist/cli/cli.js build scripts/pwa/spike/serwist.config.mts
 *
 * It precaches the practice shell that ./precache.mts reads from `.next/`.
 * The CLI hashes each globbed file for its revision, then the transform
 * below gives every file its URL and fails the build if any planned file
 * went missing, because the CLI reports a pattern that matched nothing as a
 * warning and carries on. Serwist's own Next.js helper
 * (`@serwist/next/config`) globs every file in `.next/static/` and every
 * prerendered page instead; it is not a dependency, and the narrow list is
 * what proves the chunk walk.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@serwist/cli";

import { SPIKE_BANNER } from "./marker.mts";
import { DIST_DIR, shellPrecacheOf } from "./precache.mts";

const projectDir = process.cwd();
const shell = shellPrecacheOf(projectDir);
const buildId = readFileSync(
  path.join(projectDir, DIST_DIR, "BUILD_ID"),
  "utf8",
).trim();
const urlOfFile = new Map(shell.files.map(({ file, url }) => [file, url]));

/** A literal path as a glob pattern: glob's special characters escaped. */
function literalGlob(file: string): string {
  return file.replace(/[\\*?[\]{}()!+@]/g, "\\$&");
}

const config: BuildOptions = {
  swSrc: path.join(import.meta.dirname, "sw.ts"),
  swDest: path.join(projectDir, "public", "sw.js"),
  globDirectory: projectDir,
  globPatterns: shell.files.map(({ file }) => literalGlob(file)),
  // Every file under .next/static/ has a content hash in its name (Next
  // serves them as immutable), so its URL is its revision.
  dontCacheBustURLsMatching: new RegExp(`^${DIST_DIR}/static/`),
  manifestTransforms: [
    async (entries) => {
      const manifest = entries.map((entry) => {
        const url = urlOfFile.get(entry.url);
        if (url === undefined) {
          throw new Error(`${entry.url} was globbed but is not in the plan.`);
        }
        return { ...entry, url };
      });
      const globbed = new Set(entries.map((entry) => entry.url));
      const missing = shell.files.filter(({ file }) => !globbed.has(file));
      if (missing.length > 0) {
        throw new Error(
          `these planned files were not globbed: ${missing.map(({ file }) => file).join(", ")}`,
        );
      }
      return { manifest, warnings: [] };
    },
  ],
  // The icon has no file in .next/static/. Next puts a content hash in its
  // query, so the URL is its revision; anything without one is revisioned
  // by the build id.
  additionalPrecacheEntries: shell.extraUrls.map((url) => ({
    url,
    revision: url.includes("?") ? null : buildId,
  })),
  esbuildOptions: {
    // Marks the output as the spike's, so build.mts never overwrites or
    // deletes a worker it didn't write (PWA-1's, once it lands).
    banner: { js: SPIKE_BANNER },
  },
};

export default config;
