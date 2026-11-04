/**
 * The sealed file types the pipeline's bank loader leaves out
 * (ARCHITECTURE §5.1.1): challenge packs (`challenge-packs/<id>.json`) and
 * list requests (`list-requests/<id>.json`, CONTENT_GUIDE §2.12). Both are
 * validated against their schemas, from the plaintext workspace or, with
 * --sealed, from the envelopes decrypted in memory. Neither ever ships.
 *
 * Findings name the file, the rule and the field path. A parse error is
 * reported without its message, because a JSON error quotes its input.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Bank } from "../../../src/content/pipeline/bank.ts";
import {
  repoRelative,
  type Layout,
} from "../../../src/content/pipeline/layout.ts";
import {
  isEnvelope,
  openEnvelope,
  type SealKeys,
} from "../../../src/content/pipeline/seal.ts";
import { ChallengePackSchema } from "../../../src/content/schema/challenge-packs.ts";
import { ListRequestSchema } from "../../../src/content/schema/list-requests.ts";
import { compositionIdOf } from "../../../src/engine/composition.ts";
import { parseShareLayouts } from "../../../src/engine/share/code.ts";
import type { RoundType } from "../../../src/engine/types/rounds.ts";
import type { Finding } from "../lint.ts";

export const EXTRA_SEALED_FOLDERS = [
  "challenge-packs",
  "list-requests",
] as const;
type ExtraFolder = (typeof EXTRA_SEALED_FOLDERS)[number];

interface Source {
  folder: ExtraFolder;
  stem: string;
  rel: string;
  text: string | null;
}

async function names(dir: string, suffix: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((name) => name.endsWith(suffix)).sort();
}

async function sources(
  layout: Layout,
  sealed: boolean,
  keys: SealKeys | null,
): Promise<Source[]> {
  const out: Source[] = [];
  for (const folder of EXTRA_SEALED_FOLDERS) {
    if (sealed) {
      if (layout.envelopeDir === null || keys === null) continue;
      const dir = join(layout.envelopeDir, folder);
      for (const name of await names(dir, ".json.enc")) {
        const abs = join(dir, name);
        let text: string | null = null;
        try {
          const envelope: unknown = JSON.parse(await readFile(abs, "utf8"));
          if (isEnvelope(envelope))
            text = openEnvelope(keys, envelope).toString("utf8");
        } catch {
          text = null;
        }
        out.push({
          folder,
          stem: name.slice(0, -".json.enc".length),
          rel: repoRelative(layout, abs),
          text,
        });
      }
    } else {
      const dir = join(layout.workspaceDir, folder);
      for (const name of await names(dir, ".json")) {
        const abs = join(dir, name);
        out.push({
          folder,
          stem: name.slice(0, -".json".length),
          rel: repoRelative(layout, abs),
          text: await readFile(abs, "utf8"),
        });
      }
    }
  }
  return out;
}

function finding(
  source: Source,
  rule: string,
  message: string,
  path?: string,
  itemId?: string,
): Finding {
  const out: Finding = {
    rule,
    severity: "error",
    file: source.rel,
    message,
    sealed: true,
  };
  if (path) out.path = path;
  if (itemId) out.itemId = itemId;
  return out;
}

/** Validates every challenge pack and list request; returns findings and the file count. */
export async function sealedExtras(
  bank: Bank,
  options: { sealed: boolean; keys: SealKeys | null; compositions: unknown },
): Promise<{ findings: Finding[]; files: number }> {
  const all = await sources(bank.layout, options.sealed, options.keys);
  const findings: Finding[] = [];
  let layouts: ReadonlyMap<string, string> | null = null;
  try {
    layouts = parseShareLayouts(options.compositions).codeOf;
  } catch {
    layouts = null;
  }
  for (const source of all) {
    if (source.text === null) {
      findings.push(
        finding(
          source,
          "C01",
          "the file could not be read or decrypted (details hidden for sealed content)",
        ),
      );
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(source.text);
    } catch {
      findings.push(
        finding(
          source,
          "C01",
          "the file is not valid JSON (details hidden for sealed content)",
        ),
      );
      continue;
    }
    const schema =
      source.folder === "challenge-packs"
        ? ChallengePackSchema
        : ListRequestSchema;
    const result = schema.safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        findings.push(
          finding(
            source,
            "C01",
            issue.message,
            issue.path
              .map((key) =>
                typeof key === "number" ? `[${key}]` : `.${String(key)}`,
              )
              .join("")
              .replace(/^\./, ""),
          ),
        );
      }
      continue;
    }
    const id = (result.data as { id: string }).id;
    if (id !== source.stem) {
      findings.push(
        finding(source, "C01", "the id does not match the file name", "id", id),
      );
    }
    if (source.folder !== "challenge-packs") continue;
    const pack = ChallengePackSchema.parse(data);
    pack.rounds.forEach((round, index) => {
      const record = bank.itemsById.get(round.contentId);
      const path = `rounds[${index}].contentId`;
      if (!record) {
        if (!bank.invalidIds.has(round.contentId))
          findings.push(
            finding(source, "X10", "the round names no item", path, id),
          );
        return;
      }
      const kind = "kind" in record.item ? record.item.kind : "practice";
      const wanted =
        round.type === "mystery" || round.type === "encore"
          ? round.type
          : "choice";
      if (kind !== wanted)
        findings.push(
          finding(
            source,
            "X10",
            `a ${kind} item in a ${round.type} round`,
            path,
            id,
          ),
        );
      if (record.item.status !== "active")
        findings.push(
          finding(
            source,
            "X10",
            "the round names an item that is not active",
            path,
            id,
          ),
        );
    });
    const composition = compositionIdOf(
      pack.rounds.map((round) => round.type as RoundType),
    );
    if (layouts !== null && !layouts.has(composition)) {
      findings.push(
        finding(
          source,
          "X25",
          `composition ${composition} has no share layout in content/compositions.json`,
          "rounds",
          id,
        ),
      );
    }
  }
  return { findings, files: all.length };
}
