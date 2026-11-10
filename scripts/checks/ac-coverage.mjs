/**
 * Acceptance-criterion coverage (ARCHITECTURE §11.9): every AC id that
 * docs/PRD.md defines ("- **AC-DLY-01** Given ...") should have a test
 * whose title starts with it. Run with `npm run check:ac`.
 *
 * A title starts with an id when the id is in the run of ids that opens it:
 * "AC-DLY-01 one tap on Play ...", "R1-16 AC-SHR-02 explains ..." and
 * "AC-IDN-04, AC-IDN-05 ..." all count. Titles are read from Vitest and
 * Playwright tests (`it`, `test`, `describe` and their `.each`, `.skip`,
 * `.fixme` forms) under src/, scripts/ and e2e/, and from the SQL tests'
 * `select 'PASS <title>'` lines under supabase/tests/. A title in a skipped
 * or fixme test is reported apart: it names the criterion but proves
 * nothing yet.
 *
 * It reports, by area: the ids with no test, the ids only skipped tests
 * name, and ids the other docs name that PRD.md does not define (a typo or
 * a criterion that moved). It exits 0 and only reports, since Beta areas
 * (rooms, groups, the editor) have no tests until they are built; QA-2
 * makes it a release gate with `--strict` (exit 1 on any id with no
 * passing test), scoped with `--only AC-DLY,AC-PRA` to the areas that ship.
 *
 *   node scripts/checks/ac-coverage.mjs [--strict] [--only <prefixes>] [--json]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** An AC id: AC-<area>-<number>, with an optional letter (AC-DLY-07b). */
const AC_ID = /\bAC-[A-Z0-9]+-\d+[a-z]?\b/g;
/** A definition line in docs/PRD.md. */
const DEFINITION = /^\s*[-*]\s+\*\*(AC-[A-Z0-9]+-\d+[a-z]?)\*\*/;
/** Any id that may open a title: AC-DLY-01, R2-09, D22, X29, CNT-2b. */
const ANY_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-?\d+[a-z]?$/;
/** Words that join ids in a title's opening run. */
const JOINER = /^(?:and|&|\/|,)$/;

/** The test trees, relative to the repository root. */
export const TEST_ROOTS = ["src", "scripts", "e2e", "supabase/tests"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "__fixtures__",
  "test-results",
  "playwright-report",
]);
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts|js|mjs)$/;

/**
 * Where a test's title string opens: `it(`, `test.fixme(`,
 * `it.each([...])(` and the like, then a quote or backtick. The group says
 * whether the call skips the test.
 */
const TITLE_CALL =
  /\b(?:it|test|describe)((?:\.(?:skip|only|fixme|concurrent|fails|todo|serial|parallel|sequential))*)(?:\.each\s*(?:\([^)]*\)|`[^`]*`))?\(\s*(["'`])/g;
/** A SQL test's passing line. */
const SQL_TITLE = /'PASS ([^']*)'/g;

/** The AC ids in the run of ids that opens `title`. */
export function leadingAcIds(title) {
  const ids = [];
  for (const raw of title.trim().split(/\s+/)) {
    const token = raw.replace(/[,:;.]+$/, "");
    if (token === "" || JOINER.test(token)) continue;
    if (!ANY_ID.test(token)) break;
    if (/^AC-/.test(token)) ids.push(token);
  }
  return ids;
}

/** The AC ids each title in one test file's source opens with. */
export function titlesIn(source, sql = false) {
  const out = [];
  if (sql) {
    for (const match of source.matchAll(SQL_TITLE))
      out.push({ ids: leadingAcIds(match[1]), skipped: false });
    return out;
  }
  for (const match of source.matchAll(TITLE_CALL)) {
    const start = (match.index ?? 0) + match[0].length;
    const quote = match[2];
    const end = source.indexOf(quote, start);
    const title = source.slice(start, end === -1 ? start + 200 : end);
    out.push({
      ids: leadingAcIds(title),
      skipped: /\.(?:skip|fixme|todo)\b/.test(match[1] ?? ""),
    });
  }
  return out;
}

function walk(dir, files) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
}

/** The AC ids PRD.md defines, in order, and the ids the other docs name. */
export function documentedIds(root) {
  const defined = [];
  const prd = join(root, "docs", "PRD.md");
  if (existsSync(prd)) {
    for (const line of readFileSync(prd, "utf8").split("\n")) {
      const match = DEFINITION.exec(line);
      if (match && !defined.includes(match[1])) defined.push(match[1]);
    }
  }
  const named = new Map();
  const docs = [];
  walk(join(root, "docs"), docs);
  for (const path of docs.filter((file) => file.endsWith(".md"))) {
    for (const match of readFileSync(path, "utf8").matchAll(AC_ID)) {
      const files = named.get(match[0]) ?? new Set();
      files.add(relative(root, path).split(sep).join("/"));
      named.set(match[0], files);
    }
  }
  return { defined, named };
}

