/**
 * What PWA-0's spike worker precaches: the practice shell (ARCHITECTURE
 * §10.7), read from a production build in `.next/`.
 *
 * For each shell route the list holds:
 *
 * 1. its prerendered HTML (`.next/server/app/<route>.html`), which the
 *    worker fetches at install and keys by the file's hash;
 * 2. its first-load chunks, from `.next/diagnostics/route-bundle-stats.json`
 *    (the file `npm run check:bundle` reads);
 * 3. every `/_next/static/` file its HTML loads (stylesheets, scripts and
 *    preloads, but not `nomodule` polyfills, which modern browsers skip);
 * 4. every file those reach: Turbopack's async loaders name each lazy chunk
 *    as a `"static/chunks/<file>"` literal, so a walk over the chunk text
 *    finds the chunks behind every `import()` (the fixture practice pack is
 *    one), and stylesheets reach fonts and images through `url()`.
 *
 * `.next/diagnostics` records first-load chunks only, with no lazy-chunk
 * graph, so step 4 is how PWA-1 finds "every lazy chunk reachable from the
 * play routes" too. Same-origin URLs the HTML loads from outside
 * `/_next/static/` (the icon) are listed apart, since they have no file in
 * `.next/static/` to hash.
 *
 * The spike assumes Next's defaults, which next.config.ts keeps: the
 * `.next` dist directory, no basePath and no assetPrefix.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The shells the spike precaches: a practice run and its results (PRA-1). */
export const SPIKE_SHELL_ROUTES: readonly string[] = [
  "/practice/run",
  "/practice/results",
];

/** Next's build output, relative to the project directory. */
export const DIST_DIR = ".next";

const STATIC_URL_PREFIX = "/_next/static/";
const STATS_FILE = "diagnostics/route-bundle-stats.json";

/** One file to precache. */
export interface PrecacheFile {
  /** Relative to the project directory, with forward slashes: `.next/static/chunks/a.js`. */
  readonly file: string;
  /** The URL it is served at: `/_next/static/chunks/a.js`, or the route for a shell. */
  readonly url: string;
}

export interface ShellPrecache {
  /** Every file to precache, shells first, then static files by URL. */
  readonly files: readonly PrecacheFile[];
  /** Same-origin URLs the shells load from outside `/_next/static/` (the icon), sorted. */
  readonly extraUrls: readonly string[];
  /**
   * `static/...` references in the build that name no file. A consistent
   * build has none; anything here is either a false match in minified code
   * or a chunk Turbopack never wrote, so the builder prints them.
   */
  readonly unresolved: readonly string[];
}

/** The URL a file under `.next/static/` is served at. */
export function staticUrlOf(distRelative: string): string {
  if (!distRelative.startsWith("static/")) {
    throw new Error(`${distRelative} is not under static/.`);
  }
  return `/_next/${distRelative}`;
}

/** The prerendered HTML of `route`, relative to the dist directory. */
export function shellHtmlOf(route: string): string {
  if (!route.startsWith("/")) throw new Error(`${route} is not a route path.`);
  return route === "/"
    ? "server/app/index.html"
    : `server/app${route.replace(/\/$/, "")}.html`;
}

interface RouteBundleStats {
  readonly route: string;
  readonly firstLoadChunkPaths: readonly string[];
}

function isRouteBundleStats(value: unknown): value is RouteBundleStats {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.route === "string" &&
    Array.isArray(entry.firstLoadChunkPaths) &&
    entry.firstLoadChunkPaths.every((chunk) => typeof chunk === "string")
  );
}

