/**
 * node scripts/content/licenses.ts [--check]
 *
 * Writes src/features/legal/generated/licenses.ts, everything /credits
 * shows that lives in another file (LGL-1; PRD §3.14, DESIGN §12.40):
 *
 * - **Fonts**: the two SIL Open Font License texts beside the font files
 *   (src/app/fonts/OFL-*.txt).
 * - **Icons**: Lucide's ISC licence, with Feather's MIT notice
 *   (src/ui/LICENSE-lucide.txt).
 * - **Open data**: every dataset in content/datasets/manifest.json with its
 *   licence, and which shipped answer lists name it in their `provenance`
 *   (CONTENT_GUIDE §2.10): as the source of their data (an entry that is
 *   exactly `<key>@<version>`), or as what the content team's own entries
 *   were checked against (a key quoted inside a batch's description). A
 *   dataset whose licence asks for its notice to travel with the data has
 *   that text committed under src/features/legal/licences/<key>.txt, and
 *   its SHA-256 must equal the pinned licence file's in the manifest.
 * - **Software**: the open-source notices of every package the app needs
 *   at run time: the `dependencies` of package.json and theirs, as the
 *   lockfile resolves them, leaving out optional and platform-only
 *   packages (native binaries for the build machine, never shipped), plus
 *   the build-time packages whose own code ships in the pages
 *   (`SHIPPED_BUILD_PACKAGES`: Tailwind's CSS). Packages whose licence text
 *   is the same, apart from copyright lines, share one copy of it, and
 *   each keeps its own copyright lines. A package that ships no licence
 *   file keeps the copyright lines at the head of its main or module file,
 *   or, with none there, the author its package.json names.
 *
 * Deterministic: the same inputs give the same bytes, formatted with the
 * repository's Prettier config. `--check` writes nothing and exits 1 when
 * the committed file differs, and scripts/content/licenses.test.ts runs
 * the same comparison in `npm test`, so a dependency upgrade, a new
 * dataset or a new list source can't leave /credits behind.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as prettier from "prettier";

import { parseCli, run } from "../../src/content/pipeline/cli.ts";
import { findRepoRoot } from "../../src/content/pipeline/layout.ts";
import {
  DatasetManifestSchema,
  datasetVersion,
  type DatasetEntry,
} from "../../src/content/schema/datasets.ts";

/** Where the module goes, from the repository root. */
export const LICENSES_OUTPUT = "src/features/legal/generated/licenses.ts";

/** Committed licence texts of datasets, one `<key>.txt` each. */
export const DATASET_LICENCE_DIR = "src/features/legal/licences";

const FONT_DIR = "src/app/fonts";
const ICON_LICENCE = "src/ui/LICENSE-lucide.txt";
const MANIFEST = "content/datasets/manifest.json";
const ANSWER_LISTS = "content/answer-lists";

const USAGE = `Usage: node scripts/content/licenses.ts [--check]

  --check   Compare with the committed module, write nothing; exit 1 on any
            difference`;

// ---------------------------------------------------------------------------
// Shapes written into the module
// ---------------------------------------------------------------------------

export interface FontLicence {
  file: string;
  text: string;
}

export interface DatasetCredit {
  key: string;
  title: string;
  /** SPDX id where one exists, or a short description. */
  license: string;
  licenseNote: string | null;
  sourceLabel: string;
  /** The repository or package page at the pinned version. */
  url: string;
  /** A short commit or an npm version. */
  version: string;
  /** Answer lists whose data comes from it, by type. */
  listsFrom: string[];
  /** Answer lists whose compiled entries were checked against it, by type. */
  listsChecked: string[];
  /** Its licence text, when the licence asks for it to travel with the data. */
  licenceText: string | null;
}

export interface ListCredit {
  /** The answer type: `country`, `music_artist`. */
  type: string;
  /** Some entries were compiled by the content team. */
  compiled: boolean;
  /** The licence the content team's entries carry, when there are any. */
  compiledLicense: string | null;
  /** Datasets the list's data comes from, by key. */
  from: string[];
  /** Datasets the team's entries were checked against, by key. */
  checkedAgainst: string[];
  /** Some entries carry a Wikidata id (a Q-number). */
  wikidata: boolean;
}

