/**
 * Static checks on module graphs (ARCHITECTURE §11.2), run by `npm test`
 * through scripts/checks/forbidden-imports.test.ts, and on its own with
 * `npm run check:imports`.
 *
 * 1. Monetization. The Daily's routes (AC-DLY-19) and the archive and
 *    repair code (AC-RPR-07) import no module whose path or export names
 *    an entitlement, a paywall, a purchase, a price or an ad. The graph is
 *    followed from each entry through every static import, re-export and
 *    literal dynamic `import()`, by relative path or the `@/` alias. A
 *    package import is checked by its name and not followed.
 * 2. Strike offers (AC-SUR-03, static half). Survival's own code (its route,
 *    src/features/practice/survival and src/engine/practice/stream.ts) has
 *    no identifier and no piece of copy that offers to restore, buy or earn
 *    a strike, and its graph passes the monetization check too.
 *
 * Words are matched whole, after splitting camelCase, kebab-case and
 * snake_case, so "header", "download" and "readAloud" never read as "ad".
 * "AD" next to an era word (AD_ERA, isAdYear, formatAdDate) is the era,
 * not an advert. Copy that states the rule ("Strikes are never sold or
 * refilled.") passes: an offer verb doesn't count after a negator in the
 * same sentence. These are tripwires for wording, not a parser; review and
 * the E2E half of each criterion carry the rest.
 *
 * A graph whose entry modules don't exist yet (Survival before BLZ-1) is
 * reported as not built, and passes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

/** The words of §11.2, with their inflections. */
const MONETIZATION_WORD =
  /^(?:entitlements?|paywalls?|purchas(?:e|es|ed|ing|able)|pric(?:e|es|ed|ing)|ads?|adverts?|advertis(?:e|es|ed|ing|ement|ements|er|ers))$/;

/** An offer to give a strike back, sell one or award one (AC-SUR-03). */
const OFFER_VERB =
  /^(?:restor(?:e|es|ed|ing)|buy(?:s|ing)?|bought|sell(?:s|ing)?|sold|purchas(?:e|es|ed|ing)|earn(?:s|ed|ing)?|refill(?:s|ed|ing)?|regain(?:s|ed|ing)?|recover(?:s|ed|ing)?|reviv(?:e|es|ed|ing)|unlock(?:s|ed|ing)?|grant(?:s|ed|ing)?|refund(?:s|ed|ing)?|extra|bonus)$/;
const STRIKE_NOUN = /^(?:strikes?|li(?:fe|ves))$/;

/**
 * Words after which an offer verb in the same sentence is denied, not
 * offered: "never sold", "no extra lives", "cannot buy", "won't refill".
 * Contractions arrive joined ("cant", "wont"): see joinContractions().
 */
const NEGATOR = /^(?:never|no|not|cannot|cant|wont|without)$/;
/** A contrast that ends the denial before it: "No ads, but you can buy a life." */
const CONTRAST = /^(?:but|however|yet)$/;

/** Era words that make a neighbouring "AD" the era: AD_ERA, isAdYear, formatAdDate. */
const ERA_WORD = /^(?:bc|bce|ce|eras?|years?|dates?)$/;
const ERA_AD = /^ads?$/;

/**
 * The graphs. `entries` are globs relative to the repository root; `offers`
 * lists the path prefixes whose code the strike-offer scan reads.
 */
export const GRAPHS = [
  {
    id: "daily",
    ac: "AC-DLY-19",
    title: "the Daily's routes",
    entries: [
      "src/app/layout.tsx",
      "src/app/(play)/layout.tsx",
      "src/app/(play)/daily/**/page.tsx",
      "src/app/(play)/daily/**/layout.tsx",
    ],
    offers: [],
  },
  {
    id: "repair",
    ac: "AC-RPR-07",
    title: "the archive and repair",
    entries: [
      "src/app/(tabs)/layout.tsx",
      "src/app/(tabs)/archive/**/page.tsx",
      "src/app/(play)/daily/[number]/page.tsx",
      "src/features/archive/**/*.{ts,tsx}",
    ],
    offers: [],
  },
  {
    id: "survival",
    ac: "AC-SUR-03",
    title: "Survival",
    entries: [
      "src/app/(play)/practice/survival/**/page.tsx",
      "src/features/practice/survival/**/*.{ts,tsx}",
    ],
    offers: [
      "src/app/(play)/practice/survival/",
      "src/features/practice/survival/",
      "src/engine/practice/stream.ts",
    ],
  },
];

