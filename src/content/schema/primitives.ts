/**
 * Shared building blocks for the content schemas: codes, id patterns and
 * small zod helpers.
 *
 * Everything under src/content/schema is erasable TypeScript with relative
 * `.ts` imports, so Node 22 can run it from scripts/ without a build step
 * (ARCHITECTURE.md §2.2). It is build-time only: scripts and tests import it,
 * app code never does.
 */
import { z } from "zod";

/** The twelve category codes (CONTENT_GUIDE §1, ARCHITECTURE §2.4). */
export const CATEGORY_CODES = [
  "geo",
  "hist",
  "sci",
  "nat",
  "film",
  "music",
  "art",
  "book",
  "sport",
  "food",
  "lang",
  "soc",
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];

/** The twelve closed answer-list types (CONTENT_GUIDE §2.10). */
export const ANSWER_TYPES = [
  "country",
  "city",
  "person",
  "film",
  "tv_series",
  "book",
  "animal",
  "element",
  "landmark",
  "music_artist",
  "dish",
  "sport",
] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

/** The eight room packs (CONTENT_GUIDE §10.9). */
export const PACK_IDS = [
  "around-the-world",
  "back-in-time",
  "screen-time",
  "sound-check",
  "wild-things",
  "kitchen-table",
  "game-on",
  "all-sorts",
] as const;
export type PackId = (typeof PACK_IDS)[number];

export const ITEM_STATUSES = [
  "draft",
  "checking",
  "active",
  "cut",
  "retired",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** `fast` is never accepted (CONTENT_GUIDE §3.4). */
export const VOLATILITIES = ["evergreen", "slow", "dated"] as const;
export type Volatility = (typeof VOLATILITIES)[number];

export const DIFFICULTY_BANDS = ["easy", "medium", "hard"] as const;
export type DifficultyBand = (typeof DIFFICULTY_BANDS)[number];

const CATEGORY_ALT = CATEGORY_CODES.join("|");
const TYPE_ALT = ANSWER_TYPES.join("|");
const KEBAB = "[a-z0-9]+(?:-[a-z0-9]+)*";

/**
 * Item id patterns (CONTENT_GUIDE §2.12). Fixtures carry an `fx.` prefix in
 * front of the normal pattern (ARCHITECTURE §5.6); C24 decides where each
 * form is allowed.
 */
export const ID_PATTERNS = {
  practice: new RegExp(`^(?:fx\\.)?p\\.(${CATEGORY_ALT})\\.(\\d{2})(\\d{2})$`),
  mystery: new RegExp(`^(?:fx\\.)?m\\.(${CATEGORY_ALT})\\.(\\d{2})(\\d{2})$`),
  encore: /^(?:fx\.)?e\.(\d{2})(\d{2})$/,
  room: new RegExp(`^(?:fx\\.)?r\\.(${KEBAB})\\.(\\d{2})$`),
} as const;

/** Batch ids in the register (CONTENT_GUIDE §2.12, §11.3). */
export const BATCH_ID_PATTERNS = {
  practice: new RegExp(`^p\\.(${CATEGORY_ALT})\\.b(\\d{2})$`),
  mystery: new RegExp(`^m\\.(${CATEGORY_ALT})\\.b(\\d{2})$`),
  encore: /^e\.b(\d{2})$/,
  room: new RegExp(`^r\\.(${KEBAB})\\.b(\\d{2})$`),
  list: new RegExp(`^l\\.(${TYPE_ALT})\\.b(\\d{2})$`),
} as const;

/** Spare sets: `spare.<NN>` (ARCHITECTURE §2.4), numbered by the scheduler. */
export const SPARE_ID_PATTERN = /^spare\.[0-9]{2}$/;

/**
 * List requests: `lr.<batch>.<NN>`, the mystery, encore or room batch that
 * needs the entity, then a sequence (CONTENT_GUIDE §2.12). Sealed, because a
 * request names a mystery's answer or its guesses.
 */
export const LIST_REQUEST_ID_PATTERN = new RegExp(
  `^(?:fx\\.)?lr\\.((?:m\\.(?:${CATEGORY_ALT})|e|r\\.${KEBAB})\\.b\\d{2})\\.(\\d{2})$`,
);

/** A Wikidata QID, or `x.<type>.<slug>`, optionally `fx.`-prefixed. */
export const ENTITY_ID_PATTERN = new RegExp(
  `^(?:fx\\.)?(?:Q[1-9][0-9]*|x\\.(${TYPE_ALT})\\.${KEBAB})$`,
);
export const QID_PATTERN = /^Q[1-9][0-9]*$/;

/**
 * Agent ids: a role prefix and the run id (CONTENT_GUIDE §2.12). `w-` writer,
 * `es-` estimator, `fc-` checker, `ed-` editor, `lb-` list builder, `sc-`
 * scheduler, `au-` auditor.
 */
export const AGENT_ROLES = ["w", "es", "fc", "ed", "lb", "sc", "au"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
const RUN_ID = "[A-Za-z0-9][A-Za-z0-9._-]{0,63}";

export function agentId(...roles: AgentRole[]) {
  const pattern = new RegExp(`^(?:${roles.join("|")})-${RUN_ID}$`);
  return z
    .string()
    .regex(
      pattern,
      `must be an agent id starting with ${roles.join("- or ")}-`,
    );
}

/** The role prefix of an agent id, or null. */
export function agentRole(id: string): AgentRole | null {
  const prefix = id.split("-", 1)[0];
  return (AGENT_ROLES as readonly string[]).includes(prefix ?? "")
    ? (prefix as AgentRole)
    : null;
}

export const isoDate = z.iso.date();
export const isoDateTime = z.iso.datetime({ offset: true });

/** A non-empty string. Text rules (length, style) live in the lint. */
export const text = z.string().min(1, "must not be empty");

export const tag = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "tags are lowercase kebab-case");

export const region = z.union([
  z.literal("global"),
  z.string().regex(/^region:[a-z0-9-]+$/, "region is global or region:<code>"),
]);

export const categoryCode = z.enum(CATEGORY_CODES);
export const answerType = z.enum(ANSWER_TYPES);
export const entityId = z
  .string()
  .regex(ENTITY_ID_PATTERN, "must be a Wikidata QID or x.<type>.<slug>");
export const spareId = z
  .string()
  .regex(SPARE_ID_PATTERN, "spare set ids are spare.01 to spare.99");
export const sha256Hex = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "must be a lowercase hex SHA-256");

/** ISO 3166-1 alpha-2, upper case. */
export const isoA2 = z.string().regex(/^[A-Z]{2}$/, "must be an ISO alpha-2");

/** Probability-like number from 0 to 1. */
export const share = z.number().min(0).max(1);
