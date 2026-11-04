// @vitest-environment node
/**
 * CNT-0, sealed-content safety (ARCHITECTURE §5.4 and §12.3): the envelope
 * crypto in scripts/content/crypto.ts, the seal, unseal and keygen CLIs, the
 * ignore rules and the key recovery steps of content/sealed/README.md. The
 * secret scan's own tests sit in secret-scan.test.ts, and the escrow table's
 * SQL test in supabase/tests/escrow/key_escrow.test.sql.
 *
 * Every key here is a throwaway, and every CLI runs with HOME set to a fresh
 * temporary folder and an environment without QZ_CONTENT_KEY unless a test
 * passes a throwaway one, so the machine's own key file is never read.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  ENVELOPE_FOLDERS,
  deriveSealKeys,
  envelopeText,
  isEnvelope,
  keyFingerprint,
  keyMatchesEnvelopes,
  openEnvelope,
  sealBytes,
  type Envelope,
} from "../../../scripts/content/crypto.ts";
import {
  REPO_ROOT,
  fxEncore,
  fxMystery,
  removeTempDirs,
  tempDir,
} from "./__fixtures__/builders.ts";

afterAll(removeTempDirs);

/**
 * The recovery tests' throwaway key: the bytes 0 to 31. The escrow SQL test
 * inserts the same bytes inside a rolled-back transaction and checks that
 * the recovery query returns exactly this text.
 */
const RECOVERY_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const RECOVERY_KEY_TEXT = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
/** Another throwaway key, for the wrong-key cases. */
const OTHER_KEY = Buffer.alloc(32, 0x5a);

const keys = deriveSealKeys(RECOVERY_KEY);
const mystery = Buffer.from(`${JSON.stringify(fxMystery(), null, 2)}\n`);
const encore = Buffer.from(`${JSON.stringify(fxEncore(), null, 2)}\n`);

/** Every string value of a JSON value, for "no plaintext in the output". */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
}
const SECRETS = [
  ...strings(fxMystery()).filter((text) => text.length >= 6),
  RECOVERY_KEY_TEXT.slice(0, 20),
  OTHER_KEY.toString("base64").slice(0, 20),
];
function expectNoSecrets(output: string): void {
  for (const secret of SECRETS) expect(output).not.toContain(secret);
}

/** Flips one bit of a base64 field. */
function flip(field: string, index = 0): string {
  const bytes = Buffer.from(field, "base64");
  bytes[index] = (bytes[index] ?? 0) ^ 1;
  return bytes.toString("base64");
}

/** A throwaway repository the content CLIs accept, with the ignore rules. */
function makeRepo(): string {
  const repo = tempDir("qz-cnt0-repo-");
  spawnSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(join(repo, "package.json"), "{}\n");
  writeFileSync(
    join(repo, ".gitignore"),
    "content/.sealed-plain/\n.cache/\nsupabase/.generated/\n",
  );
  mkdirSync(join(repo, "content"), { recursive: true });
  return repo;
}

function writePlain(repo: string, rel: string, bytes: Buffer): void {
  const path = join(repo, "content", ".sealed-plain", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, bytes);
}

const envelopePath = (repo: string, rel: string) =>
  join(repo, "content", "sealed", `${rel}.enc`);

interface CliOptions {
  /** A throwaway QZ_CONTENT_KEY for this run. */
  key?: Buffer;
  input?: string;
}

/** Runs scripts/content/<script>.ts as npm would, in a sandboxed environment. */
function cli(
  repo: string,
  home: string,
  script: string,
  args: string[] = [],
  options: CliOptions = {},
) {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      join(REPO_ROOT, "scripts", "content", `${script}.ts`),
      ...args,
    ],
    {
      cwd: repo,
      encoding: "utf8",
      input: options.input ?? "",
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        HOME: home,
        ...(options.key
          ? { QZ_CONTENT_KEY: options.key.toString("base64") }
          : {}),
      },
    },
  );
  const out = `${result.stdout}${result.stderr}`;
  expectNoSecrets(out);
  return { status: result.status, stdout: result.stdout, out };
}

/** A repository whose envelopes were sealed with RECOVERY_KEY, workspace gone. */
function sealedRepo(): { repo: string; home: string } {
  const repo = makeRepo();
  const home = tempDir("qz-cnt0-home-");
  writePlain(repo, "mysteries/m.geo.0101.json", mystery);
  writePlain(repo, "encores/e.0101.json", encore);
  const sealed = cli(repo, home, "seal", [], { key: RECOVERY_KEY });
  expect(sealed.status, sealed.out).toBe(0);
  expect(sealed.stdout).toContain("content:seal: 2 written, 0 unchanged");
  spawnSync("rm", ["-rf", join(repo, "content", ".sealed-plain")]);
  return { repo, home };
}