const PARSED = /\.(?:[cm]?[jt]sx?)$/;
const RESOLVE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".mjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

/** The lowercase words of an identifier, a path or a piece of copy. */
export function wordsOf(text) {
  return text
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .split(/[^A-Za-z\d]+/)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

/**
 * The first monetization word in `text`, or null. Each path segment is
 * read on its own, so the era exemption for "AD" never reaches across a
 * folder name: "ad-era.ts" is the era, "ads/year-end.ts" is still ads.
 */
export function monetizationWordIn(text) {
  for (const segment of text.split("/")) {
    const words = wordsOf(segment);
    const found = words.find(
      (word, index) =>
        MONETIZATION_WORD.test(word) &&
        !(
          ERA_AD.test(word) &&
          [words[index - 1], words[index + 1]].some(
            (neighbour) => neighbour !== undefined && ERA_WORD.test(neighbour),
          )
        ),
    );
    if (found !== undefined) return found;
  }
  return null;
}

/** "can't" and "won’t" as one word each ("cant", "wont"), so they can deny. */
function joinContractions(text) {
  return text.replace(/\b(\w+)n['’]t\b/gi, "$1nt");
}

/**
 * True when `text` names a strike or a life and offers something (restore,
 * buy, earn...) that no negator before it in the same sentence denies. So
 * "Out of lives? Buy more." offers one, while "Strikes are never sold or
 * refilled." and "You cannot buy or earn strikes." state the rule.
 */
export function offersStrike(text) {
  const prose = joinContractions(text);
  if (!wordsOf(prose).some((word) => STRIKE_NOUN.test(word))) return false;
  return prose.split(/[.!?;:\n]+/).some((sentence) => {
    const words = wordsOf(sentence);
    let denied = false;
    return words.some((word, index) => {
      if (NEGATOR.test(word)) {
        // "Why not buy an extra life?" asks; it doesn't deny.
        denied = !(word === "not" && words[index - 1] === "why");
      } else if (CONTRAST.test(word)) {
        denied = false;
      }
      return !denied && OFFER_VERB.test(word);
    });
  });
}

/** A small glob: `**`, `*` and `{a,b}`; everything else, brackets included, is literal. */
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      out += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (char === "*") {
      out += "[^/]*";
    } else if (char === "{") {
      const end = glob.indexOf("}", i);
      const options = glob.slice(i + 1, end).split(",");
      out += `(?:${options.map((option) => option.replace(/[.+^$|()[\]\\]/g, "\\$&")).join("|")})`;
      i = end;
    } else {
      out += char.replace(/[.+?^$|()[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** Every file under src/, as a repository-relative path with forward slashes. */
function sourceFiles(root) {
  const files = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(relative(root, path).split(sep).join("/"));
    }
  };
  walk(join(root, "src"));
  return files.sort();
}

function resolveModule(root, fromFile, specifier) {
  let base;
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = resolve(root, dirname(fromFile), specifier);
  } else if (specifier.startsWith("@/")) {
    base = join(root, "src", specifier.slice(2));
  } else {
    return null;
  }
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(root, candidate).split(sep).join("/");
    }
  }
  return null;
}

/** What a module imports, what it exports, and the names and copy it holds. */
function scanModule(root, file) {
  const text = readFileSync(join(root, file), "utf8");
  const kind = file.endsWith("x")
    ? ts.ScriptKind.TSX
    : /\.[cm]?js$/.test(file)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const specifiers = [];
  const exports = [];
  const names = [];
  const copy = [];
  const exported = (node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause !== undefined &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements) {
        exports.push(element.name.text);
      }
    }
    if (ts.isExportAssignment(node)) {
      exports.push("default");
      if (ts.isIdentifier(node.expression)) exports.push(node.expression.text);
    }
    if (exported(node)) {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            exports.push(declaration.name.text);
          }
        }
      } else if ("name" in node && node.name !== undefined) {
        exports.push(node.name.text);
      }
    }
    if (ts.isIdentifier(node)) names.push(node.text);
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) {
      copy.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { specifiers, exports, names, copy };
}