/** Forward slashes, no leading `./`. */
function toPosix(file: string): string {
  return file.split(path.sep).join("/").replace(/^\.\//, "");
}

/**
 * Every route's first-load chunks, relative to the dist directory
 * (`static/chunks/a.js`). The stats file lists them relative to the
 * project directory, as `.next/static/chunks/a.js`.
 */
export function firstLoadChunksByRoute(
  projectDir: string,
): Map<string, string[]> {
  const statsPath = path.join(projectDir, DIST_DIR, STATS_FILE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(statsPath, "utf8"));
  } catch (error) {
    throw new Error(
      `could not read ${DIST_DIR}/${STATS_FILE} (${(error as Error).message}). Run "next build" first.`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed) || !parsed.every(isRouteBundleStats)) {
    throw new Error(
      `${DIST_DIR}/${STATS_FILE} is not a list of { route, firstLoadChunkPaths }. Has its format changed?`,
    );
  }
  const prefix = `${DIST_DIR}/`;
  return new Map(
    parsed.map(({ route, firstLoadChunkPaths }) => [
      route,
      firstLoadChunkPaths.map((chunk) => {
        const posix = toPosix(chunk);
        if (!posix.startsWith(prefix)) {
          throw new Error(
            `${route}'s first-load chunk ${chunk} is outside ${DIST_DIR}/.`,
          );
        }
        return posix.slice(prefix.length);
      }),
    ]),
  );
}

/** The first-load chunks of `route`, as firstLoadChunksByRoute() gives them. */
export function firstLoadChunksOf(projectDir: string, route: string): string[] {
  const chunks = firstLoadChunksByRoute(projectDir).get(route);
  if (chunks === undefined) {
    throw new Error(`${DIST_DIR}/${STATS_FILE} has no entry for ${route}.`);
  }
  return chunks;
}

/** The `<link rel>` values whose targets a shell needs before it can render offline. */
const LINK_RELS = new Set([
  "stylesheet",
  "preload",
  "modulepreload",
  "icon",
  "shortcut icon",
  "apple-touch-icon",
  "manifest",
]);

const TAG = /<(script|link)\b[^>]*>/gi;
const ATTRIBUTE =
  /\s([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase();
    if (name === undefined) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(name, value.replace(/&amp;/g, "&"));
  }
  return attributes;
}

export interface HtmlAssets {
  /** `/_next/static/` URLs, without query or hash. */
  readonly staticUrls: readonly string[];
  /** Other same-origin URLs (path plus query), such as `/icon.svg?icon.abc.svg`. */
  readonly otherUrls: readonly string[];
}

/** The same-origin assets a shell's HTML loads. Cross-origin URLs are left out. */
export function assetsOfHtml(html: string): HtmlAssets {
  const staticUrls = new Set<string>();
  const otherUrls = new Set<string>();
  for (const match of html.matchAll(TAG)) {
    const tag = match[0];
    const attributes = attributesOf(tag);
    let target: string | undefined;
    if (match[1]?.toLowerCase() === "script") {
      if (attributes.has("nomodule")) continue;
      target = attributes.get("src");
    } else {
      const rel = attributes.get("rel")?.toLowerCase().trim();
      if (rel === undefined || !LINK_RELS.has(rel)) continue;
      target = attributes.get("href");
    }
    // Same-origin paths only: "//host/..." and "https://..." are other origins.
    if (
      target === undefined ||
      !target.startsWith("/") ||
      target.startsWith("//")
    ) {
      continue;
    }
    const url = new URL(target, "http://shell.invalid");
    if (url.pathname.startsWith(STATIC_URL_PREFIX)) {
      if (url.search !== "") {
        // Next adds ?dpl=<id> to static URLs when a deployment id is set.
        // The precache would then need that query in its keys too.
        throw new Error(
          `${target} carries a query string, which the spike's precache keys do not model (is a deploymentId set?).`,
        );
      }
      staticUrls.add(url.pathname);
    } else {
      otherUrls.add(url.pathname + url.search);
    }
  }
  return { staticUrls: [...staticUrls], otherUrls: [...otherUrls] };
}

/** A `static/...` path named in chunk text, e.g. `"static/chunks/2kezf1-_uel06.js"`. */
const CHUNK_REFERENCE =
  /static\/(?:chunks|media|css)\/[\w.~@%+-]+(?:\/[\w.~@%+-]+)*/g;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g;

