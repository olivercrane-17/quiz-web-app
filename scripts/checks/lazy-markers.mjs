/**
 * Two checks on a production build, run after `next build` with
 * `npm run check:lazy` (CI's verify job runs it right after the build).
 *
 * 1. **Lazy markers** (ARCHITECTURE §10.9 item 4). A lazy-only module of
 *    ours carries the string `__qz_lazy_<name>__` and loads with import(),
 *    so the check fails when any route's first-load chunks
 *    (.next/diagnostics/route-bundle-stats.json) hold a marker: someone
 *    imported the module statically. Every marker declared in a string
 *    literal under src/ must also sit in some client chunk, because one the
 *    minifier dropped, or a module nothing imports, would pass while
 *    proving nothing.
 *
 *    Packages can't carry our marker, so each lazy-only package is found by
 *    a string its built code always holds, derived from the installed
 *    version. The Supabase SDK (`@supabase/supabase-js`, loaded only by the
 *    one `import("@supabase/supabase-js")` in src/backend/supabase/client.ts)
 *    names itself in the client headers it sends, `supabase-js/<version>`
 *    and `realtime-js/<version>`. Neither may be in a first load, and a
 *    Supabase build must hold both somewhere, so an SDK release that changes
 *    them fails here instead of quietly turning the check off.
 *
 * 2. **The sealed-content scan** (§5.4, PRD AC-CNT-07). No file under
 *    .next/static, .next/server/app (prerendered pages and their payloads)
 *    or public/ may hold a sealed item id, by §5.4's pattern. `fx.` ids are
 *    fixtures, which mock builds ship on purpose, and the content guide's
 *    worked examples (batch 00, room sequences 90 to 99, CONTENT_GUIDE
 *    §12.0) are public and never bank content.
 *
 *    With --sealed it also decrypts content/sealed/ in memory, with the
 *    content key from QZ_CONTENT_KEY or the key file, and looks for every
 *    sealed text: Mystery clues, room question stems, Encore questions,
 *    explanations and claims. Texts match as whole tokens after
 *    normalizeName, AC-DLY-04's rule for names, once a file's JSON escapes
 *    and HTML entities are decoded. An Encore's answer matches by
 *    AC-DLY-04's number rules (by value in a JSON file's numbers, as a whole
 *    formatted token in text) wherever its question also appears. A number
 *    alone is no evidence: an answer of 12 matches every "12" in the app,
 *    while beside its question it gives the question away. For the same
 *    reason texts of fewer than four words are left out. A finding names
 *    the item, the field and the file, never the text (§5.4's output rule),
 *    and an error while loading sealed content prints nothing about it.
 *
 * Exit status 1 on any finding. The functions are exported for
 * scripts/checks/lazy-markers.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const STATS_FILE = ".next/diagnostics/route-bundle-stats.json";
/** Where `next build` records the configuration it built with, pinned public variables included. */
export const SERVER_FILES = ".next/required-server-files.json";
/** The client build: every chunk a browser can ever load is under here. */
export const CLIENT_DIR = ".next/static";
/** What the sealed scan reads (AC-CNT-07). */
export const SCAN_ROOTS = [".next/static", ".next/server/app", "public"];

