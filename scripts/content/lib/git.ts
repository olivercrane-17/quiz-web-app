/**
 * Answer-list publish dates from git history (CONTENT_GUIDE §2.10 rule 5,
 * ARCHITECTURE §5.2, §5.7): a list version goes live with the commit that
 * first publishes it, and that commit's UTC date is the version's
 * `liveAt`. CI checks out with full history (`fetch-depth: 0`) so this can
 * be read; a shallow clone or a tree outside git says so instead of
 * guessing.
 */
import { execFileSync } from "node:child_process";

export interface PublishedVersion {
  version: string;
  /** The commit that first held this version. */
  commit: string;
  /** Its committer date, as a UTC calendar date. */
  date: string;
  /** The entity ids that commit's file held. */
  ids: ReadonlySet<string>;
}

export type ListHistory =
  | { ok: true; versions: readonly PublishedVersion[] }
  | { ok: false; reason: string };

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Why history can't be read here, or null when it can. */
export function historyUnavailable(repoRoot: string): string | null {
  try {
    if (git(repoRoot, ["rev-parse", "--is-inside-work-tree"]).trim() !== "true")
      return "not a git work tree";
    if (
      git(repoRoot, ["rev-parse", "--is-shallow-repository"]).trim() === "true"
    )
      return "the clone is shallow (CI checks out with fetch-depth: 0)";
    return null;
  } catch {
    return "not a git repository";
  }
}

function parseList(text: string): { version: string; ids: Set<string> } | null {
  try {
    const data = JSON.parse(text) as {
      version?: unknown;
      entities?: { id?: unknown }[];
    };
    if (typeof data.version !== "string" || !Array.isArray(data.entities))
      return null;
    return {
      version: data.version,
      ids: new Set(
        data.entities
          .map((entity) => entity.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Every version a list file has held on the current branch's history,
 * oldest first, each with the first commit that held it. `relPath` is
 * repository-relative.
 */
export function listHistory(repoRoot: string, relPath: string): ListHistory {
  const unavailable = historyUnavailable(repoRoot);
  if (unavailable !== null) return { ok: false, reason: unavailable };
  let log: string;
  try {
    log = git(repoRoot, ["log", "--reverse", "--format=%H %ct", "--", relPath]);
  } catch {
    return { ok: false, reason: "git log failed" };
  }
  const versions: PublishedVersion[] = [];
  const seen = new Set<string>();
  for (const line of log.split("\n")) {
    const [commit, seconds] = line.trim().split(" ");
    if (!commit || !seconds) continue;
    let text: string;
    try {
      text = git(repoRoot, ["show", `${commit}:${relPath}`]);
    } catch {
      continue; // the file was deleted in this commit
    }
    const parsed = parseList(text);
    if (parsed === null || seen.has(parsed.version)) continue;
    seen.add(parsed.version);
    versions.push({
      version: parsed.version,
      commit,
      date: new Date(Number(seconds) * 1000).toISOString().slice(0, 10),
      ids: parsed.ids,
    });
  }
  return { ok: true, versions };
}
