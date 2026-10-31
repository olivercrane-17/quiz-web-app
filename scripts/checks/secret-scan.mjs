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
 *    <folder>/<id>.json.enc: exactly { v: 1, alg: "A256GCM", kid, iv, data,
 *    tag } with a 12-byte IV and a 16-byte tag. The one exception is
 *    content/sealed/README.md, the recovery notes.
 * 3. Nothing under content/.sealed-plain/, .cache/ or supabase/.generated/
 *    is tracked (staged files count), and no key file is tracked.
 * 4. No public JSON holds sealed content. Every tracked, staged or untracked
 *    (and not ignored) JSON file outside the fixture trees (content/fixtures/
 *    and any __fixtures__/ folder under src/) is parsed, in the working tree
 *    and, where it
 *    differs, in the index. An object with kind mystery, encore or choice, a
 *    clues array, a packet header (stage cold or reveal), or an id, itemId,
 *    nearestId or contentId naming a sealed item (the pattern of §5.4,
 *    without an fx. prefix) fails the scan.
 * 5. No tracked or untracked text file holds a QZ_CONTENT_KEY value. When the
 *    key is available here (QZ_CONTENT_KEY or
 *    ~/.config/quiz-web-app/content.key), no such file holds the key's
 *    base64 or hex text, labelled or not. The key is never printed.
 *
 * It reads `git ls-files`, the envelopes and the text files git would
 * commit, so it takes well under a few seconds. Run it with
 * `npm run check:secrets`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const problems = [];
