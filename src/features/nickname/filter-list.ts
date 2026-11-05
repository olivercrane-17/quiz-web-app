/**
 * The lazy chunk behind ./filter.ts: the slur filter's term list
 * (src/content/generated/moderation.ts, ROT13-encoded as content/safety/
 * keeps it) decoded in memory and compiled once by the engine's matcher.
 * Import it only with import(), through `loadNameFilter`, so the list
 * stays out of every route's first load (ARCHITECTURE §8.13, §10.9).
 */
import {
  MODERATION_ALLOWLIST_ROT13,
  MODERATION_TERMS_ROT13,
} from "@/content/generated/moderation";
import {
  createModerationList,
  isBlocked,
  rot13,
} from "@/engine/text/moderation";

import type { NameFilter } from "./filter";

const list = createModerationList(
  MODERATION_TERMS_ROT13.map(rot13),
  MODERATION_ALLOWLIST_ROT13.map(rot13),
);

export const nameFilter: NameFilter = {
  isBlocked: (text) => isBlocked(text, list),
};