/** The string a lazy-only module of ours carries: `__qz_lazy_<name>__`. */
const MARKER = /__qz_lazy_([a-z0-9]+(?:_[a-z0-9]+)*)__/g;
/** A marker inside a string literal: how a module declares one (a comment never reaches a chunk). */
const DECLARED_MARKER = /["'`](__qz_lazy_([a-z0-9]+(?:_[a-z0-9]+)*)__)["'`]/g;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec|bench)\.[cm]?[jt]sx?$/;

/**
 * Lazy-only packages, by the strings their built code always carries.
 * `requiredIn`: the backend modes whose builds must hold the string, which
 * proves it still matches what the package builds. Every build chunks all
 * three backends (src/backend/index.ts imports each with import()), but
 * only a Supabase build is sure to keep this one.
 */
export const PACKAGE_MARKERS = [
  {
    label: "the Supabase SDK",
    package: "@supabase/supabase-js",
    signature: (version) => `supabase-js/${version}`,
    requiredIn: ["supabase"],
  },
  {
    label: "the Supabase SDK's Realtime client",
    package: "@supabase/realtime-js",
    signature: (version) => `realtime-js/${version}`,
    requiredIn: ["supabase"],
  },
];

/** §5.4's sealed ids: Mysteries, Encores and room questions. */
const SEALED_ID = /(?<!fx\.)\b(m\.[a-z]+\.\d{4}|e\.\d{4}|r\.[a-z-]+\.\d{2})\b/g;
/** The content guide's worked examples (CONTENT_GUIDE §12.0), which the validator keeps out of content/. */
const RESERVED_EXAMPLE_ID = /^(?:m\.[a-z]+\.00\d\d|e\.00\d\d|r\.[a-z-]+\.9\d)$/;

/** Files the scan can't read as text; nothing sealed travels in a font or an image. */
const BINARY_EXTENSIONS = new Set(
  [
    "woff",
    "woff2",
    "ttf",
    "otf",
    "eot",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "ico",
    "bmp",
    "mp3",
    "ogg",
    "oga",
    "wav",
    "m4a",
    "aac",
    "flac",
    "mp4",
    "webm",
    "pdf",
    "zip",
    "gz",
    "br",
    "wasm",
  ].map((extension) => `.${extension}`),
);

/** Sealed texts shorter than this, in normalized words, are too common to be evidence. */
export const MIN_TEXT_WORDS = 4;

/** A failure the CLI prints as one line, without a stack. */
export class CheckError extends Error {}

const toPosix = (path) => path.split(sep).join("/");

/** Every file under `dir`, recursively, as absolute paths; none if it doesn't exist. */
function* filesUnder(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* filesUnder(path);
    else if (entry.isFile()) yield path;
  }
}

function readJson(path, what) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new CheckError(
      `could not read ${what} (${error.message}). Run "npm run build" first.`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CheckError(`${what} is not JSON. Has its format changed?`);
  }
}

/** The per-route first-load chunk lists of a Turbopack build. */
export function readRouteStats(root) {
  const stats = readJson(join(root, STATS_FILE), STATS_FILE);
  if (!Array.isArray(stats) || stats.length === 0) {
    throw new CheckError(
      `${STATS_FILE} lists no routes. Has its format changed?`,
    );
  }
  for (const row of stats) {
    if (
      typeof row?.route !== "string" ||
      !Array.isArray(row.firstLoadChunkPaths)
    ) {
      throw new CheckError(
        `${STATS_FILE} has a row without a route or a chunk list. Has its format changed?`,
      );
    }
  }
  return stats;
}

/**
 * The backend mode a build was made for, read the way src/lib/env-parse.ts
 * reads NEXT_PUBLIC_BACKEND_MODE (blank or unknown means supabase), or null
 * when the build doesn't say.
 */
export function buildBackendMode(root) {
  let files;
  try {
    files = JSON.parse(readFileSync(join(root, SERVER_FILES), "utf8"));
  } catch {
    return null;
  }
  const env = files?.config?.env;
  if (typeof env !== "object" || env === null) return null;
  const mode = String(env.NEXT_PUBLIC_BACKEND_MODE ?? "")
    .trim()
    .toLowerCase();
  return mode === "mock" || mode === "off" ? mode : "supabase";
}

/** The markers declared in string literals under `root`/src, by name, with the files declaring each. */
export function declaredMarkers(root) {
  const declared = new Map();
  const src = join(root, "src");
  for (const path of filesUnder(src)) {
    const rel = toPosix(relative(root, path));
    if (!SOURCE_FILE.test(path) || TEST_FILE.test(path)) continue;
    if (rel.includes("/__fixtures__/")) continue;
    for (const match of readFileSync(path, "utf8").matchAll(DECLARED_MARKER)) {
      const files = declared.get(match[2]) ?? [];
      if (!files.includes(rel)) files.push(rel);
      declared.set(match[2], files);
    }
  }
  return declared;
}

