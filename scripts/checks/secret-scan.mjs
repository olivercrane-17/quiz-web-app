/**
 * Fails when sealed content or the content key could leak (ARCHITECTURE
 * §5.4, §5.7). It is the last local gate before a push: CI runs only after
 * the push, when the public repository already holds whatever was pushed.
 *
 * 1. The ignore rules hold: content/.sealed-plain/, .cache/packets/ and
 *    supabase/.generated/ are git-ignored (`git check-ignore`), so neither
 *    the plaintext workspace nor a checker packet is one `git add -A` from a
 *    commit.
 * 2. Every file under content/sealed/, in the working tree and in the index
 *    (what the next commit holds), is an AES-256-GCM envelope named
 *    <folder>/<id>.json.enc in one of the folders of ARCHITECTURE §2.1:
 *    exactly { v: 1, alg: "A256GCM", kid, iv, data, tag } with a 12-byte IV,
 *    a 16-byte tag, and data that does not read as text (ciphertext never
 *    does, so readable data is plaintext in an envelope's shape). The one
 *    exception is content/sealed/README.md, the recovery notes.
 * 3. Nothing under content/.sealed-plain/, .cache/ or supabase/.generated/
 *    is tracked (staged files count), and no key file is: nothing named
 *    content.key, content.key.<anything> or <anything>.key, and nothing
 *    under .config/quiz-web-app/.
 * 4. No public JSON holds sealed content. Every tracked, staged or untracked
 *    (and not ignored) file whose text parses as JSON, whatever its name,
 *    outside the fixture trees (content/fixtures/ and any __fixtures__/
 *    folder under src/) is checked in the working tree and, where it
 *    differs, in the index. An object with kind mystery, encore or choice, a
 *    clues array, a packet header (stage cold or reveal), an id, itemId,
 *    nearestId or contentId naming a sealed item or a list request (the
 *    pattern of §5.4 plus lr.<batch>.<NN>, without an fx. prefix), or a
 *    source naming one of those or a sealed pool's batch (CONTENT_GUIDE
 *    §11.2) fails the scan.
 * 5. No file git could commit holds the key, whatever its name or type:
 *    every version of every tracked, staged or untracked file is read as
 *    bytes, content/sealed/README.md included. A labelled QZ_CONTENT_KEY
 *    value fails, and so does a file holding nothing but a 32-byte base64
 *    value, the shape of the key file. When the key is available here
 *    (QZ_CONTENT_KEY or ~/.config/quiz-web-app/content.key), no file may hold
 *    the key's base64, base64url or hex text, labelled or not. The key is
 *    never printed. Only a file over 100 MiB, which GitHub refuses, is
 *    skipped.
 * 6. The QZ_CONTENT_KEY secret stays where decisions memo §17 puts it, in the
 *    content-sealed job of .github/workflows/:
 *    - only that job references secrets.QZ_CONTENT_KEY (in any case), and no
 *      workflow hands over every secret at once (toJSON(secrets),
 *      secrets[<expression>], secrets: inherit);
 *    - inside that job, QZ_CONTENT_KEY appears only as the env: entry
 *      `QZ_CONTENT_KEY: ${{ secrets.QZ_CONTENT_KEY }}` of the step that runs
 *      `npm run content:check -- --sealed`, which does nothing else, or in
 *      `${{ secrets.QZ_CONTENT_KEY != '' }}`, which only says whether it is
 *      set;
 *    - the job declares no environment:, and a workflow that references the
 *      key runs only on push, pull_request, workflow_dispatch or schedule
 *      (never on pull_request_target, workflow_run, issue_comment or another
 *      event that runs with secrets for people outside the repository),
 *      uses no YAML anchors or aliases, which could carry the key into
 *      another job, and sets no default shell but bash or sh, since one
 *      would wrap the sealed check.
 *
 * It reads `git ls-files`, the index and every file git would commit, so it
 * takes a second or two. It needs only Node and git, so it runs before
 * dependencies are installed. Run it with `npm run check:secrets`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const problems = [];
/**
 * The folders of content/sealed/ (ARCHITECTURE §2.1). The same list as
 * ENVELOPE_FOLDERS in scripts/content/crypto.ts, copied so this scan needs no
 * TypeScript; a test keeps the two equal.
 */
