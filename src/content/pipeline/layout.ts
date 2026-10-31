/**
 * Where content lives (CONTENT_GUIDE §2.2 and §11.1, ARCHITECTURE §2.1).
 *
 * A bank is either the real content tree (`content/`, with sealed files in
 * `.sealed-plain/` as plaintext and `sealed/` as envelopes) or a fixture
 * tree (`content/fixtures/`, or any folder passed with --fixtures), where
 * every item is fake, `fx.`-prefixed and plaintext, and the sealed kinds sit
 * directly in the root: mysteries/, encores/, room-packs/, schedule/,
 * spares/.
 */
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const SEALED_FOLDERS = [
  "mysteries",
  "encores",
  "room-packs",
  "schedule",
  "spares",
] as const;
export type SealedFolder = (typeof SEALED_FOLDERS)[number];

export type BankKind = "content" | "fixtures";

export interface Layout {
  repoRoot: string;
  root: string;
  kind: BankKind;
  practiceDir: string;
  answerListsDir: string;
  /** Plaintext sealed files: content/.sealed-plain, or the fixture root. */
  workspaceDir: string;
  /** Envelopes: content/sealed. Null for fixtures. */
  envelopeDir: string | null;
  registerFile: string;
  categoriesFile: string;
  referenceDir: string;
  manifestFile: string;
  cacheDir: string;
  packetsDir: string;
  datasetsCacheDir: string;
  guideFile: string;
}

/** The nearest folder upward with a package.json and a content/ or .git. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (
      existsSync(join(dir, "package.json")) &&
      (existsSync(join(dir, "content")) || existsSync(join(dir, ".git")))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export interface LayoutOptions {
  repoRoot?: string;
  /** The bank root. Defaults to <repo>/content. */
  root?: string;
  /** Treat the root as a fixture tree. Implied for a folder named fixtures. */
  fixtures?: boolean;
}

export function resolveLayout(options: LayoutOptions = {}): Layout {
  const repoRoot = resolve(options.repoRoot ?? findRepoRoot());
  const mainContent = join(repoRoot, "content");
  const root = resolve(repoRoot, options.root ?? "content");
  const kind: BankKind =
    options.fixtures === true || root.split(sep).at(-1) === "fixtures"
      ? "fixtures"
      : "content";
  const own = (name: string) => join(root, name);
  const shared = (name: string) =>
    existsSync(own(name)) ? own(name) : join(mainContent, name);
  const cacheDir = join(repoRoot, ".cache");
  return {
    repoRoot,
    root,
    kind,
    practiceDir: own("practice"),
    answerListsDir: own("answer-lists"),
    workspaceDir: kind === "fixtures" ? root : own(".sealed-plain"),
    envelopeDir: kind === "fixtures" ? null : own("sealed"),
    registerFile: own("batches.json"),
    categoriesFile: shared("categories.json"),
    referenceDir: shared("reference"),
    manifestFile: join(shared("datasets"), "manifest.json"),
    cacheDir,
    packetsDir: join(cacheDir, "packets"),
    datasetsCacheDir: join(cacheDir, "datasets"),
    guideFile: join(repoRoot, "docs", "CONTENT_GUIDE.md"),
  };
}

/** A path relative to the repository, with forward slashes, for messages. */
export function repoRelative(layout: Layout, path: string): string {
  return relative(layout.repoRoot, path).split(sep).join("/");
}