/** Each lazy-only package with the string to look for, from its installed version. */
export function packageSignatures(root, mode, markers = PACKAGE_MARKERS) {
  return markers.map((marker) => {
    const manifest = join(root, "node_modules", marker.package, "package.json");
    let version;
    try {
      version = JSON.parse(readFileSync(manifest, "utf8")).version;
    } catch {
      throw new CheckError(
        `could not read the version of ${marker.package}. Run "npm ci" first.`,
      );
    }
    return {
      label: marker.label,
      package: marker.package,
      text: marker.signature(version),
      required: mode !== null && marker.requiredIn.includes(mode),
    };
  });
}

/**
 * Lazy-only code in a first load: markers of ours (declared or not) and
 * package signatures, one problem per chunk and finding. Then every declared
 * marker, and every package a build of this mode must hold, has to be in
 * some client chunk. Returns the problems and a summary line.
 */
export function lazyMarkerProblems({ root, stats, declared, packages }) {
  const texts = new Map();
  const read = (path) => {
    let text = texts.get(path);
    if (text === undefined) {
      try {
        text = readFileSync(resolve(root, path), "utf8");
      } catch (error) {
        throw new CheckError(
          `could not read ${path}, a first-load chunk in ${STATS_FILE} (${error.message}). Is the build complete?`,
        );
      }
      texts.set(path, text);
    }
    return text;
  };

  /** Each first-load chunk with the routes that load it first. */
  const routesByChunk = new Map();
  for (const { route, firstLoadChunkPaths } of stats) {
    for (const chunk of firstLoadChunkPaths) {
      const routes = routesByChunk.get(chunk) ?? [];
      routes.push(route);
      routesByChunk.set(chunk, routes);
    }
  }

  const problems = [];
  for (const [chunk, routes] of routesByChunk) {
    const text = read(chunk);
    const where = `${chunk}, in the first load of ${routes.join(", ")}`;
    for (const name of new Set([...text.matchAll(MARKER)].map((m) => m[1]))) {
      const source = declared.get(name);
      problems.push(
        `the lazy-only marker __qz_lazy_${name}__${source ? ` (${source.join(", ")})` : ""} is in ${where}. Something imports that module statically: load it with import() or next/dynamic.`,
      );
    }
    for (const pkg of packages) {
      if (text.includes(pkg.text)) {
        problems.push(
          `${pkg.label} ("${pkg.text}") is in ${where}. Only import() may load ${pkg.package}.`,
        );
      }
    }
  }

  // Every lazy-only module and package the build should hold, somewhere.
  const client = [];
  for (const path of filesUnder(join(root, CLIENT_DIR))) {
    if (path.endsWith(".js")) client.push(readFileSync(path, "utf8"));
  }
  const inClient = (needle) => client.some((text) => text.includes(needle));
  for (const [name, files] of declared) {
    if (!inClient(`__qz_lazy_${name}__`)) {
      problems.push(
        `the marker __qz_lazy_${name}__ (${files.join(", ")}) is in no client chunk, so this check proves nothing for it: the minifier dropped it, or nothing imports the module. Keep the marker in code the module runs.`,
      );
    }
  }
  for (const pkg of packages) {
    if (pkg.required && !inClient(pkg.text)) {
      problems.push(
        `${pkg.label} should be in a lazy chunk of this Supabase build, but no client chunk holds "${pkg.text}". If ${pkg.package} no longer builds that string, give it a new signature in PACKAGE_MARKERS (scripts/checks/lazy-markers.mjs).`,
      );
    }
  }

  const sdk = packages
    .filter((pkg) => inClient(pkg.text))
    .map((pkg) => pkg.text);
  const summary =
    `${stats.length} routes, ${declared.size} declared marker(s)` +
    (sdk.length > 0 ? `, ${sdk.join(" and ")} only in lazy chunks` : "");
  return { problems, summary };
}

/** True for the content guide's worked-example ids, which are public. */
export function isReservedExampleId(id) {
  return RESERVED_EXAMPLE_ID.test(id);
}

