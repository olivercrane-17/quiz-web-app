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
 * --check     Reports whether a key is available here, its fingerprint, and
 *             whether it opens the envelopes in content/sealed/ (exit 1 when
 *             there is no key or it opens none of them).
 * --restore   The recovery step: reads a recovered key (base64) from stdin,
 *             refuses it unless it opens the envelopes in content/sealed/,
 *             and writes it to the key file (mode 0600, directory 0700) under
 *             the same guards as creating one. From a pipe it reads to the
 *             end; on a terminal it reads one line with echo off, so a
 *             pasted key never shows on screen or in a session log. Then run
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
  keyMatchesEnvelopes,
  keySourceFromProcess,
  listEnvelopeFiles,
  loadMasterKey,
  missingKeyMessage,
  restoreKeyFile,
  type EnvelopeCheck,
} from "./crypto.ts";

const USAGE = `Usage: npm run content:keygen [-- --check | -- --restore]

  Creates ~/.config/quiz-web-app/content.key once. Never overwrites a key.
  --check          Only report whether a key is available, its fingerprint,
                   and whether it opens the envelopes in content/sealed/
  --restore        Read a recovered key (base64) from stdin, check it against
                   content/sealed/, and write it to the key file (mode 0600,
                   directory 0700). Pipe the key file in, or paste the key at
                   the prompt, which does not show it`;

/** More than any key file could hold; stdin past this is refused unread. */
const STDIN_LIMIT = 4096;

/** The whole of a piped stdin. */
async function readKeyFromPipe(): Promise<string> {
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

/**
 * One line from a terminal, read in raw mode so the terminal echoes
 * nothing: a pasted key never reaches the screen, scrollback, a tmux log or
 * a `script` recording. Enter or Ctrl-D ends it, Ctrl-C cancels, Backspace
 * and Ctrl-U edit, and escape sequences (bracketed-paste markers, arrow
 * keys) are dropped. The terminal goes back to normal afterwards, and Node
 * restores it on exit even if this throws.
 */
async function readKeyFromTerminal(): Promise<string> {
  const stdin = process.stdin;
  try {
    // Echo goes off before the prompt shows, so nothing typed after it echoes.
    stdin.setRawMode(true);
    process.stderr.write(
      "Paste the content key (base64) and press Enter. It is not shown as you paste or type.\n",
    );
    return await new Promise<string>((resolve, reject) => {
      let text = "";
      /** 0 outside an escape sequence, 1 after ESC, 2 inside ESC [ ... */
      let escape = 0;
      const finish = (error: Error | null) => {
        stdin.off("data", onData);
        stdin.off("end", onEnd);
        stdin.pause();
        if (error) reject(error);
        else resolve(text);
      };
      const onEnd = () => finish(null);
      const onData = (chunk: Buffer | string) => {
        const bytes =
          typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
        for (const byte of bytes) {
          if (escape === 1) {
            escape = byte === 0x5b ? 2 : 0;
            continue;
          }
          if (escape === 2) {
            if (byte >= 0x40 && byte <= 0x7e) escape = 0;
            continue;
          }
          if (byte === 0x1b) escape = 1;
          else if (byte === 0x03) {
            finish(new Error("cancelled. Nothing was written."));
            return;
          } else if (byte === 0x0d || byte === 0x0a || byte === 0x04) {
            finish(null);
            return;
          } else if (byte === 0x7f || byte === 0x08) text = text.slice(0, -1);
          else if (byte === 0x15) text = "";
          else if (byte >= 0x20) {
            text += String.fromCharCode(byte);
            if (text.length > STDIN_LIMIT) {
              finish(
                new Error(
                  `more than ${STDIN_LIMIT} characters, which is not one key`,
                ),
              );
              return;
            }
          }
        }
      };
      stdin.on("data", onData);
      stdin.once("end", onEnd);
      stdin.resume();
    });
  } finally {
    stdin.setRawMode(false);
    // Enter was not echoed, so end the prompt's line here.
    process.stderr.write("\n");
  }
}

function readKeyFromStdin(): Promise<string> {
  if (!process.stdin.isTTY) return readKeyFromPipe();
  if (typeof process.stdin.setRawMode !== "function") {
    throw new Error(
      "this terminal cannot turn echo off, so a pasted key would show. Pipe the key file in instead: npm run content:keygen -- --restore < /path/to/content.key",
    );
  }
  return readKeyFromTerminal();
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
    if (!loaded) {
      console.log(missingKeyMessage(envelopes));
      return 1;
    }
    const where =
      loaded.source === "env" ? "QZ_CONTENT_KEY" : (loaded.path ?? "");
    console.log(
      `content key found (${where}), fingerprint ${loaded.fingerprint}`,
    );
    if (layout.envelopeDir && envelopes > 0) {
      const { matches } = await keyMatchesEnvelopes(
        loaded.keys,
        layout.envelopeDir,
      );
      if (!matches) {
        console.log(
          `It opens none of the ${envelopes} envelope(s) in content/sealed/, so it is not the project's key: ${loaded.source === "env" ? "unset QZ_CONTENT_KEY" : "move that file aside (never delete it)"} and restore the right one (content/sealed/README.md, "Recovering the key").`,
        );
        return 1;
      }
      console.log("It opens the envelopes in content/sealed/.");
    }
    return 0;
  }

  if (values.restore) {
    // Before reading anything, so nobody pastes a key for nothing.
    assertKeyFileFree(source, "restore a key file it would not use", {
      restoring: true,
    });
    const master = decodeMasterKey(
      // A pasted key may carry line breaks; base64 never has inner spaces.
      (await readKeyFromStdin()).replace(/\s+/g, ""),
      "the key on stdin",
    );
    const check: EnvelopeCheck = layout.envelopeDir
      ? await checkEnvelopes(deriveSealKeys(master), layout.envelopeDir)
      : { total: 0, opened: 0, decrypted: 0, failures: [] };
    if (check.total > 0 && check.decrypted === 0) {
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
