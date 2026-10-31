/**
 * npm run content:unseal [-- --force]
 *
 * Decrypts every envelope in content/sealed/ into content/.sealed-plain/
 * (git-ignored). A workspace file that differs from its envelope is kept
 * unless --force is given. Never copy the plaintext anywhere else. See
 * content/README.md.
 */
import { parseCli, run } from "../../src/content/pipeline/cli.ts";
import {
  keySourceFromProcess,
  loadMasterKey,
} from "../../src/content/pipeline/keys.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  unsealEnvelopes,
  verifyEnvelopes,
} from "../../src/content/pipeline/sealing.ts";

const USAGE = `Usage: npm run content:unseal [-- --force] [-- --verify] [-- --json]

  --force          Overwrite workspace files that differ from their envelope
  --verify         Decrypt every envelope in memory and print only counts; write nothing
  Needs the content key: QZ_CONTENT_KEY (base64) or ~/.config/quiz-web-app/content.key.`;

run("content:unseal", async () => {
  const values = parseCli(
    "content:unseal",
    process.argv.slice(2),
    {
      force: { type: "boolean" },
      verify: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  if (process.env.QZ_SEALED_PLAINTEXT === "1") {
    console.log(
      "content:unseal: QZ_SEALED_PLAINTEXT=1, so unsealing is a no-op (ARCHITECTURE §5.4 upgrade path).",
    );
    return 0;
  }
  const key = await loadMasterKey(keySourceFromProcess());
  if (!key)
    throw new Error(
      "no content key: set QZ_CONTENT_KEY or run npm run content:keygen",
    );
  if (values.verify) {
    const { ok, failed } = await verifyEnvelopes(
      resolveLayout({ repoRoot: findRepoRoot() }),
      key.keys,
    );
    console.log(
      `content:unseal: ${ok} envelope(s) decrypt with key ${key.fingerprint}, ${failed} failed.`,
    );
    return failed > 0 ? 1 : 0;
  }
  const report = await unsealEnvelopes(
    resolveLayout({ repoRoot: findRepoRoot() }),
    key.keys,
    { force: values.force === true },
  );
  if (values.json) {
    console.log(
      JSON.stringify({ fingerprint: key.fingerprint, ...report }, null, 2),
    );
  } else {
    for (const file of report.written) console.log(`unsealed ${file}`);
    for (const file of report.conflicts)
      console.log(
        `kept ${file}: it differs from its envelope (seal it, or pass --force to discard the local change)`,
      );
    for (const { file, reason } of report.failed)
      console.log(`error ${file}: ${reason}`);
    console.log(
      `content:unseal: ${report.written.length} written, ${report.unchanged} unchanged, ${report.conflicts.length} kept, ${report.failed.length} failed.`,
    );
  }
  return report.failed.length > 0 ? 1 : 0;
});
