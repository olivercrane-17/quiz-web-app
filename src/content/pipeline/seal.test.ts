// @vitest-environment node
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  fxEncore,
  fxMystery,
  removeTempDirs,
  tempDir,
} from "./__fixtures__/builders.ts";
import { loadBank } from "./bank.ts";
import { decodeMasterKey, generateKeyFile, loadMasterKey } from "./keys.ts";
import { resolveLayout } from "./layout.ts";
import {
  HKDF_INFO_ENC,
  HKDF_INFO_IV,
  HKDF_SALT,
  deriveSealKeys,
  envelopeProblems,
  keyFingerprint,
  openEnvelope,
  sealBytes,
} from "./seal.ts";
import { sealWorkspace, unsealEnvelopes } from "./sealing.ts";

afterAll(removeTempDirs);

const master = Buffer.alloc(32, 7);
const keys = deriveSealKeys(master);
const plaintext = Buffer.from(`${JSON.stringify(fxMystery(), null, 2)}\n`);

describe("envelopes (ARCHITECTURE §5.4)", () => {
  it("round-trips and has exactly the v, alg, kid, iv, data and tag fields", () => {
    const envelope = sealBytes(keys, plaintext);
    expect(Object.keys(envelope).sort()).toEqual([
      "alg",
      "data",
      "iv",
      "kid",
      "tag",
      "v",
    ]);
    expect(envelope).toMatchObject({ v: 1, alg: "A256GCM", kid: "k1" });
    expect(envelopeProblems(envelope)).toEqual([]);
    expect(openEnvelope(keys, envelope).equals(plaintext)).toBe(true);
    expect(Buffer.from(envelope.data, "base64").toString("utf8")).not.toContain(
      "Arvenna",
    );
  });

  it("is deterministic: the same plaintext gives the same IV and ciphertext", () => {
    const first = sealBytes(keys, plaintext);
    expect(sealBytes(keys, plaintext)).toEqual(first);
    const other = sealBytes(
      keys,
      Buffer.from(`${JSON.stringify(fxEncore())}\n`),
    );
    expect(other.iv).not.toBe(first.iv);
    expect(Buffer.from(first.iv, "base64")).toHaveLength(12);
  });

  it("derives two distinct keys with HKDF and documents its strings", () => {
    expect(keys.enc.equals(keys.iv)).toBe(false);
    expect(deriveSealKeys(master).enc.equals(keys.enc)).toBe(true);
    expect(deriveSealKeys(Buffer.alloc(32, 8)).enc.equals(keys.enc)).toBe(
      false,
    );
    expect([HKDF_SALT, HKDF_INFO_ENC, HKDF_INFO_IV]).toEqual([
      "quiz-web-app/content-seal/v1",
      "qz-content k1 aes-256-gcm key",
      "qz-content k1 iv hmac-sha256 key",
    ]);
    expect(() => deriveSealKeys(Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it("refuses a wrong key and any tampering", () => {
    const envelope = sealBytes(keys, plaintext);
    expect(() =>
      openEnvelope(deriveSealKeys(Buffer.alloc(32, 9)), envelope),
    ).toThrow(/decryption failed/);
    const data = Buffer.from(envelope.data, "base64");
    data[0] = (data[0] ?? 0) ^ 1;
    expect(() =>
      openEnvelope(keys, { ...envelope, data: data.toString("base64") }),
    ).toThrow(/decryption failed/);
    const tag = Buffer.from(envelope.tag, "base64");
    tag[0] = (tag[0] ?? 0) ^ 1;
    expect(() =>
      openEnvelope(keys, { ...envelope, tag: tag.toString("base64") }),
    ).toThrow(/decryption failed/);
  });

  it("names structural problems without a key", () => {
    expect(
      envelopeProblems({
        v: 1,
        alg: "A256GCM",
        kid: "k1",
        iv: "AAAA",
        data: "",
        tag: "AAAA",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("iv is 3 bytes"),
        expect.stringContaining("data is empty"),
      ]),
    );
    expect(
      envelopeProblems(JSON.parse(plaintext.toString("utf8"))),
    ).not.toEqual([]);
  });
});

describe("the content key", () => {
  it("is generated once, mode 0600, and never overwritten", async () => {
    const home = tempDir("qz-key-");
    const keyPath = join(home, ".config", "quiz-web-app", "content.key");
    const created = await generateKeyFile({ envValue: undefined, keyPath });
    expect(created.path).toBe(keyPath);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    await expect(
      generateKeyFile({ envValue: undefined, keyPath }),
    ).rejects.toThrow(/Refusing to overwrite/);
    await expect(
      generateKeyFile({ envValue: "abc", keyPath: join(home, "other.key") }),
    ).rejects.toThrow(/already set/);
    const loaded = await loadMasterKey({ envValue: undefined, keyPath });
    expect(loaded?.source).toBe("file");
    expect(loaded?.fingerprint).toBe(created.fingerprint);
    expect(readFileSync(keyPath, "utf8")).not.toContain(created.fingerprint);
  });

  it("prefers QZ_CONTENT_KEY and checks it is 32 bytes of base64", async () => {
    const value = master.toString("base64");
    const loaded = await loadMasterKey({
      envValue: value,
      keyPath: "/nonexistent",
    });
    expect(loaded).toMatchObject({
      source: "env",
      fingerprint: keyFingerprint(master),
    });
    expect(
      await loadMasterKey({ envValue: undefined, keyPath: "/nonexistent" }),
    ).toBeNull();
    expect(() => decodeMasterKey("not base64!", "QZ_CONTENT_KEY")).toThrow(
      /not base64/,
    );
    expect(() =>
      decodeMasterKey(Buffer.alloc(31).toString("base64"), "QZ_CONTENT_KEY"),
    ).toThrow(/32 bytes/);
  });
});

describe("content:seal and content:unseal", () => {
  /** The fixture mystery under its own id, as content:unseal requires. */
  async function workspace() {
    const root = tempDir("qz-sealed-");
    await mkdir(join(root, ".sealed-plain", "mysteries"), { recursive: true });
    await writeFile(
      join(root, ".sealed-plain", "mysteries", "fx.m.geo.0101.json"),
      plaintext,
    );
    return resolveLayout({ repoRoot: REPO_ROOT, root });
  }

  it("round-trips the workspace through envelopes", async () => {
    const layout = await workspace();
    const sealed = await sealWorkspace(layout, keys, { skipGuard: true });
    expect(sealed.written).toHaveLength(1);
    const envelopePath = join(
      layout.root,
      "sealed",
      "mysteries",
      "fx.m.geo.0101.json.enc",
    );
    const text = await readFile(envelopePath, "utf8");
    expect(text).not.toContain("Arvenna");
    expect(
      (await sealWorkspace(layout, keys, { skipGuard: true })).unchanged,
    ).toBe(1);

    const fresh = resolveLayout({
      repoRoot: REPO_ROOT,
      root: tempDir("qz-unsealed-"),
    });
    await mkdir(join(fresh.root, "sealed", "mysteries"), { recursive: true });
    await writeFile(
      join(fresh.root, "sealed", "mysteries", "fx.m.geo.0101.json.enc"),
      text,
    );
    const unsealed = await unsealEnvelopes(fresh, keys, { skipGuard: true });
    expect(unsealed.written).toHaveLength(1);
    expect(
      (
        await readFile(
          join(fresh.root, ".sealed-plain", "mysteries", "fx.m.geo.0101.json"),
        )
      ).equals(plaintext),
    ).toBe(true);
  });

  it("keeps a changed workspace file unless forced, and reports unreadable envelopes", async () => {
    const layout = await workspace();
    await sealWorkspace(layout, keys, { skipGuard: true });
    const plainPath = join(
      layout.workspaceDir,
      "mysteries",
      "fx.m.geo.0101.json",
    );
    await writeFile(plainPath, '{"edited": true}\n');
    const kept = await unsealEnvelopes(layout, keys, { skipGuard: true });
    expect(kept.conflicts).toHaveLength(1);
    expect(await readFile(plainPath, "utf8")).toContain("edited");
    const forced = await unsealEnvelopes(layout, keys, {
      skipGuard: true,
      force: true,
    });
    expect(forced.written).toHaveLength(1);
    const wrongKey = await unsealEnvelopes(
      layout,
      deriveSealKeys(Buffer.alloc(32, 1)),
      { skipGuard: true },
    );
    expect(wrongKey.failed).toHaveLength(1);
  });

  it("lets content:check read envelopes in memory with --sealed", async () => {
    const layout = await workspace();
    await sealWorkspace(layout, keys, { skipGuard: true });
    const bank = await loadBank(layout, { sealed: true, keys });
    expect(bank.sealedSource).toBe("envelopes");
    expect(bank.itemsById.get("fx.m.geo.0101")?.file.fromEnvelope).toBe(true);
    const noKey = await loadBank(layout, { sealed: true, keys: null });
    expect(noKey.notes).toContain(
      "Sealed content validation: not run (QZ_CONTENT_KEY is not set)",
    );
    expect(noKey.items).toHaveLength(0);
    expect(existsSync(layout.workspaceDir)).toBe(true);
  });

  it("refuses to write sealed plaintext into a folder git does not ignore", async () => {
    const layout = await workspace();
    await expect(sealWorkspace(layout, keys)).rejects.toThrow(
      /not git-ignored/,
    );
  });
});