const FOLDERS = new Set([
  "mysteries",
  "encores",
  "room-packs",
  "schedule",
  "spares",
  "challenge-packs",
  "list-requests",
  "audits",
]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** The largest file parsed as JSON. */
const MAX_TEXT = 4_000_000;
/** GitHub refuses a file over 100 MiB, so a larger one is never published. */
const MAX_FILE = 100 * 1024 * 1024;
/**
 * Data at least this long that decodes to readable text is plaintext.
 * Random bytes pass as such text at about 0.46 per byte (UTF-8 sequences
 * included), so a 32-byte ciphertext does with odds near one in fifty
 * billion, and real envelopes hold hundreds of bytes.
 */
const READABLE_MIN = 32;
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** True when the bytes are valid UTF-8 with no control characters but tab, LF and CR. */
function readsAsText(bytes) {
  let text;
  try {
    text = utf8.decode(bytes);
  } catch {
    return false;
  }
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(text);
}

function git(args, input) {
  return execFileSync("git", args, {
    cwd: root,
    maxBuffer: 1024 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });
}

function gitList(args) {
  try {
    return git(args).toString("utf8").split("\0").filter(Boolean);
  } catch (error) {
    problems.push(`git ${args.join(" ")} failed: ${error.message}`);
    return [];
  }
}

/** Blobs by object id, in one call. */
function readObjects(ids) {
  const out = new Map();
  if (ids.length === 0) return out;
  let data;
  try {
    data = git(["cat-file", "--batch"], `${ids.join("\n")}\n`);
  } catch (error) {
    problems.push(`git cat-file failed: ${error.message}`);
    return out;
  }
  let at = 0;
  for (const id of ids) {
    const end = data.indexOf(10, at);
    if (end < 0) break;
    const header = data.subarray(at, end).toString("utf8");
    at = end + 1;
    if (header.endsWith(" missing")) continue;
    const size = Number(header.split(" ")[2]);
    out.set(id, data.subarray(at, at + size));
    at += size + 1;
  }
  return out;
}

function envelopeProblems(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return ["is not JSON"];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return ["is not a JSON object"];
  const out = [];
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "alg,data,iv,kid,tag,v")
    out.push(`has keys ${keys}, expected v, alg, kid, iv, data, tag`);
  if (value.v !== 1) out.push("v is not 1");
  if (value.alg !== "A256GCM") out.push("alg is not A256GCM");
  if (typeof value.kid !== "string" || !/^k[0-9]+$/.test(value.kid))
    out.push("kid is not k<number>");
  for (const [field, size] of [
    ["iv", 12],
    ["tag", 16],
    ["data", null],
  ]) {
    const raw = value[field];
    if (typeof raw !== "string" || !BASE64.test(raw) || raw.length % 4 !== 0) {
      out.push(`${field} is not base64`);
      continue;
    }
    const decoded = Buffer.from(raw, "base64");
    const bytes = decoded.length;
    if (size !== null && bytes !== size)
      out.push(`${field} is ${bytes} bytes, expected ${size}`);
    if (size === null && bytes === 0) out.push("data is empty");
    if (field === "data" && bytes >= READABLE_MIN && readsAsText(decoded))
      out.push(
        "data reads as text, so it is plaintext in an envelope's shape, not ciphertext",
      );
  }
  return out;
}

