/**
 * npm run content:keygen
 *
 * Creates the content master key at ~/.config/quiz-web-app/content.key
 * (32 random bytes, base64, mode 0600). Refuses to overwrite an existing key
 * or to run when QZ_CONTENT_KEY is set. Prints the fingerprint, never the
 * key. See content/README.md and ARCHITECTURE §5.4.
 */
import { parseCli, run } from "../../src/content/pipeline/cli.ts";
import {
  generateKeyFile,
  keySourceFromProcess,
  loadMasterKey,
} from "../../src/content/pipeline/keys.ts";

const USAGE = `Usage: npm run content:keygen

  Creates ~/.config/quiz-web-app/content.key once. Never overwrites a key.
  --check          Only report whether a key is available, and its fingerprint`;

run("content:keygen", async () => {
  const values = parseCli(
    "content:keygen",
    process.argv.slice(2),
    { check: { type: "boolean" } },
    USAGE,
  );
  const source = keySourceFromProcess();
  if (values.check) {
    const loaded = await loadMasterKey(source);
    console.log(
      loaded
        ? `content key found (${loaded.source === "env" ? "QZ_CONTENT_KEY" : (loaded.path ?? "")}), fingerprint ${loaded.fingerprint}`
        : `no content key: set QZ_CONTENT_KEY or run npm run content:keygen`,
    );
    return loaded ? 0 : 1;
  }
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
