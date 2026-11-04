/**
 * Builds PWA-0's spike worker into public/sw.js, or removes it again.
 *
 *   node scripts/pwa/spike/build.mts           serwist build, from the build in .next/
 *   node scripts/pwa/spike/build.mts --clean   deletes the spike's public/sw.js
 *
 * The chain the spike proves (ARCHITECTURE §10.7), by hand:
 *
 *   npm run build                        next build
 *   node scripts/pwa/spike/build.mts     serwist build, after next build
 *   npx next start --port 3999           reads public/ when it starts, so it serves /sw.js
 *
 * e2e/pwa/spike.spec.ts runs the last two steps itself, on the build its
 * web server made, and deletes the worker when it is done. A worker left
 * behind is harmless to the app (nothing registers it) but ESLint would
 * lint it, so remove it with --clean.
 *
 * This script only ever writes or deletes a public/sw.js that starts with
 * the spike's banner. Any other worker there is PWA-1's, written by its
 * `npm run build`: the spike has then served its purpose, so this script
 * refuses to run and the spec skips itself until scripts/pwa/spike and
 * e2e/pwa/spike.spec.ts are deleted (PWA-1's Owns leave them out).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isSpikeWorker } from "./marker.mts";
import { DIST_DIR, shellPrecacheOf } from "./precache.mts";

const CONFIG_FILE = path.join(import.meta.dirname, "serwist.config.mts");

/** Where `next start` serves /sw.js from. */
export function workerFileOf(projectDir: string): string {
  return path.join(projectDir, "public", "sw.js");
}

/** Throws unless public/sw.js is absent or one the spike built. */
export function assertNoForeignWorker(projectDir: string): void {
  const worker = workerFileOf(projectDir);
  if (!existsSync(worker) || isSpikeWorker(readFileSync(worker, "utf8"))) {
    return;
  }
  throw new Error(
    "public/sw.js is not the spike's worker, so PWA-1's has landed. The spike is retired: delete scripts/pwa/spike and e2e/pwa/spike.spec.ts.",
  );
}

export interface SpikeBuild {
  /** Precache entries the worker carries: shells, static files and extra URLs. */
  readonly entries: number;
  /** The worker's size in bytes. */
  readonly workerBytes: number;
  /** `static/...` references the chunk walk could not resolve (normally none). */
  readonly unresolved: readonly string[];
  /** What `serwist build` printed. */
  readonly log: string;
}

/** Runs `serwist build` with ./serwist.config.mts, then checks what it wrote. */
export function buildSpikeWorker(projectDir: string): SpikeBuild {
  if (!existsSync(path.join(projectDir, DIST_DIR, "BUILD_ID"))) {
    throw new Error(
      `there is no production build in ${DIST_DIR}/. Run "npm run build" first.`,
    );
  }
  assertNoForeignWorker(projectDir);

  const require = createRequire(import.meta.url);
  const cli = path.join(
    path.dirname(require.resolve("@serwist/cli/package.json")),
    "cli.js",
  );
  const result = spawnSync(process.execPath, [cli, "build", CONFIG_FILE], {
    cwd: projectDir,
    encoding: "utf8",
    env: {
      ...process.env,
      // Minified, as the deployed worker will be.
      NODE_ENV: "production",
      // The CLI would otherwise ask the npm registry for a newer version.
      NO_UPDATE_NOTIFIER: "1",
    },
  });
  const log = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`serwist build failed (exit ${result.status}):\n${log}`);
  }

  const worker = readFileSync(workerFileOf(projectDir), "utf8");
  if (!isSpikeWorker(worker)) {
    throw new Error("public/sw.js does not start with the spike's banner.");
  }
  if (worker.includes("__SW_MANIFEST")) {
    throw new Error(
      "the precache list was not injected: public/sw.js still reads self.__SW_MANIFEST.",
    );
  }
  const plan = shellPrecacheOf(projectDir);
  const urls = [...plan.files.map(({ url }) => url), ...plan.extraUrls];
  const absent = urls.filter((url) => !worker.includes(JSON.stringify(url)));
  if (absent.length > 0) {
    throw new Error(
      `public/sw.js has no precache entry for ${absent.join(", ")}.`,
    );
  }
  return {
    entries: urls.length,
    workerBytes: Buffer.byteLength(worker),
    unresolved: plan.unresolved,
    log,
  };
}

/**
 * Deletes the spike's public/sw.js (and its source map), then public/ if
 * that leaves it empty. A worker the spike didn't build stays. Returns the
 * paths it deleted, relative to the project.
 */
export function removeSpikeWorker(projectDir: string): string[] {
  const worker = workerFileOf(projectDir);
  if (!existsSync(worker) || !isSpikeWorker(readFileSync(worker, "utf8"))) {
    return [];
  }
  const removed: string[] = [];
  for (const file of [worker, `${worker}.map`]) {
    if (existsSync(file)) {
      rmSync(file);
      removed.push(path.relative(projectDir, file));
    }
  }
  const publicDir = path.dirname(worker);
  if (readdirSync(publicDir).length === 0) {
    rmSync(publicDir, { recursive: true });
    removed.push(path.relative(projectDir, publicDir));
  }
  return removed;
}

function main(argv: readonly string[]): void {
  const projectDir = path.resolve(import.meta.dirname, "..", "..", "..");
  if (argv.includes("--clean")) {
    const removed = removeSpikeWorker(projectDir);
    console.log(
      removed.length > 0
        ? `pwa spike: removed ${removed.join(", ")}`
        : "pwa spike: no spike worker to remove",
    );
    return;
  }
  const build = buildSpikeWorker(projectDir);
  console.log(build.log);
  for (const reference of build.unresolved) {
    console.warn(`pwa spike: no file for the reference ${reference}`);
  }
  console.log(
    `pwa spike: public/sw.js (${(build.workerBytes / 1000).toFixed(1)} kB) precaches ${build.entries} URLs for the practice shell.`,
  );
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(
      `pwa spike: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