export interface SoftwarePackage {
  name: string;
  version: string;
  license: string;
  /**
   * Its copyright lines, as its licence file has them, or as the head of
   * its main or module file has them when it ships no licence file.
   */
  copyright: string[];
  /** False when the package ships no licence file of its own. */
  licenceFile: boolean;
  /**
   * The author its package.json names, kept only for a package with no
   * licence file and no copyright line in its main or module file.
   */
  author: string | null;
}

export interface SoftwareNotice {
  /** The SPDX ids of the packages that share this text. */
  licenses: string[];
  packages: SoftwarePackage[];
  /** The licence text without the copyright lines, which each package keeps. */
  text: string;
}

export interface LicenseData {
  fonts: FontLicence[];
  icons: { file: string; text: string };
  datasets: DatasetCredit[];
  lists: ListCredit[];
  software: SoftwareNotice[];
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/** Unix line ends, no trailing spaces, no blank runs longer than one line. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

function readJson(path: string): unknown {
  return JSON.parse(readText(path)) as unknown;
}

// ---------------------------------------------------------------------------
// Fonts and icons
// ---------------------------------------------------------------------------

function fontLicences(repoRoot: string): FontLicence[] {
  const dir = join(repoRoot, FONT_DIR);
  const files = readdirSync(dir)
    .filter((name) => /^OFL-.+\.txt$/.test(name))
    .sort();
  if (files.length === 0) throw new Error(`no OFL-*.txt in ${FONT_DIR}`);
  return files.map((file) => ({
    file,
    text: tidyText(readText(join(dir, file))),
  }));
}

// ---------------------------------------------------------------------------
// Open data
// ---------------------------------------------------------------------------

/** `key@version` inside a provenance source. */
const DATASET_REF = /([a-z0-9]+(?:-[a-z0-9]+)*)@([0-9A-Za-z.+-]+[0-9A-Za-z])/g;
const QID = /^Q[1-9]\d*$/;

interface ProvenanceEntry {
  source: string;
  license: string;
}

interface AnswerListFile {
  type: string;
  provenance: ProvenanceEntry[];
  entities: { id: string; wikidataId?: string | null }[];
}

function readAnswerList(path: string): AnswerListFile {
  const raw = readJson(path) as Partial<AnswerListFile> | null;
  if (
    raw === null ||
    typeof raw.type !== "string" ||
    !Array.isArray(raw.provenance) ||
    !Array.isArray(raw.entities)
  ) {
    throw new Error(`${path} is not an answer list`);
  }
  for (const entry of raw.provenance) {
    if (typeof entry.source !== "string" || typeof entry.license !== "string")
      throw new Error(
        `${path}: a provenance entry needs a source and a license`,
      );
  }
  return raw as AnswerListFile;
}

function datasetUrl(dataset: DatasetEntry): string {
  return dataset.kind === "github"
    ? `https://github.com/${dataset.repo}/tree/${dataset.commit}`
    : `https://www.npmjs.com/package/${dataset.package}/v/${dataset.version}`;
}

function shortVersion(dataset: DatasetEntry): string {
  const version = datasetVersion(dataset);
  return dataset.kind === "github" ? version.slice(0, 7) : version;
}

/**
 * A committed licence text for a dataset, checked byte for byte against
 * the pinned licence file in the manifest. Null when none is committed.
 */
function datasetLicenceText(
  repoRoot: string,
  dataset: DatasetEntry,
): string | null {
  const path = join(repoRoot, DATASET_LICENCE_DIR, `${dataset.key}.txt`);
  if (!existsSync(path)) return null;
  const pinned = dataset.files.find((file) =>
    /^licen[cs]e(\.[a-z]+)?$/i.test(file.path),
  );
  if (pinned === undefined) {
    throw new Error(
      `${DATASET_LICENCE_DIR}/${dataset.key}.txt has no licence file in the manifest to check it against`,
    );
  }
  const bytes = readFileSync(path);
  if (sha256(bytes) !== pinned.sha256) {
    const from = "url" in pinned ? pinned.url : `the tarball of ${dataset.key}`;
    throw new Error(
      `${DATASET_LICENCE_DIR}/${dataset.key}.txt doesn't match ${pinned.path} pinned in ${MANIFEST} (sha256 ${pinned.sha256}). Fetch it again from ${from}.`,
    );
  }
  return tidyText(bytes.toString("utf8"));
}

function openData(repoRoot: string): {
  datasets: DatasetCredit[];
  lists: ListCredit[];
} {
  const parsed = DatasetManifestSchema.safeParse(
    readJson(join(repoRoot, MANIFEST)),
  );
  if (!parsed.success) throw new Error(`${MANIFEST} doesn't validate`);
  const manifest = parsed.data.datasets;
  const known = new Set(manifest.map((dataset) => dataset.key));

  const listDir = join(repoRoot, ANSWER_LISTS);
  const lists: ListCredit[] = readdirSync(listDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const list = readAnswerList(join(listDir, name));
      const from = new Set<string>();
      const checked = new Set<string>();
      const compiledLicenses = new Set<string>();
      for (const entry of list.provenance) {
        const refs = [...entry.source.matchAll(DATASET_REF)];
        for (const [, key] of refs) {
          if (key !== undefined && !known.has(key)) {
            throw new Error(
              `${ANSWER_LISTS}/${name} names dataset "${key}", which ${MANIFEST} doesn't list`,
            );
          }
        }
        const exact = refs.length === 1 && refs[0]?.[0] === entry.source.trim();
        if (exact) {
          from.add(refs[0]?.[1] ?? "");
        } else {
          compiledLicenses.add(entry.license);
          for (const [, key] of refs) if (key !== undefined) checked.add(key);
        }
      }
      for (const key of from) checked.delete(key);
      const licenses = [...compiledLicenses].sort();
      return {
        type: list.type,
        compiled: licenses.length > 0,
        compiledLicense: licenses.length > 0 ? licenses.join(" AND ") : null,
        from: [...from].sort(),
        checkedAgainst: [...checked].sort(),
        wikidata: list.entities.some(
          (entity) =>
            QID.test(entity.id) ||
            (typeof entity.wikidataId === "string" && entity.wikidataId !== ""),
        ),
      };
    });

