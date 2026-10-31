/**
 * content/datasets/manifest.json: the pinned open datasets checkers use as
 * evidence (CONTENT_GUIDE §9.5.1). Files are downloaded into
 * .cache/datasets/<key>/ by `npm run content:datasets`. They are data:
 * nothing inside them is ever executed.
 *
 * The guide's example entry has one `url`, `commit` and `sha256`. Entries
 * here hold a list of files, each with its own URL and hash, so one key can
 * cover a dataset spread over several files.
 */
import { z } from "zod";

import { isoDate, sha256Hex, text } from "./primitives.ts";

const httpsUrl = z.string().regex(/^https:\/\/\S+$/, "an https URL");
/** A relative path inside the dataset folder: no "..", no leading "/". */
const localPath = z
  .string()
  .regex(/^(?!.*\.\.)(?!\/)[A-Za-z0-9._/-]+$/, "a safe relative path");

const common = {
  key: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "dataset keys are kebab-case"),
  title: text,
  /** SPDX id where one exists, or a short licence description. */
  license: text,
  licenseNote: text.optional(),
  retrievedAt: isoDate,
  /** What the editor writes in sourceLabels when this dataset backs a key. */
  sourceLabel: text,
  /** False for brainstorming sources that never count as evidence. */
  evidence: z.boolean(),
  use: text,
  knownIssues: z.array(text),
};

export const GithubDatasetSchema = z.strictObject({
  ...common,
  kind: z.literal("github"),
  repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "owner/name"),
  /** Found with `git ls-remote`, never a branch name. */
  commit: z.string().regex(/^[0-9a-f]{40}$/, "a full 40-character commit"),
  files: z
    .array(
      z.strictObject({
        path: localPath,
        url: httpsUrl,
        sha256: sha256Hex,
        bytes: z.int().min(0),
      }),
    )
    .min(1),
});

export const NpmDatasetSchema = z.strictObject({
  ...common,
  kind: z.literal("npm"),
  package: text,
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "an exact version"),
  tarball: httpsUrl,
  /** The registry's dist.integrity, checked before anything is extracted. */
  integrity: z
    .string()
    .regex(/^sha512-[A-Za-z0-9+/]+=*$/, "an sha512 SRI string"),
  files: z
    .array(
      z.strictObject({
        path: localPath,
        /** The member inside the tarball, such as package/cities.json. */
        member: localPath,
        sha256: sha256Hex,
        bytes: z.int().min(0),
      }),
    )
    .min(1),
});

export const DatasetEntrySchema = z.discriminatedUnion("kind", [
  GithubDatasetSchema,
  NpmDatasetSchema,
]);
export type DatasetEntry = z.infer<typeof DatasetEntrySchema>;

export const DatasetManifestSchema = z
  .strictObject({
    version: z.literal(1),
    note: text.optional(),
    datasets: z.array(DatasetEntrySchema),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    manifest.datasets.forEach((dataset, index) => {
      if (seen.has(dataset.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["datasets", index, "key"],
          message: `duplicate dataset key ${dataset.key}`,
        });
      }
      seen.add(dataset.key);
    });
  });
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;

/** The version string a dataset evidence record must quote (§9.8). */
export function datasetVersion(dataset: DatasetEntry): string {
  return dataset.kind === "github" ? dataset.commit : dataset.version;
}