const FOLDERS = new Set([
  "mysteries",
  "encores",
  "room-packs",
  "schedule",
  "spares",
]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_TEXT = 4_000_000;

function git(args, input) {
  return execFileSync("git", args, {
    cwd: root,
    maxBuffer: 512 * 1024 * 1024,
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

/** Blobs by object name (an id, or ":<path>" for the index), in one call. */
function readObjects(names) {
  const out = new Map();
  if (names.length === 0) return out;
  let data;
  try {
    data = git(["cat-file", "--batch"], `${names.join("\n")}\n`);
  } catch (error) {
    problems.push(`git cat-file failed: ${error.message}`);
    return out;
  }
  let at = 0;
  for (const name of names) {
    const end = data.indexOf(10, at);
    if (end < 0) break;
    const header = data.subarray(at, end).toString("utf8");
    at = end + 1;
    if (header.endsWith(" missing")) continue;
    const size = Number(header.split(" ")[2]);
    out.set(name, data.subarray(at, at + size));
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
    const bytes = Buffer.from(raw, "base64").length;
    if (size !== null && bytes !== size)
      out.push(`${field} is ${bytes} bytes, expected ${size}`);
    if (size === null && bytes === 0) out.push("data is empty");
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
const stagedSealed = gitList(["ls-files", "-s", "-z", "--", "content/sealed"])
  .map((line) => {
    const tab = line.indexOf("\t");
    return { oid: line.split(" ")[1], path: line.slice(tab + 1) };
  })
  .filter(({ path }) => path !== "content/sealed/README.md");
const stagedBlobs = readObjects(stagedSealed.map(({ oid }) => oid));
for (const { oid, path } of stagedSealed) {
  const naming = sealedPathProblem(path);
  if (naming) {
    problems.push(`${path} (staged): ${naming}`);
    continue;
  }
  const blob = stagedBlobs.get(oid);
  if (!blob) continue;
  for (const problem of envelopeProblems(blob.toString("utf8")))
    problems.push(
      `${path}: the staged version is not a valid envelope: ${problem}`,
    );
}

// 3. Tracked files (index included).
const tracked = gitList(["ls-files", "-z", "--cached"]);
const untracked = gitList(["ls-files", "-z", "--others", "--exclude-standard"]);
const trackedSet = new Set(tracked);
/** Tracked paths whose index version differs from the working tree. */
const dirty = new Set(
  gitList(["diff", "--name-only", "-z"]).filter((path) => trackedSet.has(path)),
);
const FORBIDDEN = [
  ["content/.sealed-plain/", "the sealed plaintext workspace is tracked"],
  [".cache/", "tool caches (packets hold sealed plaintext) are tracked"],
  ["supabase/.generated/", "sealed release SQL is tracked"],
];
for (const file of tracked) {
  for (const [prefix, why] of FORBIDDEN) {
    if (file.startsWith(prefix) || file.includes(`/${prefix}`))
      problems.push(`${file}: ${why}`);
  }
  if (
    /(^|\/)content\.key$/.test(file) ||
    file.includes(".config/quiz-web-app/")
  ) {
    problems.push(`${file}: a content key file is tracked`);
  }
}

const TEXT =
  /\.(?:md|json|jsonc|ya?ml|toml|ts|tsx|mts|cts|js|mjs|cjs|sh|txt|env|example|sql|csv|html)$|(?:^|\/)\.env[^/]*$/;

/**
 * The versions of a file git would commit: the working tree's, and the
 * index's where it differs.
 */
const indexCopies = readObjects(
  [...dirty].filter((path) => TEXT.test(path)).map((path) => `:${path}`),
);
function versions(file) {
  const out = [];
  const path = join(root, file);
  if (
    existsSync(path) &&
    statSync(path).isFile() &&
    statSync(path).size <= MAX_TEXT
  )
    out.push({ label: file, text: readFileSync(path, "utf8") });
  const staged = indexCopies.get(`:${file}`);
  if (staged && staged.length <= MAX_TEXT)
    out.push({ label: `${file} (staged)`, text: staged.toString("utf8") });
  return out;
}

// 4. No sealed content in public JSON.
const SEALED_ID = /^(?:m\.[a-z]+\.\d{4}|e\.\d{4}|r\.[a-z0-9-]+\.\d{2})$/;
const ID_KEYS = ["id", "itemId", "nearestId", "contentId"];
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
    for (const child of Object.values(node)) visit(child, depth + 1);
  };
  visit(value, 0);
  return [...found];
}
const publicJson = [...new Set([...tracked, ...untracked])].filter(
  (file) =>
    file.endsWith(".json") &&
    file !== "package-lock.json" &&
    !file.startsWith("content/sealed/") &&
    !file.startsWith("content/fixtures/") &&
    !/(^|\/)__fixtures__\//.test(file),
);
let jsonScanned = 0;
for (const file of publicJson) {
  for (const { label, text } of versions(file)) {
    let value;
    try {
      value = JSON.parse(text.replace(/^﻿/, ""));
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

// 5. No key in text files.
const KEY_VALUE = /QZ_CONTENT_KEY\s*[=:]\s*["']?[A-Za-z0-9+/]{43}=/;
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
  // 43 characters cover the padded and unpadded base64 forms.
  return [bytes.toString("base64").slice(0, 43), bytes.toString("hex")];
}
const keys = keyTexts();
let scanned = 0;
for (const file of [...new Set([...tracked, ...untracked])]) {
  if (!TEXT.test(file) || file.startsWith("content/sealed/")) continue;
  for (const { label, text } of versions(file)) {
    scanned += 1;
    if (KEY_VALUE.test(text))
      problems.push(`${label}: holds a QZ_CONTENT_KEY value`);
    else if (keys.some((key) => text.includes(key)))
      problems.push(
        `${label}: holds the content key (the value of QZ_CONTENT_KEY or the key file)`,
      );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`secret-scan: ${problem}`);
  console.error(`secret-scan: FAILED with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(
  `secret-scan: OK (${envelopes} envelope(s), ${tracked.length} tracked and ${untracked.length} untracked file(s), ${jsonScanned} JSON file(s) checked for sealed content, ${scanned} scanned for keys${keys.length > 0 ? ", the local key included" : ""}).`,
);
