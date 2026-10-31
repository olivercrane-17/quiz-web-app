/**
 * npm run content:datasets -- [--key <key>] [--force] [--list] [--json]
 *
 * Downloads the pinned datasets in content/datasets/manifest.json into
 * .cache/datasets/<key>/ and checks every file's SHA-256. The npm script
 * runs Node with --use-env-proxy so it works behind an HTTPS proxy.
 * Datasets are data: nothing in them is executed. See content/README.md.
 */
import { formatPath } from "../../src/content/pipeline/bank.ts";
import { parseCli, run, str } from "../../src/content/pipeline/cli.ts";
import {
  fetchDataset,
  writeProvenance,
  type DatasetResult,
} from "../../src/content/pipeline/datasets.ts";
import { readJsonFile } from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  repoRelative,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  DatasetManifestSchema,
  datasetVersion,
} from "../../src/content/schema/datasets.ts";

const USAGE = `Usage: npm run content:datasets -- [options]

  --key <key>      Fetch one dataset (default: all)
  --force          Download again even when the cached copy matches
  --list           List the manifest without downloading
  --json           Machine-readable output`;

run("content:datasets", async () => {
  const values = parseCli(
    "content:datasets",
    process.argv.slice(2),
    {
      key: { type: "string" },
      force: { type: "boolean" },
      list: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const layout = resolveLayout({ repoRoot: findRepoRoot() });
  const { data } = await readJsonFile(layout.manifestFile);
  const parsed = DatasetManifestSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      console.error(`manifest ${formatPath(issue.path)}: ${issue.message}`);
    return 1;
  }
  const key = str(values, "key");
  const datasets = parsed.data.datasets.filter(
    (dataset) => key === undefined || dataset.key === key,
  );
  if (datasets.length === 0)
    throw new Error(
      key
        ? `no dataset ${key} in the manifest`
        : "the manifest lists no datasets",
    );

  if (values.list) {
    for (const dataset of datasets) {
      console.log(
        `${dataset.key.padEnd(26)} ${dataset.license.padEnd(28)} ${dataset.kind === "github" ? `${dataset.repo}@${dataset.commit.slice(0, 7)}` : `npm:${dataset.package}@${dataset.version}`}${dataset.evidence ? "" : "  (not evidence)"}`,
      );
    }
    return 0;
  }

  const results: DatasetResult[] = [];
  for (const dataset of datasets) {
    const result = await fetchDataset(dataset, layout.datasetsCacheDir, {
      force: values.force === true,
    });
    if (
      result.files.every(
        (file) => file.status === "downloaded" || file.status === "cached",
      )
    ) {
      await writeProvenance(layout.datasetsCacheDir, dataset);
    }
    results.push(result);
    if (!values.json) {
      const bytes = result.files.reduce((sum, file) => sum + file.bytes, 0);
      const states = [...new Set(result.files.map((file) => file.status))].join(
        "/",
      );
      console.log(
        `${dataset.key.padEnd(26)} ${states.padEnd(18)} ${String(result.files.length).padStart(3)} file(s) ${(bytes / 1e6).toFixed(2).padStart(7)} MB  ${dataset.license}  ${datasetVersion(dataset)}`,
      );
      for (const file of result.files) {
        if (file.status === "mismatch" || file.status === "error")
          console.log(`  ${file.status} ${file.path}: ${file.message ?? ""}`);
      }
    }
  }
  const bad = results.flatMap((result) =>
    result.files.filter(
      (file) => file.status === "mismatch" || file.status === "error",
    ),
  );
  if (values.json) {
    console.log(
      JSON.stringify(
        {
          ok: bad.length === 0,
          dir: repoRelative(layout, layout.datasetsCacheDir),
          results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `content:datasets: ${results.length} dataset(s) in ${repoRelative(layout, layout.datasetsCacheDir)}/, ${bad.length} problem(s).`,
    );
  }
  return bad.length === 0 ? 0 : 1;
});