/** Every AC id a test title opens with: id → { passing, skipped } file lists. */
export function testedIds(root) {
  const tested = new Map();
  for (const base of TEST_ROOTS) {
    const files = [];
    walk(join(root, base), files);
    for (const path of files) {
      const sql = base === "supabase/tests" && path.endsWith(".sql");
      if (!sql && !TEST_FILE.test(path)) continue;
      const file = relative(root, path).split(sep).join("/");
      for (const { ids, skipped } of titlesIn(readFileSync(path, "utf8"), sql))
        for (const id of ids) {
          const entry = tested.get(id) ?? { passing: [], skipped: [] };
          const list = skipped ? entry.skipped : entry.passing;
          if (!list.includes(file)) list.push(file);
          tested.set(id, entry);
        }
    }
  }
  return tested;
}

/** The area of an id: AC-DLY-01 → AC-DLY. */
export const areaOf = (id) => id.replace(/-\d+[a-z]?$/, "");

/**
 * The coverage report. `only` limits it to ids in those areas (AC-DLY) or
 * to those ids.
 */
export function acCoverage(root, only = []) {
  const { defined, named } = documentedIds(root);
  const tested = testedIds(root);
  const inScope = (id) =>
    only.length === 0 ||
    only.some((entry) => entry === id || entry === areaOf(id));
  const ids = defined.filter(inScope);
  const covered = ids.filter((id) => (tested.get(id)?.passing.length ?? 0) > 0);
  const skippedOnly = ids.filter(
    (id) =>
      (tested.get(id)?.passing.length ?? 0) === 0 &&
      (tested.get(id)?.skipped.length ?? 0) > 0,
  );
  const missing = ids.filter((id) => !tested.has(id));
  const undefinedIds = [...named.keys()]
    .filter((id) => !defined.includes(id) && inScope(id))
    .sort()
    .map((id) => ({ id, docs: [...(named.get(id) ?? [])].sort() }));
  const areas = new Map();
  for (const id of ids) {
    const area = areas.get(areaOf(id)) ?? {
      area: areaOf(id),
      defined: 0,
      covered: 0,
      missing: [],
      skippedOnly: [],
    };
    area.defined += 1;
    if (covered.includes(id)) area.covered += 1;
    if (missing.includes(id)) area.missing.push(id);
    if (skippedOnly.includes(id)) area.skippedOnly.push(id);
    areas.set(area.area, area);
  }
  return {
    defined: ids.length,
    covered: covered.length,
    missing,
    skippedOnly,
    undefinedIds,
    areas: [...areas.values()],
  };
}

function main(argv) {
  const strict = argv.includes("--strict");
  const json = argv.includes("--json");
  const onlyAt = argv.indexOf("--only");
  const only =
    onlyAt === -1
      ? []
      : (argv[onlyAt + 1] ?? "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
  const known = new Set(["--strict", "--json", "--only"]);
  const stray = argv.filter(
    (arg, index) => !known.has(arg) && !(onlyAt !== -1 && index === onlyAt + 1),
  );
  if (stray.length > 0 || (onlyAt !== -1 && only.length === 0)) {
    console.error(
      "Usage: node scripts/checks/ac-coverage.mjs [--strict] [--only <prefixes>] [--json]",
    );
    return 2;
  }
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const report = acCoverage(root, only);
  const gaps = report.missing.length + report.skippedOnly.length;
  if (json) {
    console.log(JSON.stringify({ ok: !strict || gaps === 0, ...report }));
  } else {
    for (const area of report.areas) {
      const line = `${area.area.padEnd(8)} ${String(area.covered).padStart(3)} of ${String(area.defined).padStart(3)} with a test`;
      console.log(line);
      if (area.missing.length > 0)
        console.log(`  no test: ${area.missing.join(", ")}`);
      if (area.skippedOnly.length > 0)
        console.log(`  only skipped tests: ${area.skippedOnly.join(", ")}`);
    }
    for (const { id, docs } of report.undefinedIds)
      console.log(
        `named but not defined in PRD.md: ${id} (${docs.join(", ")})`,
      );
    console.log(
      `check:ac: ${report.covered} of ${report.defined} acceptance criteria have a test whose title starts with their id; ${report.missing.length} have none, ${report.skippedOnly.length} only skipped ones.`,
    );
  }
  return strict && gaps > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