  const datasets: DatasetCredit[] = manifest.map((dataset) => ({
    key: dataset.key,
    title: dataset.title,
    license: dataset.license,
    licenseNote: dataset.licenseNote ?? null,
    sourceLabel: dataset.sourceLabel,
    url: datasetUrl(dataset),
    version: shortVersion(dataset),
    listsFrom: lists
      .filter((list) => list.from.includes(dataset.key))
      .map((list) => list.type),
    listsChecked: lists
      .filter((list) => list.checkedAgainst.includes(dataset.key))
      .map((list) => list.type),
    licenceText: datasetLicenceText(repoRoot, dataset),
  }));

  // A licence text nobody can match to a dataset is a stale file.
  const licenceDir = join(repoRoot, DATASET_LICENCE_DIR);
  if (existsSync(licenceDir)) {
    for (const name of readdirSync(licenceDir)) {
      const key = name.replace(/\.txt$/, "");
      if (!known.has(key)) {
        throw new Error(
          `${DATASET_LICENCE_DIR}/${name} matches no dataset in ${MANIFEST}`,
        );
      }
    }
  }
  return { datasets, lists };
}

// ---------------------------------------------------------------------------
// Software
// ---------------------------------------------------------------------------

interface LockPackage {
  version?: string;
  license?: string;
  dependencies?: Record<string, string>;
  optional?: boolean;
  dev?: boolean;
  os?: string[];
  cpu?: string[];
}

interface Lockfile {
  packages: Record<string, LockPackage>;
}

/** Node's lookup: the nearest node_modules/<name> from `from` upward. */
function resolveInLock(
  lock: Lockfile,
  name: string,
  from: string,
): string | null {
  let dir = from;
  for (;;) {
    const key = `${dir === "" ? "" : `${dir}/`}node_modules/${name}`;
    if (lock.packages[key] !== undefined) return key;
    if (dir === "") return null;
    const cut = dir.lastIndexOf("/node_modules/");
    dir = cut === -1 ? "" : dir.slice(0, cut);
  }
}

/** The run-time closure: dependencies, never optional, dev or platform-only packages. */
export function runtimePackages(
  lock: Lockfile,
  roots: readonly string[],
): string[] {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const name of roots) {
    const key = resolveInLock(lock, name, "");
    if (key === null) throw new Error(`package-lock.json has no ${name}`);
    queue.push(key);
  }
  while (queue.length > 0) {
    const key = queue.shift() as string;
    if (seen.has(key)) continue;
    const info = lock.packages[key];
    if (info === undefined) continue;
    if (
      info.dev === true ||
      info.optional === true ||
      info.os !== undefined ||
      info.cpu !== undefined
    ) {
      continue;
    }
    seen.add(key);
    for (const dependency of Object.keys(info.dependencies ?? {}).sort()) {
      const next = resolveInLock(lock, dependency, key);
      if (next === null) {
        throw new Error(
          `package-lock.json can't resolve ${dependency} for ${key}`,
        );
      }
      queue.push(next);
    }
  }
  return [...seen].sort();
}

