/**
 * npm run content:keygen [-- --check] [-- --restore]
 *
 * Creates the content master key at ~/.config/quiz-web-app/content.key
 * (32 random bytes, base64, mode 0600), once per project. Refuses to
 * overwrite an existing key file, to run when QZ_CONTENT_KEY is set, and to
 * run while content/sealed/ holds envelopes: they were sealed with the
 * project's existing key, which a new one could never open, so that key is
 * restored instead. Prints the fingerprint, never the key. ARCHITECTURE §5.4,
 * content/sealed/README.md.
 *
 * --check     Reports whether a key is available here, and its fingerprint.
 * --restore   The recovery step: reads a recovered key (base64) from stdin,
 *             refuses it unless it opens the envelopes in content/sealed/,
 *             and writes it to the key file (mode 0600, directory 0700) under
 *             the same guards as creating one. Then run
 *             npm run content:unseal -- --verify.
 */
import { existsSync } from "node:fs";

import { parseCli, run } from "../../src/content/pipeline/cli.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  assertKeyFileFree,
  checkEnvelopes,
  decodeMasterKey,
  deriveSealKeys,
  generateKeyFile,
  keySourceFromProcess,
  listEnvelopeFiles,
  loadMasterKey,
  missingKeyMessage,
  restoreKeyFile,
  type EnvelopeCheck,
} from "./crypto.ts";

const USAGE = `Usage: npm run content:keygen [-- --check | -- --restore]

  Creates ~/.config/quiz-web-app/content.key once. Never overwrites a key.
  --check          Only report whether a key is available, and its fingerprint
  --restore        Read a recovered key (base64) from stdin, check it against
                   content/sealed/, and write it to the key file (mode 0600)`;

/** More than any key file could hold; stdin past this is refused unread. */
const STDIN_LIMIT = 4096;

/** The whole of stdin, prompting first when it is a terminal. */
async function readKeyFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    process.stderr.write(
      "Paste the content key (base64), then press Enter and Ctrl-D:\n",
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(String(chunk), "utf8");
    size += bytes.length;
    if (size > STDIN_LIMIT) {
      throw new Error(
        `stdin holds more than ${STDIN_LIMIT} bytes, which is not one key`,
      );
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

run("content:keygen", async () => {
  const values = parseCli(
    "content:keygen",
    process.argv.slice(2),
    { check: { type: "boolean" }, restore: { type: "boolean" } },
    USAGE,
  );
  if (values.check && values.restore) {
    console.error(
      `content:keygen: --check and --restore cannot be combined\n\n${USAGE}`,
    );
    return 2;
  }
  const source = keySourceFromProcess();
  const layout = resolveLayout({ repoRoot: findRepoRoot() });
  const envelopes = layout.envelopeDir
    ? (await listEnvelopeFiles(layout.envelopeDir)).length
    : 0;

  if (values.check) {
    const loaded = await loadMasterKey(source);
    console.log(
      loaded
        ? `content key found (${loaded.source === "env" ? "QZ_CONTENT_KEY" : (loaded.path ?? "")}), fingerprint ${loaded.fingerprint}`
        : missingKeyMessage(envelopes),
    );
    return loaded ? 0 : 1;
  }

  if (values.restore) {
    // Before reading anything, so nobody pastes a key for nothing.
    assertKeyFileFree(source, "restore a key file it would not use");
    const master = decodeMasterKey(
      // A pasted key may carry line breaks; base64 never has inner spaces.
      (await readKeyFromStdin()).replace(/\s+/g, ""),
      "the key on stdin",
    );
    const check: EnvelopeCheck = layout.envelopeDir
      ? await checkEnvelopes(deriveSealKeys(master), layout.envelopeDir)
      : { total: 0, opened: 0, failures: [] };
    if (check.total > 0 && check.opened === 0) {
      throw new Error(
        `the key on stdin opens none of the ${check.total} envelope(s) in content/sealed/, so it is not the key they were sealed with. Nothing was written.`,
      );
    }
    const { path, fingerprint } = await restoreKeyFile(source, master);
    console.log(
      `content:keygen: restored ${path} (mode 0600), fingerprint ${fingerprint}.`,
    );
    if (check.total === 0) {
      console.log(
        "No envelopes in content/sealed/ to check it against: compare the fingerprint with content/sealed/README.md.",
      );
      return 0;
    }
    console.log(
      `It opens ${check.opened} of ${check.total} envelope(s).${check.failures.length > 0 ? " Run npm run content:unseal -- --verify to list the others." : ""}`,
    );
    return check.failures.length > 0 ? 1 : 0;
  }

  // A key file or QZ_CONTENT_KEY gets generateKeyFile's own refusal.
  if (envelopes > 0 && !source.envValue?.trim() && !existsSync(source.keyPath))
    throw new Error(
      `content/sealed/ holds ${envelopes} envelope(s), sealed with the project's existing key, which a new key could never open. Refusing to create one: restore the existing key instead (content/sealed/README.md, "Recovering the key").`,
    );
  const { path, fingerprint } = await generateKeyFile(source);
  console.log(
    `content:keygen: created ${path} (mode 0600), fingerprint ${fingerprint}.`,
  );
  console.log(
    "Store the key in a password manager and add it as the QZ_CONTENT_KEY GitHub secret.",
  );
  console.log(
    "Never commit it, paste it into a message, or print it in a log.",
  );
  return 0;
});