/** The sealed item ids in `text` (§5.4's pattern), fixtures and guide examples left out. */
export function sealedIdsIn(text) {
  const ids = new Set();
  for (const match of text.matchAll(SEALED_ID)) {
    if (!isReservedExampleId(match[1])) ids.add(match[1]);
  }
  return [...ids];
}

const JSON_ESCAPE = /\\(?:u([0-9a-fA-F]{4})|(["\\/bfnrt]))/g;
const HTML_ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g;
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function fromCodePoint(value) {
  return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : " ";
}

/**
 * A file's text as a reader would see it: JSON string escapes undone twice
 * (an RSC payload inside an inline script is escaped twice), then HTML
 * entities, so an apostrophe written as `&#x27;` or as a JSON `\u` escape
 * reads as an apostrophe again before normalizeName deletes it.
 */
export function decodeText(text) {
  let out = text;
  for (let pass = 0; pass < 2; pass += 1) {
    out = out.replace(JSON_ESCAPE, (_, hex, char) =>
      hex !== undefined
        ? String.fromCharCode(Number.parseInt(hex, 16))
        : '"\\/'.includes(char)
          ? char
          : " ",
    );
  }
  return out.replace(HTML_ENTITY, (whole, decimal, hex, name) => {
    if (decimal !== undefined) return fromCodePoint(Number(decimal));
    if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16));
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * A number as a whole formatted token, AC-DLY-04's text rule: "1,250" and
 * "86.4" count; "9/12", "#12" and "v12" don't. Tokens end at whitespace and
 * also at markup, quotes and "=", since a file's text runs straight into
 * its tags ("<p>It is 1,250.</p>"); surrounding brackets and punctuation
 * come off.
 */
export function containsNumber(text, value) {
  return text
    .split(/[\s<>"'`=]+/)
    .map((token) => token.replace(/^[([{:]+|[)\]},.;:!?]+$/g, ""))
    .some(
      (token) =>
        /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(token) &&
        Number(token.replaceAll(",", "")) === value,
    );
}

/** True when a JSON value holds `value` as a number anywhere, AC-DLY-04's rule for JSON fields. */
export function jsonHoldsNumber(json, value) {
  if (typeof json === "number") return json === value;
  if (Array.isArray(json))
    return json.some((item) => jsonHoldsNumber(item, value));
  if (typeof json === "object" && json !== null) {
    return Object.values(json).some((item) => jsonHoldsNumber(item, value));
  }
  return false;
}

/**
 * The texts and numbers to look for, from sealed items: each text
 * normalized, with its item id and field path; each Encore answer with the
 * index of its question's text.
 */
export function sealedNeedles(items, normalize) {
  const texts = [];
  const answers = [];
  let skipped = 0;
  const addText = (itemId, field, raw) => {
    if (typeof raw !== "string") return -1;
    const normalized = normalize(raw);
    const words = normalized.split(" ").filter(Boolean);
    if (words.length < MIN_TEXT_WORDS) {
      skipped += 1;
      return -1;
    }
    texts.push({ itemId, field, normalized, words: [...new Set(words)] });
    return texts.length - 1;
  };
  for (const { id, pool, item } of items) {
    if (pool !== "mystery" && pool !== "encore" && pool !== "room") continue;
    if (Array.isArray(item.clues)) {
      item.clues.forEach((clue, index) => addText(id, `clues[${index}]`, clue));
    }
    if (pool === "room") addText(id, "stem", item.stem);
    const question =
      pool === "encore" ? addText(id, "question", item.question) : -1;
    addText(id, "explanation", item.explanation);
    if (Array.isArray(item.claims)) {
      item.claims.forEach((claim, index) =>
        addText(id, `claims[${index}]`, claim?.text),
      );
    }
    if (pool === "encore" && typeof item.answer === "number" && question >= 0) {
      answers.push({
        itemId: id,
        field: "answer",
        value: item.answer,
        question,
      });
    }
  }
  return { texts, answers, skipped };
}

/**
 * @typedef {{ itemId: string, field: string, normalized: string, words: string[] }} TextNeedle
 * @typedef {{ itemId: string, field: string, value: number, question: number }} AnswerNeedle
 * @typedef {{ texts: TextNeedle[], answers: AnswerNeedle[], skipped: number }} Needles
 * @typedef {{ kind: "id" | "text" | "answer", file: string, itemId: string, field: string }} Finding
 * @typedef {{ envValue: string | undefined, keyPath: string }} KeySource
 */

/**
 * Scans every text file under `roots` for sealed ids and, given needles,
 * for sealed texts and Encore answers. Findings carry the file (relative to
 * `root`), the item id and the field; never the text.
 *
 * @param {{ root: string, roots?: string[], needles?: Needles | null, normalize?: ((text: string) => string) | null }} options
 * @returns {{ files: number, findings: Finding[] }}
 */
export function scanForSealedContent({
  root,
  roots = SCAN_ROOTS,
  needles = null,
  normalize = null,
}) {
  const findings = [];
  let files = 0;
  for (const scanRoot of roots) {
    for (const path of filesUnder(join(root, scanRoot))) {
      if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) continue;
      files += 1;
      const file = toPosix(relative(root, path));
      const text = readFileSync(path, "utf8");
      for (const id of sealedIdsIn(text)) {
        findings.push({ kind: "id", file, itemId: id, field: "id" });
      }
      if (needles === null || normalize === null) continue;

      const decoded = decodeText(text);
      const normalized = normalize(decoded);
      const words = ` ${normalized} `;
      // Only a text whose every word is in the file can be in it.
      const present = new Set(normalized.split(" "));
      const found = new Set();
      needles.texts.forEach((needle, index) => {
        if (!needle.words.every((word) => present.has(word))) return;
        if (words.includes(` ${needle.normalized} `)) {
          found.add(index);
          findings.push({
            kind: "text",
            file,
            itemId: needle.itemId,
            field: needle.field,
          });
        }
      });
      let json;
      if (file.endsWith(".json")) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      for (const answer of needles.answers) {
        if (!found.has(answer.question)) continue;
        if (
          containsNumber(decoded, answer.value) ||
          (json !== undefined && jsonHoldsNumber(json, answer.value))
        ) {
          findings.push({
            kind: "answer",
            file,
            itemId: answer.itemId,
            field: answer.field,
          });
        }
      }
    }
  }
  return { files, findings };
}

/**
 * The sealed items to look for. `fixtures`: a plaintext fixture tree (tests
 * and dry runs), read in the repository that holds it. Otherwise the
 * envelopes in `root`'s content/sealed/, decrypted in memory with the key
 * from `keySource` (QZ_CONTENT_KEY, then the key file). The plaintext
 * workspace (content/.sealed-plain/) is never read.
 *
 * @param {{ root: string, fixtures?: string | null, keySource?: KeySource | null }} options
 */
export async function loadSealedItems({
  root,
  fixtures = null,
  keySource = null,
}) {
  const { findRepoRoot, resolveLayout } =
    await import("../../src/content/pipeline/layout.ts");
  const { loadBank } = await import("../../src/content/pipeline/bank.ts");
  if (fixtures !== null) {
    const tree = resolve(root, fixtures);
    const layout = resolveLayout({
      repoRoot: findRepoRoot(tree),
      root: tree,
      fixtures: true,
    });
    return (await loadBank(layout, { sealed: false })).items;
  }
  const crypto = await import("../content/crypto.ts");
  const loaded = await crypto.loadMasterKey(
    keySource ?? crypto.keySourceFromProcess(),
  );
  if (loaded === null) {
    throw new CheckError(
      `--sealed needs the content key: ${crypto.missingKeyMessage(1)}.`,
    );
  }
  const bank = await loadBank(resolveLayout({ repoRoot: root }), {
    sealed: true,
    keys: loaded.keys,
  });
  return bank.items;
}

/**
 * Both checks. `sealed` adds the sealed text scan with the content key;
 * `fixtures` runs it with a plaintext fixture tree instead. Returns the
 * problems (empty when the build passes) and the summary lines.
 *
 * @param {{ root?: string, sealed?: boolean, fixtures?: string | null, keySource?: KeySource | null }} [options]
 * @returns {Promise<{ problems: string[], lines: string[] }>}
 */
export async function runCheck({
  root = process.cwd(),
  sealed = false,
  fixtures = null,
  keySource = null,
} = {}) {
  const lines = [];
  const stats = readRouteStats(root);
  const mode = buildBackendMode(root);
  const lazy = lazyMarkerProblems({
    root,
    stats,
    declared: declaredMarkers(root),
    packages: packageSignatures(root, mode),
  });
  lines.push(
    `lazy markers: ${lazy.summary}${mode === null ? " (the build's backend mode is unknown)" : `, ${mode} build`}.`,
  );

  let needles = null;
  let normalize = null;
  const textScan = sealed || fixtures !== null;
  if (textScan) {
    let items;
    try {
      items = await loadSealedItems({ root, fixtures, keySource });
    } catch (error) {
      if (error instanceof CheckError) throw error;
      // Sealed content may sit in the message (a parse error quotes its input).
      throw new CheckError(
        "the sealed content could not be loaded. Run npm run content:check -- --sealed for the redacted details.",
      );
    }
    ({ normalizeName: normalize } =
      await import("../../src/engine/suggest/normalize.ts"));
    needles = sealedNeedles(items, normalize);
  }

  const scan = scanForSealedContent({ root, needles, normalize });
  const problems = [...lazy.problems];
  for (const finding of scan.findings) {
    problems.push(
      finding.kind === "id"
        ? `${finding.file} holds the sealed id ${finding.itemId}. Sealed ids never ship (§5.4); a comment or a test that needs one uses an fx. id.`
        : `${finding.file} holds ${finding.itemId} ${finding.field}${finding.kind === "answer" ? " beside its question" : ""}, which is sealed.`,
    );
  }
  lines.push(
    `sealed scan: ${scan.files} files under ${SCAN_ROOTS.join(", ")}; ${scan.findings.filter((f) => f.kind === "id").length} sealed id(s).`,
  );
  lines.push(
    needles === null
      ? "sealed text: not scanned (npm run check:lazy -- --sealed, where the content key is)."
      : `sealed text: ${needles.texts.length} texts and ${needles.answers.length} Encore answers from ${fixtures === null ? "content/sealed/" : fixtures}, ${needles.skipped} text(s) under ${MIN_TEXT_WORDS} words left out; ${scan.findings.filter((f) => f.kind !== "id").length} finding(s).`,
  );
  return { problems, lines };
}

const USAGE = `Usage: npm run check:lazy [-- --sealed]

After "npm run build": no lazy-only module in a route's first load, and no
sealed id under .next/static, .next/server/app or public/.

  --sealed   Also look for sealed texts (clues, stems, Encore questions,
             explanations, claims) and Encore answers beside their
             questions. Decrypts content/sealed/ in memory with the content
             key (QZ_CONTENT_KEY or ~/.config/quiz-web-app/content.key).
             Findings name the item, the field and the file, never the text.`;

async function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        sealed: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
    }));
  } catch (error) {
    console.error(`check:lazy: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const { problems, lines } = await runCheck({
    sealed: values.sealed === true,
  });
  for (const line of lines) console.log(`check:lazy: ${line}`);
  for (const problem of problems) console.error(`check:lazy: ${problem}`);
  if (problems.length > 0) {
    console.error(`check:lazy: ${problems.length} problem(s).`);
    return 1;
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  main(argv).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      if (error instanceof CheckError) {
        console.error(`check:lazy: ${error.message}`);
      } else if (argv.includes("--sealed")) {
        // A message or stack from a sealed run could quote sealed content.
        console.error(
          "check:lazy: failed (details withheld in a --sealed run).",
        );
      } else {
        console.error("check:lazy: failed.", error);
      }
      process.exitCode = 1;
    },
  );
}