/**
 * The modules reachable from `entries`, each with the chain of importers
 * that first reached it. Package imports appear as `package:<name>`.
 */
function walkGraph(root, entries) {
  const reached = new Map();
  const scans = new Map();
  const queue = entries.map((entry) => [entry, [entry]]);
  while (queue.length > 0) {
    const [module, chain] = queue.shift();
    if (reached.has(module)) continue;
    reached.set(module, chain);
    if (module.startsWith("package:") || !PARSED.test(module)) continue;
    const scan = scanModule(root, module);
    scans.set(module, scan);
    for (const specifier of scan.specifiers) {
      const target = resolveModule(root, module, specifier);
      if (target !== null) {
        queue.push([target, [...chain, target]]);
      } else if (
        !specifier.startsWith(".") &&
        !specifier.startsWith("@/") &&
        !specifier.startsWith("node:")
      ) {
        queue.push([
          `package:${specifier}`,
          [...chain, `package:${specifier}`],
        ]);
      }
    }
  }
  return { reached, scans };
}

/**
 * Runs every graph's checks. Returns each graph's size and every finding;
 * nothing is printed.
 */
export function checkForbiddenImports({ root = process.cwd() } = {}) {
  const files = sourceFiles(root);
  const graphs = [];
  const findings = [];

  for (const graph of GRAPHS) {
    const patterns = graph.entries.map(globToRegExp);
    const entries = files.filter((file) =>
      patterns.some((pattern) => pattern.test(file)),
    );
    const { reached, scans } = walkGraph(root, entries);
    graphs.push({
      id: graph.id,
      ac: graph.ac,
      title: graph.title,
      entries,
      modules: [...reached.keys()],
    });

    for (const [module, chain] of reached) {
      const path = module.startsWith("package:")
        ? module.slice("package:".length)
        : module;
      const word = monetizationWordIn(path);
      if (word !== null) {
        findings.push({ graph: graph.id, module, kind: "path", word, chain });
      }
      const scan = scans.get(module);
      if (scan === undefined) continue;
      for (const name of scan.exports) {
        const exportWord = monetizationWordIn(name);
        if (exportWord !== null) {
          findings.push({
            graph: graph.id,
            module,
            kind: "export",
            word: exportWord,
            name,
            chain,
          });
        }
      }
      if (!graph.offers.some((prefix) => module.startsWith(prefix))) continue;
      for (const name of new Set(scan.names)) {
        if (offersStrike(name)) {
          findings.push({
            graph: graph.id,
            module,
            kind: "strike-offer",
            name,
            chain,
          });
        }
      }
      for (const text of scan.copy) {
        if (offersStrike(text)) {
          findings.push({
            graph: graph.id,
            module,
            kind: "strike-offer",
            name: text.trim().slice(0, 80),
            chain,
          });
        }
      }
    }
  }
  return { graphs, findings };
}

/** One line per finding, naming the module and how the graph reached it. */
export function describeFinding(finding) {
  const via = finding.chain.slice(0, -1);
  const reach = via.length > 0 ? ` (reached from ${via.join(" > ")})` : "";
  const graph = GRAPHS.find((candidate) => candidate.id === finding.graph);
  const head = `${graph?.ac ?? finding.graph} ${finding.module}`;
  if (finding.kind === "path") {
    return `${head}: its path names "${finding.word}"${reach}`;
  }
  if (finding.kind === "export") {
    return `${head}: it exports ${finding.name}, which names "${finding.word}"${reach}`;
  }
  return `${head}: "${finding.name}" offers to restore, buy or earn a strike${reach}`;
}

function main() {
  const { graphs, findings } = checkForbiddenImports();
  for (const graph of graphs) {
    const size =
      graph.entries.length === 0
        ? "not built yet (no entry module)"
        : `${graph.modules.length} module(s) from ${graph.entries.length} entry module(s)`;
    console.log(`forbidden-imports: ${graph.ac} ${graph.title}: ${size}.`);
  }
  for (const finding of findings) {
    console.error(`forbidden-imports: ${describeFinding(finding)}`);
  }
  if (findings.length > 0) {
    console.error(
      `forbidden-imports: ${findings.length} finding(s). The Daily, archive, repair and Survival code never touches entitlements, paywalls, purchases, prices or ads, and Survival never offers a strike back (ARCHITECTURE §11.2).`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("forbidden-imports: OK");
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
