/**
 * Nobel Prizes to 2022 (`nobel-prizes`, MIT, a copy of the Nobel API v1): a
 * check of laureates by their Nobel id. A person or musician entry names
 * the laureate; a book entry cites its author's id, so the author must be
 * that laureate. Locator: `id=26`.
 */
import type { DatasetRecord, ListImporter } from "./importer.ts";

interface Prize {
  laureates?: { id: string; firstname: string; surname?: string }[];
}

export const nobelPrizes: ListImporter = {
  key: "nobel-prizes",
  role: "check",
  names: "person",
  types: ["person", "music_artist", "book"],
  load(file) {
    const laureates = new Map<string, string>();
    for (const prize of (JSON.parse(file("prize.json")) as { prizes: Prize[] })
      .prizes)
      for (const laureate of prize.laureates ?? [])
        laureates.set(
          laureate.id,
          `${laureate.firstname} ${laureate.surname ?? ""}`.trim(),
        );
    return {
      resolve(type, locator): DatasetRecord | null {
        const id = /^id=(\d+)\b/.exec(locator)?.[1];
        const name = id ? laureates.get(id) : undefined;
        if (!id || name === undefined) return null;
        return type === "book"
          ? { locator: `id=${id}`, names: [], facts: { author: name } }
          : { locator: `id=${id}`, names: [name], facts: {} };
      },
    };
  },
};