/**
 * Build-time packages whose own code ships in every page, so their notice
 * must travel with it. Tailwind's preflight, theme and utilities are
 * compiled into the CSS (src/app/globals.css imports "tailwindcss"), and
 * the lockfile marks the package dev, so the run-time closure leaves it
 * out. Only the packages themselves: Tailwind's compiler and plugin
 * (@tailwindcss/node, @tailwindcss/turbopack) never ship.
 */
export const SHIPPED_BUILD_PACKAGES: readonly string[] = ["tailwindcss"];

/** The lockfile keys of every package whose code ships, sorted. */
export function shippedPackages(
  lock: Lockfile,
  roots: readonly string[],
  buildPackages: readonly string[] = SHIPPED_BUILD_PACKAGES,
): string[] {
  const keys = new Set(runtimePackages(lock, roots));
  for (const name of buildPackages) {
    const key = resolveInLock(lock, name, "");
    if (key === null) throw new Error(`package-lock.json has no ${name}`);
    keys.add(key);
  }
  return [...keys].sort();
}

const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|markdown|txt))?$/i;
/**
 * A package's own copyright line: "Copyright (c) 2025 Vercel, Inc.",
 * "Copyright 2017 Andrey Sitnik", "© 2016 ...". Not the licence's own words
 * that happen to start a line ("copyright notice that is included...",
 * "(c) You must retain...") or the Apache appendix's "Copyright [yyyy]".
 */
const COPYRIGHT_LINE =
  /^\s*(copyright\s*(\(c\)|©|\d{4})|\(c\)\s*\d{4}|©\s*\d{4})/i;