/** The `static/...` paths a stylesheet's `url()`s point at, resolved against the sheet's URL. */
function cssReferences(css: string, sheet: string): string[] {
  const base = new URL(staticUrlOf(sheet), "http://shell.invalid");
  const found: string[] = [];
  for (const match of css.matchAll(CSS_URL)) {
    const reference = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (
      reference === "" ||
      /^(?:data|blob):/i.test(reference) ||
      reference.startsWith("#")
    ) {
      continue;
    }
    const url = new URL(reference, base);
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(STATIC_URL_PREFIX)
    ) {
      continue;
    }
    try {
      found.push(decodeURIComponent(url.pathname).slice("/_next/".length));
    } catch {
      // A malformed %-escape names no file.
    }
  }
  return found;
}

/** `reference` as a path under `static/`, or null when it leaves that directory. */
function underStatic(reference: string): string | null {
  const normalized = path.posix.normalize(reference);
  return normalized.startsWith("static/") ? normalized : null;
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Every `static/...` file reachable from `seeds` (paths relative to the dist
 * directory) through chunk references and stylesheet `url()`s, seeds
 * included.
 */
export function walkStaticReferences(
  projectDir: string,
  seeds: Iterable<string>,
): { files: Set<string>; unresolved: Set<string> } {
  const distDir = path.join(projectDir, DIST_DIR);
  const files = new Set<string>();
  const unresolved = new Set<string>();
  const queue = [...seeds];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (files.has(next)) continue;
    const absolute = path.join(distDir, next);
    if (!isFile(absolute)) {
      unresolved.add(next);
      continue;
    }
    files.add(next);
    let references: string[] = [];
    if (/\.m?js$/.test(next)) {
      references = readFileSync(absolute, "utf8").match(CHUNK_REFERENCE) ?? [];
    } else if (next.endsWith(".css")) {
      references = cssReferences(readFileSync(absolute, "utf8"), next);
    }
    for (const reference of references) {
      const file = underStatic(reference);
      if (file === null) {
        unresolved.add(reference);
      } else if (!files.has(file)) {
        queue.push(file);
      }
    }
  }
  return { files, unresolved };
}

/**
 * The precache list for `routes`, from the build in `projectDir/.next`.
 * Throws when the build can't back a shell: a route that isn't
 * prerendered, has no stats entry, or loads a file that isn't there.
 */
export function shellPrecacheOf(
  projectDir: string,
  routes: readonly string[] = SPIKE_SHELL_ROUTES,
): ShellPrecache {
  const distDir = path.join(projectDir, DIST_DIR);
  const firstLoad = firstLoadChunksByRoute(projectDir);
  const shells: PrecacheFile[] = [];
  const seeds = new Set<string>();
  const extraUrls = new Set<string>();

  for (const route of routes) {
    const html = shellHtmlOf(route);
    const htmlPath = path.join(distDir, html);
    if (!isFile(htmlPath)) {
      throw new Error(
        `${route} has no prerendered HTML at ${DIST_DIR}/${html}: is it still a static shell (ARCHITECTURE §10.1)?`,
      );
    }
    shells.push({ file: `${DIST_DIR}/${html}`, url: route });

    const chunks = firstLoad.get(route);
    if (chunks === undefined) {
      throw new Error(`${DIST_DIR}/${STATS_FILE} has no entry for ${route}.`);
    }
    const assets = assetsOfHtml(readFileSync(htmlPath, "utf8"));
    const direct = [
      ...chunks,
      ...assets.staticUrls.map((url) => url.slice("/_next/".length)),
    ];
    for (const file of direct) {
      if (!isFile(path.join(distDir, file))) {
        throw new Error(
          `${route} loads ${file}, which the build in ${DIST_DIR}/ does not have.`,
        );
      }
      seeds.add(file);
    }
    for (const url of assets.otherUrls) extraUrls.add(url);
  }

  const { files, unresolved } = walkStaticReferences(projectDir, seeds);
  const statics = [...files]
    .map((file) => ({ file: `${DIST_DIR}/${file}`, url: staticUrlOf(file) }))
    .sort((a, b) => a.url.localeCompare(b.url));
  return {
    files: [...shells, ...statics],
    extraUrls: [...extraUrls].sort(),
    unresolved: [...unresolved].sort(),
  };
}