/** Where a path under content/sealed/ breaks the naming rule, or null. */
function sealedPathProblem(rel) {
  // The recovery notes of ARCHITECTURE §5.4 may sit beside the envelopes.
  if (rel === "content/sealed/README.md") return null;
  const parts = rel.split("/");
  if (
    parts.length !== 4 ||
    !FOLDERS.has(parts[2]) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json\.enc$/.test(parts[3])
  ) {
    return `only <folder>/<id>.json.enc envelopes belong in content/sealed/ (folders: ${[...FOLDERS].join(", ")})`;
  }
  return null;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

// The index, every blob of it (a few tens of MB). Reading all of it, rather
// than the files git reports as changed, makes a staged version count even
// when git would not report it (assume-unchanged, skip-worktree).
const indexEntries = gitList(["ls-files", "-s", "-z"])
  .map((line) => {
    const tab = line.indexOf("\t");
    const [mode, oid] = line.slice(0, tab).split(" ");
    return { mode, oid, path: line.slice(tab + 1) };
  })
  // A submodule (mode 160000) has no blob in this repository.
  .filter(({ mode }) => mode !== "160000");
const indexBlobs = readObjects([
  ...new Set(indexEntries.map(({ oid }) => oid)),
]);
/** Index blob ids by path (more than one during a merge conflict). */
const indexByPath = new Map();
for (const { oid, path } of indexEntries)
  indexByPath.set(path, [...(indexByPath.get(path) ?? []), oid]);

// 1. The ignore rules.
for (const probe of [
  "content/.sealed-plain/probe.json",
  ".cache/packets/probe.json",
  "supabase/.generated/probe.sql",
]) {
  const result = spawnSync("git", ["check-ignore", "-q", probe], {
    cwd: root,
  });
  if (result.status === 1)
    problems.push(
      `${probe}: not git-ignored, so its folder is one "git add -A" from a commit; restore the .gitignore entry (CONTENT_GUIDE §11.2)`,
    );
  else if (result.status !== 0)
    problems.push(`git check-ignore failed for ${probe}`);
}

// 2. Envelopes only under content/sealed/: the working tree...
const sealedDir = join(root, "content", "sealed");
let envelopes = 0;
if (existsSync(sealedDir)) {
  for (const path of walk(sealedDir)) {
    const rel = relative(root, path).split(sep).join("/");
    if (rel === "content/sealed/README.md") continue;
    const naming = sealedPathProblem(rel);
    if (naming) {
      problems.push(`${rel}: ${naming}`);
      continue;
    }
    if (statSync(path).size > 2_000_000) {
      problems.push(`${rel}: larger than 2 MB, which no envelope should be`);
      continue;
    }
    for (const problem of envelopeProblems(readFileSync(path, "utf8")))
      problems.push(`${rel}: not a valid envelope: ${problem}`);
    envelopes += 1;
  }
}
// ...and the index, which is what the next commit holds.
for (const { oid, path } of indexEntries) {
  if (!path.startsWith("content/sealed/")) continue;
  if (path === "content/sealed/README.md") continue;
  const naming = sealedPathProblem(path);
  if (naming) {
    problems.push(`${path} (staged): ${naming}`);
    continue;
  }
  const blob = indexBlobs.get(oid);
  if (!blob) continue;
  for (const problem of envelopeProblems(blob.toString("utf8")))
    problems.push(
      `${path}: the staged version is not a valid envelope: ${problem}`,
    );
}

// 3. Tracked files (index included).
const tracked = [...indexByPath.keys()];
const untracked = gitList(["ls-files", "-z", "--others", "--exclude-standard"]);
const FORBIDDEN = [
  ["content/.sealed-plain/", "the sealed plaintext workspace is tracked"],
  [".cache/", "tool caches (packets hold sealed plaintext) are tracked"],
  ["supabase/.generated/", "sealed release SQL is tracked"],
];
/** content.key, content.key.bak, content.key~, server.key and the like. */
const KEY_FILE = /(?:^|\/)(?:content\.key(?![a-z0-9_])[^/]*|[^/]*\.key)$/i;
for (const file of tracked) {
  for (const [prefix, why] of FORBIDDEN) {
    if (file.startsWith(prefix) || file.includes(`/${prefix}`))
      problems.push(`${file}: ${why}`);
  }
  if (KEY_FILE.test(file) || file.includes(".config/quiz-web-app/"))
    problems.push(`${file}: a key file is tracked`);
}

/**
 * The versions of a file git would commit, as bytes: the working tree's
 * (for a symbolic link, its target path, which is what git stores) and each
 * index version that differs from it.
 */
function versions(file) {
  const out = [];
  let worktree = null;
  try {
    const path = join(root, file);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) worktree = Buffer.from(readlinkSync(path));
    else if (stat.isFile() && stat.size <= MAX_FILE)
      worktree = readFileSync(path);
  } catch {
    // Gone from the working tree; its index version still counts.
  }
  if (worktree) out.push({ label: file, bytes: worktree });
  for (const oid of indexByPath.get(file) ?? []) {
    const blob = indexBlobs.get(oid);
    if (!blob || blob.length > MAX_FILE) continue;
    if (worktree && blob.equals(worktree)) continue;
    out.push({ label: `${file} (staged)`, bytes: blob });
  }
  return out;
}