describe("CNT-0 envelopes (scripts/content/crypto.ts)", () => {
  it("CNT-0 encryption round trip: an envelope opens to the exact plaintext and holds only v, alg, kid, iv, data and tag", () => {
    const envelope = sealBytes(keys, mystery);
    expect(Object.keys(envelope).sort()).toEqual([
      "alg",
      "data",
      "iv",
      "kid",
      "tag",
      "v",
    ]);
    expect(envelope).toMatchObject({ v: 1, alg: "A256GCM", kid: "k1" });
    expect(Buffer.from(envelope.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(envelope.tag, "base64")).toHaveLength(16);
    // Through the file text, as content/sealed/ stores it.
    const text = envelopeText(envelope);
    const parsed: unknown = JSON.parse(text);
    expect(isEnvelope(parsed)).toBe(true);
    expect(openEnvelope(keys, parsed as Envelope).equals(mystery)).toBe(true);
    expectNoSecrets(text);
    expectNoSecrets(Buffer.from(envelope.data, "base64").toString("latin1"));
  });

  it("CNT-0 unchanged plaintext gives unchanged ciphertext: the IV is HMAC-SHA256(k_iv, plaintext), so the envelope is byte-identical", () => {
    const first = envelopeText(sealBytes(keys, mystery));
    expect(envelopeText(sealBytes(deriveSealKeys(RECOVERY_KEY), mystery))).toBe(
      first,
    );
    const iv = (envelope: Envelope) => envelope.iv;
    expect(iv(sealBytes(keys, encore))).not.toBe(iv(sealBytes(keys, mystery)));
    // One changed byte changes the IV and so the whole envelope.
    const edited = Buffer.from(mystery);
    edited[edited.length - 2] = 0x20;
    const changed = sealBytes(keys, edited);
    expect(changed.iv).not.toBe(sealBytes(keys, mystery).iv);
    expect(changed.data).not.toBe(sealBytes(keys, mystery).data);
    // A different key gives a different envelope for the same plaintext.
    expect(
      envelopeText(sealBytes(deriveSealKeys(OTHER_KEY), mystery)),
    ).not.toBe(first);
  });

  it("CNT-0 a tampered tag fails, and so do tampered data, a borrowed IV, another kid and a wrong key", () => {
    const envelope = sealBytes(keys, mystery);
    expect(() =>
      openEnvelope(keys, { ...envelope, tag: flip(envelope.tag) }),
    ).toThrow(/decryption failed/);
    expect(() =>
      openEnvelope(keys, { ...envelope, tag: flip(envelope.tag, 15) }),
    ).toThrow(/decryption failed/);
    expect(() =>
      openEnvelope(keys, { ...envelope, data: flip(envelope.data, 40) }),
    ).toThrow(/decryption failed/);
    expect(() =>
      openEnvelope(keys, { ...envelope, iv: sealBytes(keys, encore).iv }),
    ).toThrow(/decryption failed|IV does not match/);
    expect(() => openEnvelope(keys, { ...envelope, kid: "k2" })).toThrow(
      /does not match the loaded key/,
    );
    expect(() => openEnvelope(deriveSealKeys(OTHER_KEY), envelope)).toThrow(
      /decryption failed/,
    );
  });

  it("derives k_enc, k_iv and k_order with HKDF-SHA256 from the documented strings", () => {
    // Pinned so an accidental change to a derivation string, which would
    // orphan every committed envelope, fails here first. The IV and the
    // fingerprint were also recomputed outside Node (Python's hmac and
    // hashlib, HKDF written out by hand from the strings in crypto.ts).
    expect(sealBytes(keys, Buffer.from('{"id":"m.geo.0101"}\n'))).toEqual({
      v: 1,
      alg: "A256GCM",
      kid: "k1",
      iv: "wjYIuKMGogYHx6pd",
      data: "32mU0QudxseBVOtbzaFKld+ZrjE=",
      tag: "BeR06I2xogNeBOY6F8Ilfg==",
    });
    expect(keyFingerprint(RECOVERY_KEY)).toBe("aa1df5ea9a367b2d");
    const derived = [keys.enc, keys.iv, keys.order].map((key) =>
      key.toString("hex"),
    );
    expect(new Set(derived).size).toBe(3);
  });
});

describe("CNT-0 the ignore rules (.gitignore)", () => {
  const ignored = (path: string) =>
    spawnSync("git", ["check-ignore", "-q", path], { cwd: REPO_ROOT }).status;

  it("CNT-0 git check-ignore -q content/.sealed-plain/probe.json succeeds, and so do the release SQL and tool caches, while envelopes stay committable", () => {
    expect(ignored("content/.sealed-plain/probe.json")).toBe(0);
    expect(ignored("content/.sealed-plain/mysteries/m.geo.0101.json")).toBe(0);
    expect(ignored("supabase/.generated/probe.sql")).toBe(0);
    expect(ignored(".cache/probe.json")).toBe(0);
    expect(ignored(".cache/packets/probe.json")).toBe(0);
    // Envelopes, their README and the escrow test must never be ignored.
    expect(ignored("content/sealed/mysteries/m.geo.0101.json.enc")).toBe(1);
    expect(ignored("content/sealed/README.md")).toBe(1);
    expect(ignored("supabase/tests/escrow/key_escrow.test.sql")).toBe(1);
  });
});

describe("CNT-0 key recovery (content/sealed/README.md)", () => {
  it("CNT-0 the recovery steps restore a key that content:unseal -- --verify accepts", () => {
    const { repo, home } = sealedRepo();
    const keyFile = join(home, ".config", "quiz-web-app", "content.key");

    // The situation the steps are for: envelopes, and no key on the machine.
    const before = cli(repo, home, "unseal", ["--verify"]);
    expect(before.status).toBe(1);
    expect(before.out).toContain("no content key");
    expect(before.out).toContain("content/sealed/README.md");

    // Step 1 reads the key's base64 text: a single 44-character line, which
    // is what Postgres's encode(key, 'base64') returns for 32 bytes (the
    // escrow SQL test checks that on the real table).
    expect(Buffer.from(RECOVERY_KEY_TEXT, "base64").equals(RECOVERY_KEY)).toBe(
      true,
    );
    expect(
      readFileSync(
        join(REPO_ROOT, "supabase/tests/escrow/key_escrow.test.sql"),
        "utf8",
      ),
    ).toContain(RECOVERY_KEY_TEXT);

    // Step 2: npm run content:keygen -- --restore, the key on stdin.
    const restored = cli(repo, home, "keygen", ["--restore"], {
      input: `${RECOVERY_KEY_TEXT}\n`,
    });
    expect(restored.status, restored.out).toBe(0);
    const fingerprint = keyFingerprint(RECOVERY_KEY);
    expect(restored.stdout).toContain(
      `content:keygen: restored ${keyFile} (mode 0600), fingerprint ${fingerprint}.`,
    );
    expect(restored.stdout).toContain("It opens 2 of 2 envelope(s).");
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    expect(statSync(join(keyFile, "..")).mode & 0o777).toBe(0o700);
    expect(readFileSync(keyFile, "utf8")).toBe(`${RECOVERY_KEY_TEXT}\n`);

    // Step 3: the fingerprint, then the in-memory check.
    const check = cli(repo, home, "keygen", ["--check"]);
    expect(check.stdout).toContain(`fingerprint ${fingerprint}`);
    const verify = cli(repo, home, "unseal", ["--verify"]);
    expect(verify.status, verify.out).toBe(0);
    expect(verify.stdout.trim()).toBe(
      `content:unseal: 2 envelope(s) decrypt with key ${fingerprint}, 0 failed.`,
    );
    // --verify writes nothing.
    expect(existsSync(join(repo, "content", ".sealed-plain"))).toBe(false);

    // The restored key really is the one: the workspace comes back exactly.
    const unsealed = cli(repo, home, "unseal");
    expect(unsealed.status, unsealed.out).toBe(0);
    expect(
      readFileSync(
        join(repo, "content", ".sealed-plain", "mysteries", "m.geo.0101.json"),
      ).equals(mystery),
    ).toBe(true);
  });

  it("accepts a pasted key with line breaks, and refuses one that opens none of the envelopes without writing anything", () => {
    const { repo, home } = sealedRepo();
    const keyFile = join(home, ".config", "quiz-web-app", "content.key");
    const wrong = cli(repo, home, "keygen", ["--restore"], {
      input: `${OTHER_KEY.toString("base64")}\n`,
    });
    expect(wrong.status).toBe(1);
    expect(wrong.out).toContain(
      "the key on stdin opens none of the 2 envelope(s) in content/sealed/",
    );
    expect(existsSync(keyFile)).toBe(false);
    const junk = cli(repo, home, "keygen", ["--restore"], {
      input: "kid: k1, not a key!\n",
    });
    expect(junk.status).toBe(1);
    expect(junk.out).toContain("the key on stdin is not base64");
    const short = cli(repo, home, "keygen", ["--restore"], {
      input: `${Buffer.alloc(16, 1).toString("base64")}\n`,
    });
    expect(short.out).toContain("must decode to 32 bytes, got 16");
    expect(existsSync(keyFile)).toBe(false);
    const wrapped = cli(repo, home, "keygen", ["--restore"], {
      input: `${RECOVERY_KEY_TEXT.slice(0, 20)}\n${RECOVERY_KEY_TEXT.slice(20)}\n`,
    });
    expect(wrapped.status, wrapped.out).toBe(0);
    expect(readFileSync(keyFile, "utf8")).toBe(`${RECOVERY_KEY_TEXT}\n`);
  });

  it("never restores over a key file or beside QZ_CONTENT_KEY, and reads nothing when it would refuse", () => {
    const { repo, home } = sealedRepo();
    const keyFile = join(home, ".config", "quiz-web-app", "content.key");
    mkdirSync(join(keyFile, ".."), { recursive: true });
    writeFileSync(keyFile, "placeholder\n");
    const over = cli(repo, home, "keygen", ["--restore"], {
      input: `${RECOVERY_KEY_TEXT}\n`,
    });
    expect(over.status).toBe(1);
    expect(over.out).toContain("already exists. Refusing to overwrite");
    expect(readFileSync(keyFile, "utf8")).toBe("placeholder\n");
    const env = cli(repo, tempDir("qz-cnt0-home-"), "keygen", ["--restore"], {
      key: RECOVERY_KEY,
      input: `${RECOVERY_KEY_TEXT}\n`,
    });
    expect(env.status).toBe(1);
    expect(env.out).toContain("QZ_CONTENT_KEY is already set");
    const both = cli(repo, home, "keygen", ["--check", "--restore"]);
    expect(both.status).toBe(2);
  });
});

describe("CNT-0 one key per project", () => {
  it("content:keygen refuses to create a key while content/sealed/ holds envelopes, and creates one in an empty project", () => {
    const { repo, home } = sealedRepo();
    const refused = cli(repo, home, "keygen");
    expect(refused.status).toBe(1);
    expect(refused.out).toContain(
      "content/sealed/ holds 2 envelope(s), sealed with the project's existing key",
    );
    expect(
      existsSync(join(home, ".config", "quiz-web-app", "content.key")),
    ).toBe(false);

    const empty = makeRepo();
    const freshHome = tempDir("qz-cnt0-home-");
    const created = cli(empty, freshHome, "keygen");
    expect(created.status, created.out).toBe(0);
    expect(created.stdout).toMatch(
      /content:keygen: created .*content\.key \(mode 0600\), fingerprint [0-9a-f]{16}\./,
    );
    const again = cli(empty, freshHome, "keygen");
    expect(again.status).toBe(1);
    expect(again.out).toContain("Refusing to overwrite the content key");
  });

  it("content:seal refuses a key that opens none of the existing envelopes and writes nothing", () => {
    const { repo, home } = sealedRepo();
    const before = readFileSync(
      envelopePath(repo, "mysteries/m.geo.0101.json"),
    );
    writePlain(repo, "mysteries/m.geo.0101.json", mystery);
    writePlain(repo, "mysteries/m.geo.0102.json", encore);
    const wrong = cli(repo, home, "seal", [], { key: OTHER_KEY });
    expect(wrong.status).toBe(1);
    expect(wrong.out).toContain(
      "the content key opens none of the 2 envelope(s) in content/sealed/",
    );
    expect(
      readFileSync(envelopePath(repo, "mysteries/m.geo.0101.json")).equals(
        before,
      ),
    ).toBe(true);
    expect(existsSync(envelopePath(repo, "mysteries/m.geo.0102.json"))).toBe(
      false,
    );
    // The right key seals the new file and leaves the old one alone.
    const right = cli(repo, home, "seal", [], { key: RECOVERY_KEY });
    expect(right.status, right.out).toBe(0);
    expect(right.stdout).toContain("content:seal: 1 written, 1 unchanged");
  });

  it("keyMatchesEnvelopes judges by the first envelope that opens, and has nothing to judge in an empty or corrupt folder", async () => {
    const { repo } = sealedRepo();
    const dir = join(repo, "content", "sealed");
    expect(await keyMatchesEnvelopes(keys, dir)).toEqual({
      matches: true,
      checked: 1,
    });
    expect(await keyMatchesEnvelopes(deriveSealKeys(OTHER_KEY), dir)).toEqual({
      matches: false,
      checked: 2,
    });
    const corrupt = tempDir("qz-cnt0-corrupt-");
    mkdirSync(join(corrupt, "mysteries"));
    writeFileSync(join(corrupt, "mysteries", "m.geo.0101.json.enc"), "{}\n");
    expect(await keyMatchesEnvelopes(keys, corrupt)).toEqual({
      matches: true,
      checked: 0,
    });
  });
});

describe("CNT-0 content:seal, content:unseal and --verify", () => {
  it("seal, unseal and seal again leaves every envelope byte-identical", () => {
    const { repo, home } = sealedRepo();
    const files = ["mysteries/m.geo.0101.json", "encores/e.0101.json"];
    const before = files.map((rel) => readFileSync(envelopePath(repo, rel)));
    const unsealed = cli(repo, home, "unseal", [], { key: RECOVERY_KEY });
    expect(unsealed.stdout).toContain("content:unseal: 2 written, 0 unchanged");
    const resealed = cli(repo, home, "seal", [], { key: RECOVERY_KEY });
    expect(resealed.stdout).toContain(
      `content:seal: 0 written, 2 unchanged (key ${keyFingerprint(RECOVERY_KEY)}).`,
    );
    files.forEach((rel, index) =>
      expect(readFileSync(envelopePath(repo, rel)).equals(before[index]!)).toBe(
        true,
      ),
    );
  });

  it("moves every folder of ARCHITECTURE §2.1, list requests and audits included", () => {
    const repo = makeRepo();
    const home = tempDir("qz-cnt0-home-");
    const body = Buffer.from('{ "id": "placeholder" }\n');
    for (const folder of ENVELOPE_FOLDERS)
      writePlain(repo, `${folder}/${folder}.json`, body);
    const sealed = cli(repo, home, "seal", [], { key: RECOVERY_KEY });
    expect(sealed.stdout).toContain(
      `content:seal: ${ENVELOPE_FOLDERS.length} written`,
    );
    for (const folder of ENVELOPE_FOLDERS)
      expect(existsSync(envelopePath(repo, `${folder}/${folder}.json`))).toBe(
        true,
      );
    spawnSync("rm", ["-rf", join(repo, "content", ".sealed-plain")]);
    const unsealed = cli(repo, home, "unseal", [], { key: RECOVERY_KEY });
    expect(unsealed.stdout).toContain(
      `content:unseal: ${ENVELOPE_FOLDERS.length} written`,
    );
    const verify = cli(repo, home, "unseal", ["--verify"], {
      key: RECOVERY_KEY,
    });
    expect(verify.stdout).toContain(
      `${ENVELOPE_FOLDERS.length} envelope(s) decrypt`,
    );
  });

  it("--verify names a tampered envelope, flags a wrong key, and fails when there is nothing to check", () => {
    const { repo, home } = sealedRepo();
    const path = envelopePath(repo, "encores/e.0101.json");
    const envelope = JSON.parse(readFileSync(path, "utf8")) as Envelope;
    writeFileSync(path, envelopeText({ ...envelope, tag: flip(envelope.tag) }));
    const tampered = cli(repo, home, "unseal", ["--verify"], {
      key: RECOVERY_KEY,
    });
    expect(tampered.status).toBe(1);
    expect(tampered.stdout).toContain(
      "error content/sealed/encores/e.0101.json.enc: decryption failed",
    );
    expect(tampered.stdout).toContain("1 envelope(s) decrypt with key");
    expect(tampered.stdout).toContain("1 failed.");
    expect(tampered.stdout).not.toContain("opens none of the envelopes");

    const wrong = cli(repo, home, "unseal", ["--verify"], { key: OTHER_KEY });
    expect(wrong.status).toBe(1);
    expect(wrong.stdout).toContain("0 envelope(s) decrypt");
    expect(wrong.stdout).toContain("the key opens none of the envelopes");

    const empty = cli(makeRepo(), home, "unseal", ["--verify"], {
      key: RECOVERY_KEY,
    });
    expect(empty.status).toBe(1);
    expect(empty.stdout).toContain("nothing to check the key against");
  });
});
