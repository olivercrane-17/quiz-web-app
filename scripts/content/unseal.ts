/**
 * npm run content:unseal [-- --force] [-- --verify]
 *
 * Decrypts every envelope in content/sealed/ into content/.sealed-plain/
 * (git-ignored). A workspace file that differs from its envelope is kept
 * unless --force is given. Never copy the plaintext anywhere else.
 *
 * --verify is the recovery check of ARCHITECTURE §5.4: it decrypts every
 * envelope in memory, writes nothing, and prints only counts (plus the name
 * and reason of any envelope that fails). It fails when there is no envelope
 * to check the key against, since a check of nothing proves nothing. See
 * content/sealed/README.md.
 */
import { parseCli, run } from "../../src/content/pipeline/cli.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  unsealEnvelopes,
  verifyEnvelopes,
} from "../../src/content/pipeline/sealing.ts";
import {
  keySourceFromProcess,
  listEnvelopeFiles,
  loadMasterKey,
  missingKeyMessage,
} from "./crypto.ts";

const USAGE = `Usage: npm run content:unseal [-- --force] [-- --verify] [-- --json]

  --force          Overwrite workspace files that differ from their envelope
  --verify         Decrypt every envelope in memory and print only counts; write nothing
  Needs the content key: QZ_CONTENT_KEY (base64) or ~/.config/quiz-web-app/content.key.`;

const WRONG_KEY_HINT =
  'note: the key opens none of the envelopes. Is it the project\'s key? See content/sealed/README.md, "Recovering the key".';

/** True when nothing opened and at least one envelope failed its GCM check. */
function looksLikeWrongKey(
  opened: number,
  failures: { reason: string }[],
): boolean {
  return (
    opened === 0 &&
    failures.some(({ reason }) => reason.startsWith("decryption failed"))
  );
}

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
  const layout = resolveLayout({ repoRoot: findRepoRoot() });
  const envelopes = layout.envelopeDir
    ? (await listEnvelopeFiles(layout.envelopeDir)).length
    : 0;
  const key = await loadMasterKey(keySourceFromProcess());
  if (!key) throw new Error(missingKeyMessage(envelopes));
  if (values.verify) {
    if (envelopes === 0) {
      console.log(
        "content:unseal: no envelopes in content/sealed/, so there is nothing to check the key against. Compare its fingerprint with content/sealed/README.md instead (npm run content:keygen -- --check).",
      );
      return 1;
    }
    const { ok, failed, failures } = await verifyEnvelopes(layout, key.keys);
    for (const { file, reason } of failures)
      console.log(`error ${file}: ${reason}`);
    if (looksLikeWrongKey(ok, failures)) console.log(WRONG_KEY_HINT);
    console.log(
      `content:unseal: ${ok} envelope(s) decrypt with key ${key.fingerprint}, ${failed} failed.`,
    );
    return failed > 0 ? 1 : 0;
  }
  const report = await unsealEnvelopes(layout, key.keys, {
    force: values.force === true,
  });
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
    const opened =
      report.written.length + report.unchanged + report.conflicts.length;
    if (looksLikeWrongKey(opened, report.failed)) console.log(WRONG_KEY_HINT);
    console.log(
      `content:unseal: ${report.written.length} written, ${report.unchanged} unchanged, ${report.conflicts.length} kept, ${report.failed.length} failed.`,
    );
  }
  return report.failed.length > 0 ? 1 : 0;
});