// 4. No sealed content in public JSON.
/** Sealed item ids (ARCHITECTURE §5.4) and list request ids (CONTENT_GUIDE §2.12). */
const SEALED_ID =
  /^(?:m\.[a-z]+\.\d{4}|e\.\d{4}|r\.[a-z0-9-]+\.\d{2}|lr\.[a-z0-9.-]+\.\d{2})$/;
const ID_KEYS = ["id", "itemId", "nearestId", "contentId"];
/**
 * A sealed id, a list request or a sealed pool's batch (m.hist.b02, e.b01,
 * r.all-sorts.b01) anywhere in a source, which is free text such as
 * "l.city.b02; checked geonames-cities@1.2.0" (CONTENT_GUIDE §2.10, §11.2).
 */
const SEALED_SOURCE =
  /(?<![\w.-])(?:m\.[a-z]+\.(?:\d{4}|b\d{2})|e\.(?:\d{4}|b\d{2})|r\.[a-z0-9-]+\.b?\d{2}|lr\.[a-z0-9.-]+\.\d{2})(?![\w-]|\.\w)/;
function sealedShapes(value) {
  const found = new Set();
  const visit = (node, depth) => {
    if (depth > 64 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    if (["mystery", "encore", "choice"].includes(node.kind))
      found.add(`a sealed item (kind ${node.kind})`);
    if (Array.isArray(node.clues)) found.add("mystery clues");
    if (node.stage === "cold" || node.stage === "reveal")
      found.add("a checker packet");
    for (const key of ID_KEYS) {
      if (typeof node[key] === "string" && SEALED_ID.test(node[key]))
        found.add(`a sealed item id in ${key}`);
    }
    if (typeof node.source === "string" && SEALED_SOURCE.test(node.source))
      found.add("a source naming sealed content");
    for (const child of Object.values(node)) visit(child, depth + 1);
  };
  visit(value, 0);
  return [...found];
}
const checksJson = (file) =>
  file !== "package-lock.json" &&
  !file.startsWith("content/sealed/") &&
  !file.startsWith("content/fixtures/") &&
  !/(^|\/)__fixtures__\//.test(file);

// 5. No key in any file.
/** A labelled key value: 43 base64 characters, padded or not. */
const KEY_VALUE =
  /QZ_CONTENT_KEY\s*[=:]\s*["']?[A-Za-z0-9+/]{43}(?:=|(?![A-Za-z0-9+/=]))/i;
/** A file holding only a 32-byte value in base64, as content.key does. */
const KEY_SHAPED = /^\s*[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=\s*$/;
/** The key's own text, when it is available on this machine. */
function keyTexts() {
  let raw = process.env.QZ_CONTENT_KEY?.trim();
  if (!raw) {
    const path = join(homedir(), ".config", "quiz-web-app", "content.key");
    if (existsSync(path)) raw = readFileSync(path, "utf8").trim();
  }
  if (!raw || !BASE64.test(raw)) return [];
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) return [];
  const hex = bytes.toString("hex");
  return [
    // 43 characters cover the padded and unpadded base64 forms.
    bytes.toString("base64").slice(0, 43),
    bytes.toString("base64url"),
    hex,
    hex.toUpperCase(),
  ];
}
const keys = keyTexts();

let jsonScanned = 0;
let scanned = 0;
for (const file of [...new Set([...tracked, ...untracked])]) {
  const json = checksJson(file);
  for (const { label, bytes } of versions(file)) {
    // Every form of the key is ASCII, and latin1 turns each byte into one
    // character, so this finds it in UTF-8 text and binary files alike.
    const text = bytes.toString("latin1");
    scanned += 1;
    if (KEY_VALUE.test(text))
      problems.push(`${label}: holds a QZ_CONTENT_KEY value`);
    else if (keys.some((key) => text.includes(key)))
      problems.push(
        `${label}: holds the content key (the value of QZ_CONTENT_KEY or the key file)`,
      );
    else if (KEY_SHAPED.test(text))
      problems.push(
        `${label}: holds nothing but a 32-byte base64 value, which is what the content key file looks like`,
      );

    if (!json || bytes.length > MAX_TEXT) continue;
    if (!/^\s*[[{]/.test(text.slice(0, 4096))) continue;
    let value;
    try {
      value = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
    } catch {
      continue;
    }
    jsonScanned += 1;
    for (const shape of sealedShapes(value))
      problems.push(
        `${label}: holds ${shape}; sealed content is committed only as envelopes in content/sealed/ (ARCHITECTURE §5.4)`,
      );
  }
}

// 6. The QZ_CONTENT_KEY secret in workflows (decisions memo §17). Problems
// name line numbers only, never the line.
const MEMO = "(decisions memo §17)";
/** The key by name, as a secret or a variable, in any case: GitHub ignores it. */
const SECRET_REF =
  /\b(secrets|vars)\s*(?:\.\s*QZ_CONTENT_KEY\b|\[\s*(['"])QZ_CONTENT_KEY\2\s*\])/i;
const NAMES_KEY = /\bQZ_CONTENT_KEY\b/i;
/** The value of the env: entry that hands the key to the sealed check. */
const KEY_ENTRY = /^\$\{\{\s*secrets\.QZ_CONTENT_KEY\s*\}\}$/;
/** Whether the secret is set, which reveals nothing else about it. */
const KEY_PRESENT = /\$\{\{\s*secrets\.QZ_CONTENT_KEY\s*[!=]=\s*''\s*\}\}/gi;
/** Events that never run with secrets for code or input from outside the repository. */
const SAFE_TRIGGERS = ["push", "pull_request", "workflow_dispatch", "schedule"];
/** Everything a step that receives the key may set. */
const KEY_STEP_KEYS = new Set([
  "name",
  "id",
  "if",
  "env",
  "run",
  "timeout-minutes",
  "continue-on-error",
]);
const BLOCK_SCALAR = /^[|>][1-9+-]*$/;

/**
 * The one command the key may reach: it decrypts in memory and reports only
 * through the redacting reporter (ARCHITECTURE §5.4, §5.7). Another command
 * joins it only if it does the same and writes nothing a later step could
 * publish, which rules out content:release.
 */
function isSealedCheck(command) {
  const words = command.trim().split(/\s+/);
  if (words.slice(0, 4).join(" ") !== "npm run content:check --") return false;
  const flags = words.slice(4);
  return (
    flags.includes("--sealed") &&
    new Set(flags).size === flags.length &&
    flags.every((flag) =>
      ["--sealed", "--strict", "--skip-dedupe"].includes(flag),
    )
  );
}

function unquote(text) {
  const value = text.trim();
  return /^"[^"]*"$|^'[^']*'$/.test(value) ? value.slice(1, -1) : value;
}

/** A value without its trailing comment (` # ...` outside quotes). */
function withoutComment(value) {
  const text = value.trim();
  const quote = /^["']/.exec(text)?.[0];
  if (quote) {
    const end = text.indexOf(quote, 1);
    return end < 0 ? text : text.slice(0, end + 1);
  }
  return text.replace(/(?:^|\s)#.*$/, "").trim();
}

/**
 * The lines of a workflow, each with its key path. It follows block
 * mappings, block sequences and block scalars by indentation, the way
 * workflows are written; a flow collection or a multi-line plain scalar
 * stays part of the line it starts on. It is not a YAML parser, so the rules
 * below fail closed: a reference they cannot place is a violation.
 *
 * Each entry: n (line number), path (the keys above it and its own, with
 * "-" for a sequence item, which carries a unique item number), key (or
 * null), value (after the key), node (the line from its first key or
 * scalar on), text (the raw line), content (true inside a block scalar).
 */
function workflowLines(text) {
  const out = [];
  let stack = [];
  /** The column a block scalar's lines must be indented past, or null. */
  let block = null;
  let items = 0;
  text.split(/\r?\n/).forEach((line, index) => {
    const n = index + 1;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (block !== null) {
      if (trimmed === "" || indent > block) {
        if (trimmed !== "")
          out.push({
            n,
            path: stack.slice(),
            key: null,
            value: "",
            node: trimmed,
            text: line,
            content: true,
          });
        return;
      }
      block = null;
    }
    if (trimmed === "" || trimmed.startsWith("#")) return;
    if (trimmed === "---" || trimmed === "...") {
      stack = [];
      return;
    }
    let col = indent;
    let rest = line.slice(indent);
    let dash = -1;
    /**
     * Leaves the entries this line closes. A sequence item may sit at its
     * parent key's own column (`steps:` then `- run: ...` beneath it), so a
     * dash closes an earlier item at its column but not that key.
     */
    const pop = (isDash = false) => {
      for (;;) {
        const top = stack[stack.length - 1];
        if (!top) return;
        if (
          top.indent > col ||
          (top.indent === col && (!isDash || top.key === "-"))
        )
          stack.pop();
        else return;
      }
    };
    while (/^-(?:\s|$)/.test(rest)) {
      pop(true);
      dash = col;
      items += 1;
      stack.push({ indent: col, key: "-", item: items });
      const after = rest.slice(1);
      col += 1 + after.length - after.trimStart().length;
      rest = after.trimStart();
    }
    pop();
    const match =
      /^(?:"([^"]*)"|'([^']*)'|([^\s"'#{[][^#]*?))\s*:(?=\s|$)/.exec(rest);
    const entry = {
      n,
      path: null,
      key: null,
      value: rest,
      node: rest,
      text: line,
      content: false,
    };
    if (match) {
      entry.key = match[1] ?? match[2] ?? match[3];
      entry.value = rest.slice(match[0].length);
      stack.push({ indent: col, key: entry.key, item: 0 });
    }
    entry.path = stack.slice();
    out.push(entry);
    if (BLOCK_SCALAR.test(withoutComment(entry.value)))
      block = match ? col : dash >= 0 ? dash : col - 1;
  });
  return out;
}

/** Splits a flow collection's inside at its top-level commas. */
function flowItems(inside) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inside.length; i += 1) {
    const c = inside[i];
    if (c === "[" || c === "{") depth += 1;
    else if (c === "]" || c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      out.push(inside.slice(start, i));
      start = i + 1;
    }
  }
  out.push(inside.slice(start));
  return out.map((item) => item.trim()).filter(Boolean);
}

/** The events of a workflow's on:, each with its line, or null without one. */
function triggersOf(lines) {
  const on = lines.find(
    (line) =>
      !line.content &&
      line.path.length === 1 &&
      ["on", "true"].includes(line.key),
  );
  if (!on) return null;
  const inline = withoutComment(on.value);
  if (inline.startsWith("[") || inline.startsWith("{")) {
    const mapping = inline.startsWith("{");
    return flowItems(inline.slice(1, -1)).map((item) => ({
      n: on.n,
      name: unquote(mapping ? item.split(":")[0] : item),
    }));
  }
  if (inline) return [{ n: on.n, name: unquote(inline) }];
  return lines
    .filter(
      (line) =>
        !line.content && line.path.length === 2 && line.path[0] === on.path[0],
    )
    .map((line) => ({
      n: line.n,
      name:
        line.path[1].key === "-"
          ? unquote(withoutComment(line.value))
          : line.key,
    }));
}

/** True when an expression on the line uses the secrets context as a whole. */
function usesAllSecrets(line) {
  for (const [, body] of line.matchAll(/\$\{\{(.*?)(?:\}\}|$)/g)) {
    const rest = body
      .replace(/\bsecrets\s*\.\s*[A-Za-z_][\w-]*/gi, "")
      .replace(/\bsecrets\s*\[\s*'(?:[^']|'')*'\s*\]/gi, "")
      .replace(/'(?:[^']|'')*'/g, "");
    if (/\bsecrets\b/i.test(rest)) return true;
  }
  return false;
}

function workflowProblems(text) {
  const out = [];
  const fail = (n, message) => out.push(`line ${n}: ${message}`);
  const lines = workflowLines(text);
  const keyAt = (line, depth) => line.path[depth]?.key;
  const sealedJob = (line) =>
    keyAt(line, 0) === "jobs" && keyAt(line, 1) === "content-sealed";
  /** The number of the content-sealed step a line belongs to, or 0. */
  const stepOf = (line) =>
    sealedJob(line) && keyAt(line, 2) === "steps" && keyAt(line, 3) === "-"
      ? line.path[3].item
      : 0;
  let referencesKey = false;
  const keySteps = new Set();

  for (const line of lines) {
    const reference = SECRET_REF.exec(line.text);
    if (reference) {
      referencesKey = true;
      if (!sealedJob(line))
        fail(
          line.n,
          `references ${reference[1].toLowerCase()}.QZ_CONTENT_KEY outside the content-sealed job ${MEMO}`,
        );
    }
    if (usesAllSecrets(line.text))
      fail(
        line.n,
        `uses the secrets context as a whole (such as toJSON(secrets)), which hands over QZ_CONTENT_KEY with every other secret; name each secret a step needs ${MEMO}`,
      );
    if (
      !line.content &&
      line.key?.toLowerCase() === "secrets" &&
      /^inherit$/i.test(unquote(withoutComment(line.value)))
    )
      fail(
        line.n,
        `passes every secret, QZ_CONTENT_KEY included, to a called workflow (secrets: inherit); pass the secrets it needs by name ${MEMO}`,
      );
    if (!sealedJob(line)) continue;

    if (!line.content && line.path.length === 3 && line.key === "environment")
      fail(
        line.n,
        `the content-sealed job declares an environment; QZ_CONTENT_KEY is a repository secret and the job must not ${MEMO}`,
      );
    if (!NAMES_KEY.test(line.text.replace(KEY_PRESENT, ""))) continue;
    const step = stepOf(line);
    if (
      step !== 0 &&
      !line.content &&
      line.path.length === 6 &&
      keyAt(line, 4) === "env" &&
      line.key === "QZ_CONTENT_KEY" &&
      KEY_ENTRY.test(unquote(withoutComment(line.value)))
    )
      keySteps.add(step);
    else if (keyAt(line, 2) === "env")
      fail(
        line.n,
        `gives QZ_CONTENT_KEY to every step of the content-sealed job; map it in the env: of the one step that runs the sealed check ${MEMO}`,
      );
    else
      fail(
        line.n,
        `names QZ_CONTENT_KEY, which only the step that runs the sealed check may, in its env: entry QZ_CONTENT_KEY: \${{ secrets.QZ_CONTENT_KEY }}; nothing else may print or pass the key on ${MEMO}`,
      );
  }

  // A step that receives the key runs the sealed check and nothing else.
  for (const step of keySteps) {
    const own = lines.filter((line) => stepOf(line) === step);
    for (const line of own) {
      if (line.content || line.path.length !== 5) continue;
      if (!KEY_STEP_KEYS.has(line.key ?? ""))
        fail(
          line.n,
          `the step that receives QZ_CONTENT_KEY sets something other than name, id, if, env, run, timeout-minutes or continue-on-error ${MEMO}`,
        );
    }
    const run = own.find(
      (line) => !line.content && line.path.length === 5 && line.key === "run",
    );
    const commands = run
      ? [
          withoutComment(run.value),
          ...own
            .filter(
              (line) =>
                line.content &&
                line.path.length === 5 &&
                line.path[4] === run.path[4],
            )
            .map((line) => line.text.trim()),
        ].filter(
          (command) =>
            command !== "" &&
            !BLOCK_SCALAR.test(command) &&
            !command.startsWith("#"),
        )
      : [];
    if (commands.length !== 1 || !isSealedCheck(unquote(commands[0])))
      fail(
        run?.n ?? own[0].n,
        `the step that receives QZ_CONTENT_KEY must run npm run content:check -- --sealed and nothing else ${MEMO}`,
      );
  }

  if (referencesKey) {
    const triggers = triggersOf(lines);
    if (triggers === null || triggers.length === 0)
      fail(
        1,
        `uses QZ_CONTENT_KEY but has no on: events this scan can read ${MEMO}`,
      );
    for (const { n, name } of triggers ?? []) {
      if (SAFE_TRIGGERS.includes(name)) continue;
      fail(
        n,
        `runs on ${/^[a-z_]+$/.test(name) ? name : "an event"}, which can run with secrets for code or input from outside the repository, in a workflow that uses QZ_CONTENT_KEY; such a workflow runs only on ${SAFE_TRIGGERS.join(", ")} ${MEMO}`,
      );
    }
    for (const line of lines) {
      if (line.content) continue;
      // A default shell wraps every run: step, the sealed check's included.
      if (
        line.key === "shell" &&
        (keyAt(line, 0) === "defaults" ||
          (sealedJob(line) && keyAt(line, 2) === "defaults")) &&
        !["bash", "sh"].includes(unquote(withoutComment(line.value)))
      )
        fail(
          line.n,
          `sets a shell other than bash or sh where the step that receives QZ_CONTENT_KEY would run in it ${MEMO}`,
        );
      if (
        line.key === "<<" ||
        /^[&*]\S/.test(line.node) ||
        /^[&*]\S/.test(withoutComment(line.value))
      )
        fail(
          line.n,
          `uses a YAML anchor or alias in a workflow that uses QZ_CONTENT_KEY, which could carry the key into another job ${MEMO}`,
        );
    }
  }
  return out;
}

let workflows = 0;
for (const file of [...new Set([...tracked, ...untracked])]) {
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)) continue;
  for (const { label, bytes } of versions(file)) {
    workflows += 1;
    for (const problem of workflowProblems(bytes.toString("utf8")))
      problems.push(`${label}: ${problem}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`secret-scan: ${problem}`);
  console.error(`secret-scan: FAILED with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(
  `secret-scan: OK (${envelopes} envelope(s), ${tracked.length} tracked and ${untracked.length} untracked file(s), ${jsonScanned} JSON file(s) checked for sealed content, ${scanned} scanned for keys${keys.length > 0 ? ", the local key included" : ""}, ${workflows} workflow file(s) checked for the key secret).`,
);