/** A licence's title line: "MIT License", "# MIT License", "The MIT License (MIT)". */
const TITLE_LINE =
  /^\s*(#+\s*)?(the\s+)?[a-z0-9 .,-]*licen[cs]e[a-z0-9 .,()-]*$/i;
/** The Apache appendix's template line, which only some copies keep. */
const TEMPLATE_LINE = /^\s*copyright \[yyyy\]/i;
/** A comment's leading marks in a source file: `//`, `/*`, ` * `, `#`. */
const COMMENT_MARKS = /^\s*(\/\/+|\/\*+|\*+|#+)/;
/** How far into a main or module file a copyright banner may sit. */
const BANNER_LINES = 40;

/** The file a package.json entry names, as Node finds it: exact, `.js`, then `index.js`. */
function entryFile(dir: string, entry: string): string | null {
  for (const candidate of [
    join(dir, entry),
    join(dir, `${entry}.js`),
    join(dir, entry, "index.js"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Copyright lines in the comment banner at the head of a package's main or
 * module file ("// Copyright (c) 2009 Kazuhiko Arase"), for a package that
 * ships no licence file. Empty when neither file has one.
 */
export function bannerCopyright(
  dir: string,
  packageJson: Record<string, unknown>,
): string[] {
  const entries = [packageJson.main, packageJson.module].filter(
    (entry): entry is string => typeof entry === "string" && entry !== "",
  );
  for (const entry of entries.length > 0 ? entries : ["index.js"]) {
    const path = entryFile(dir, entry);
    if (path === null) continue;
    const found = readText(path)
      .split("\n", BANNER_LINES)
      .map((line) => line.replace(COMMENT_MARKS, "").trim())
      .filter((line) => COPYRIGHT_LINE.test(line));
    if (found.length > 0) return found;
  }
  return [];
}

/** The author's name from package.json, without an email or a URL: "Kazuhiko Arase". */
export function authorName(
  packageJson: Record<string, unknown>,
): string | null {
  const field = packageJson.author;
  const raw =
    typeof field === "string"
      ? field
      : typeof field === "object" &&
          field !== null &&
          typeof (field as { name?: unknown }).name === "string"
        ? (field as { name: string }).name
        : "";
  const name = raw
    .replace(/<[^>]*>|\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return name === "" ? null : name;
}

function licenseOf(
  packageJson: Record<string, unknown>,
  lock: LockPackage,
): string {
  const field = packageJson.license;
  if (typeof field === "string" && field !== "") return field;
  if (
    typeof field === "object" &&
    field !== null &&
    typeof (field as { type?: unknown }).type === "string"
  ) {
    return (field as { type: string }).type;
  }
  if (typeof lock.license === "string") return lock.license;
  throw new Error(`no licence declared for ${String(packageJson.name)}`);
}

/** The body of a licence text that decides which packages share it. */
function grouping(text: string): string {
  return text
    .split("\n")
    .filter(
      (line, index) =>
        !(index === 0 && TITLE_LINE.test(line)) && !TEMPLATE_LINE.test(line),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function software(repoRoot: string): SoftwareNotice[] {
  const lock = readJson(join(repoRoot, "package-lock.json")) as Lockfile;
  const manifest = readJson(join(repoRoot, "package.json")) as {
    dependencies?: Record<string, string>;
  };
  const keys = shippedPackages(
    lock,
    Object.keys(manifest.dependencies ?? {}).sort(),
  );

  interface Read {
    pkg: SoftwarePackage;
    text: string | null;
  }
  const read: Read[] = keys.map((key) => {
    const dir = join(repoRoot, key);
    const packageJson = readJson(join(dir, "package.json")) as Record<
      string,
      unknown
    >;
    const info = lock.packages[key] ?? {};
    const name =
      typeof packageJson.name === "string"
        ? packageJson.name
        : key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    const version = info.version ?? String(packageJson.version);
    const file = readdirSync(dir)
      .filter((entry) => LICENCE_FILE.test(entry))
      .sort()[0];
    if (file === undefined) {
      // MIT and its kin ask for the notice to travel with the code, so a
      // package without a licence file keeps the one its source carries.
      const copyright = bannerCopyright(dir, packageJson);
      return {
        pkg: {
          name,
          version,
          license: licenseOf(packageJson, info),
          copyright,
          licenceFile: false,
          author: copyright.length > 0 ? null : authorName(packageJson),
        },
        text: null,
      };
    }
    const full = tidyText(readText(join(dir, file)));
    const lines = full.split("\n");
    return {
      pkg: {
        name,
        version,
        license: licenseOf(packageJson, info),
        copyright: lines
          .filter((line) => COPYRIGHT_LINE.test(line))
          .map((line) => line.trim()),
        licenceFile: true,
        author: null,
      },
      text: tidyText(
        lines.filter((line) => !COPYRIGHT_LINE.test(line)).join("\n"),
      ),
    };
  });

  const groups = new Map<string, SoftwareNotice>();
  for (const { pkg, text } of read) {
    if (text === null) continue;
    const key = grouping(text);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { licenses: [pkg.license], packages: [pkg], text });
    } else {
      group.packages.push(pkg);
      if (!group.licenses.includes(pkg.license))
        group.licenses.push(pkg.license);
    }
  }
  // A package with no licence file joins the largest group of its licence;
  // with none to join, it stands alone and the page says no text shipped.
  for (const { pkg, text } of read) {
    if (text !== null) continue;
    const home = [...groups.values()]
      .filter(
        (group) =>
          group.licenses.length === 1 && group.licenses[0] === pkg.license,
      )
      .sort((a, b) => b.packages.length - a.packages.length)[0];
    if (home === undefined) {
      groups.set(`none:${pkg.license}:${pkg.name}`, {
        licenses: [pkg.license],
        packages: [pkg],
        text: "",
      });
    } else {
      home.packages.push(pkg);
    }
  }
  const notices = [...groups.values()];
  for (const notice of notices) {
    notice.packages.sort((a, b) => a.name.localeCompare(b.name, "en"));
    notice.licenses.sort();
  }
  return notices.sort((a, b) =>
    (a.licenses.join() + (a.packages[0]?.name ?? "")).localeCompare(
      b.licenses.join() + (b.packages[0]?.name ?? ""),
      "en",
    ),
  );
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export function collectLicenseData(repoRoot: string): LicenseData {
  const { datasets, lists } = openData(repoRoot);
  return {
    fonts: fontLicences(repoRoot),
    icons: {
      file: ICON_LICENCE,
      text: tidyText(readText(join(repoRoot, ICON_LICENCE))),
    },
    datasets,
    lists,
    software: software(repoRoot),
  };
}

const HEADER = `/**
 * What /credits shows from other files (LGL-1; PRD §3.14, DESIGN §12.40):
 * the font and icon licences, the open datasets behind the answer lists,
 * and the notices of the open-source packages the app runs on, Tailwind's
 * CSS included.
 *
 * Generated by \`node scripts/content/licenses.ts\` from src/app/fonts/OFL-*.txt,
 * src/ui/LICENSE-lucide.txt, content/datasets/manifest.json,
 * content/answer-lists/*.json, src/features/legal/licences/ and the
 * lockfile. Do not edit: scripts/content/licenses.test.ts rebuilds it in
 * \`npm test\` and fails on any difference.
 */
`;

const TYPES = `
export interface FontLicence {
  readonly file: string;
  readonly text: string;
}

export interface DatasetCredit {
  readonly key: string;
  readonly title: string;
  /** SPDX id where one exists, or a short description. */
  readonly license: string;
  readonly licenseNote: string | null;
  readonly sourceLabel: string;
  /** The repository or package page at the pinned version. */
  readonly url: string;
  /** A short commit or an npm version. */
  readonly version: string;
  /** Answer lists whose data comes from it, by type. */
  readonly listsFrom: readonly string[];
  /** Answer lists whose compiled entries were checked against it, by type. */
  readonly listsChecked: readonly string[];
  /** Its licence text, when the licence asks for it to travel with the data. */
  readonly licenceText: string | null;
}

export interface ListCredit {
  readonly type: string;
  /** Some entries were compiled by the content team. */
  readonly compiled: boolean;
  /** The licence the content team's entries carry. */
  readonly compiledLicense: string | null;
  /** Datasets the list's data comes from, by key. */
  readonly from: readonly string[];
  /** Datasets the team's entries were checked against, by key. */
  readonly checkedAgainst: readonly string[];
  /** Some entries carry a Wikidata id (a Q-number). */
  readonly wikidata: boolean;
}

export interface SoftwarePackage {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  /**
   * Its copyright lines, as its licence file has them, or as the head of
   * its main or module file has them when it ships no licence file.
   */
  readonly copyright: readonly string[];
  /** False when the package ships no licence file of its own. */
  readonly licenceFile: boolean;
  /**
   * The author its package.json names, kept only for a package with no
   * licence file and no copyright line in its main or module file.
   */
  readonly author: string | null;
}

export interface SoftwareNotice {
  /** The SPDX ids of the packages that share this text. */
  readonly licenses: readonly string[];
  readonly packages: readonly SoftwarePackage[];
  /** The licence text without the copyright lines, which each package keeps. */
  readonly text: string;
}
`;

function constant(name: string, type: string, value: unknown): string {
  return `\nexport const ${name}: ${type} = ${JSON.stringify(value, null, 2)};\n`;
}

export async function renderLicenseModule(
  repoRoot: string,
  data: LicenseData = collectLicenseData(repoRoot),
): Promise<string> {
  const source =
    HEADER +
    TYPES +
    constant("FONT_LICENCES", "readonly FontLicence[]", data.fonts) +
    constant(
      "ICON_LICENCE",
      "{ readonly file: string; readonly text: string }",
      data.icons,
    ) +
    constant("DATASET_CREDITS", "readonly DatasetCredit[]", data.datasets) +
    constant("LIST_CREDITS", "readonly ListCredit[]", data.lists) +
    constant("SOFTWARE_NOTICES", "readonly SoftwareNotice[]", data.software);
  const filepath = join(repoRoot, LICENSES_OUTPUT);
  const options = await prettier.resolveConfig(filepath);
  return prettier.format(source, { ...options, filepath });
}

async function main(argv: readonly string[]): Promise<number> {
  const values = parseCli(
    "content:licenses",
    [...argv],
    {
      check: { type: "boolean" },
    },
    USAGE,
  );
  const repoRoot = findRepoRoot();
  const output = join(repoRoot, LICENSES_OUTPUT);
  const next = await renderLicenseModule(repoRoot);
  const current = existsSync(output) ? readText(output) : null;
  if (values.check === true) {
    if (current === next) {
      console.log(`content:licenses: ${LICENSES_OUTPUT} is up to date.`);
      return 0;
    }
    console.error(
      `content:licenses: ${LICENSES_OUTPUT} is out of date. Run \`node scripts/content/licenses.ts\` and commit the result.`,
    );
    return 1;
  }
  if (current === next) {
    console.log(`content:licenses: ${LICENSES_OUTPUT} is up to date.`);
  } else {
    writeFileSync(output, next);
    console.log(`content:licenses: wrote ${LICENSES_OUTPUT}.`);
  }
  return 0;
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  run("content:licenses", () => main(process.argv.slice(2)));
}
