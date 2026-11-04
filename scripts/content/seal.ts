/**
 * npm run content:seal
 *
 * Encrypts every changed file in content/.sealed-plain/ into an AES-256-GCM
 * envelope in content/sealed/ (ARCHITECTURE §5.4, format in ./crypto.ts).
 * Unchanged plaintext gives byte-identical envelopes, so only real changes
 * show in git. Refuses, writing nothing, when the key opens none of the
 * envelopes already there. Run it at every checkpoint: the workspace dies
 * with the sandbox. See content/sealed/README.md.
 */
import { parseCli, run } from "../../src/content/pipeline/cli.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import { sealWorkspace } from "../../src/content/pipeline/sealing.ts";
import {
  keySourceFromProcess,
  listEnvelopeFiles,
  loadMasterKey,
  missingKeyMessage,
} from "./crypto.ts";

const USAGE = `Usage: npm run content:seal [-- --json]

  Needs the content key: QZ_CONTENT_KEY (base64) or ~/.config/quiz-web-app/content.key.`;

run("content:seal", async () => {
  const values = parseCli(
    "content:seal",
    process.argv.slice(2),
    { json: { type: "boolean" } },
    USAGE,
  );
  if (process.env.QZ_SEALED_PLAINTEXT === "1") {
    console.log(
      "content:seal: QZ_SEALED_PLAINTEXT=1, so sealing is a no-op (ARCHITECTURE §5.4 upgrade path).",
    );
    return 0;
  }
  const layout = resolveLayout({ repoRoot: findRepoRoot() });
  const key = await loadMasterKey(keySourceFromProcess());
  if (!key) {
    const envelopes = layout.envelopeDir
      ? (await listEnvelopeFiles(layout.envelopeDir)).length
      : 0;
    throw new Error(missingKeyMessage(envelopes));
  }
  const report = await sealWorkspace(layout, key.keys);
  if (values.json) {
    console.log(
      JSON.stringify({ fingerprint: key.fingerprint, ...report }, null, 2),
    );
  } else {
    for (const file of report.written) console.log(`sealed ${file}`);
    for (const file of report.invalidJson)
      console.log(
        `error ${file}: not valid JSON (sealed anyway so the work is kept; fix it)`,
      );
    for (const file of report.misplaced)
      console.log(
        `error ${file}: its id does not match the file name, or a date is not in the month its name gives (sealed anyway so the work is kept; content:unseal refuses the envelope until it is fixed)`,
      );
    for (const file of report.skipped)
      console.log(`skipped ${file}: unsafe file name`);
    if (report.orphans.length > 0)
      console.log(
        `note: ${report.orphans.length} envelope(s) have no plaintext here (run content:unseal to get them).`,
      );
    console.log(
      `content:seal: ${report.written.length} written, ${report.unchanged} unchanged (key ${key.fingerprint}).`,
    );
  }
  return report.invalidJson.length > 0 || report.misplaced.length > 0 ? 1 : 0;
});
