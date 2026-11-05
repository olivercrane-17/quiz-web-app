/**
 * node scripts/content/enrich-wikidata.ts [--type <type>] [--root <dir>] [--summary <file>]
 * node scripts/content/enrich-wikidata.ts --apply (--type <type> | --all) [--write] [--accept-matches]
 *
 * The Wikidata enrichment of ARCHITECTURE §5.5 (ticket ENR-1). Wikidata is a
 * candidate source, never evidence (CONTENT_GUIDE §9.5.1), and the agents'
 * sandbox can't reach it, so the fetch runs on a GitHub runner, weekly and
 * on demand (.github/workflows/wikidata-enrich.yml).
 *
 * Fetch (the default) reads every answer list and asks Wikidata for:
 * - the sitelink count of every QID the lists reference: an entry's id when
 *   it is a QID (copied from a dataset record, CONTENT_GUIDE §2.12), or its
 *   wikidataId;
 * - QID candidates for every active x. entry without a wikidataId: a search
 *   by name, then every result whose label or alias agrees with the entry's
 *   name or aliases, with the facts behind the entry's qualifier (a film's
 *   year, a book's author, a city's country) and whether they agree.
 * It writes content/answer-lists/_wikidata/<type>.json, one file per list,
 * and nothing else: no list entry changes. It writes only once every
 * request has succeeded, so a failed run leaves no partial files, and
 * without network it fails with one line naming the host.
 *
 * Apply is the list builder's step once an enrichment pull request has
 * merged. It copies each referenced QID's sitelink count into the entry's
 * popularity (PRD §4.1.3's tie-break) and, with --accept-matches, sets
 * wikidataId where exactly one candidate agrees on label and qualifier,
 * under a new list version. It holds whatever the run's judgement no longer
 * covers: an entry whose name, aliases or qualifier changed since the fetch
 * (each record carries a hash of them), a verdict that doesn't follow from
 * the file's own candidates, a QID an entry of any list already references,
 * and every music_artist match, whose check can't tell a musician from a
 * namesake. Popularity reorders suggestion ties, which C12's suggestion
 * probe reads for every sealed mystery, so --write needs the content key:
 * it probes every checking or active mystery with the lists as they stand
 * and as they would be, and writes nothing if any mystery gains a hit.
 * Apply never skips an entry because a sealed item uses it: a skipped entry
 * would point at a mystery in a public diff.
 *
 * QIDs here only ever come from fetched records or the lists themselves,
 * never from memory (CONTENT_GUIDE §9.6). The property ids the qualifier
 * checks read are verified against their fetched English labels on every
 * run. See content/answer-lists/_wikidata/README.md.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { normalizeName } from "../../src/engine/suggest/normalize.ts";
import { loadBank, type Bank } from "../../src/content/pipeline/bank.ts";
import {
  parseCli,
  run,
  str,
  todayUtc,
} from "../../src/content/pipeline/cli.ts";
import {
  readJsonFile,
  sha256Hex,
  stableStringify,
  writeJsonFile,
  writeTextFile,
} from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  repoRelative,
  resolveLayout,
  type Layout,
} from "../../src/content/pipeline/layout.ts";
import {
  AnswerListSchema,
  type AnswerEntity,
  type AnswerList,
} from "../../src/content/schema/answer-lists.ts";
import type { Mystery } from "../../src/content/schema/items.ts";
import {
  ANSWER_TYPES,
  QID_PATTERN,
  answerType,
  entityId,
  isoDate,
  sha256Hex as sha256Digest,
  type AnswerType,
} from "../../src/content/schema/primitives.ts";
import {
  keySourceFromProcess,
  loadMasterKey,
  type SealKeys,
} from "./crypto.ts";
import { printReport, type ReportFinding } from "./lib/report.ts";
import { suggestionProbe } from "./lint/mysteries.ts";

const NAME = "enrich-wikidata";

/** The one host the fetch talks to. Every network failure names it. */
export const WIKIDATA_HOST = "www.wikidata.org";
export const WIKIDATA_API = `https://${WIKIDATA_HOST}/w/api.php`;
/**
 * The output's shape. Apply refuses a file of another format. Format 2
 * added each record's entryHash and the item revisions the run read.
 */
export const OUTPUT_FORMAT = 2;
/** The output folder, inside the lists folder (ARCHITECTURE §2.1). */
export const OUTPUT_FOLDER = "_wikidata";

/** wbgetentities takes at most 50 ids from a client without the bot right. */
const IDS_PER_REQUEST = 50;
/** Search results read per entry, and label-agreeing candidates kept. */
const SEARCH_LIMIT = 10;
const CANDIDATES_KEPT = 5;
/**
 * Tries per request when it fails on the way (no answer, a connection lost
 * while the body arrives, a 5xx answer); the waits grow.
 */
const MAX_ATTEMPTS = 6;
const MAX_WAIT_MS = 120_000;
/**
 * What one request may wait in all when Wikidata asks it to (maxlag,
 * ratelimited, HTTP 429), following Retry-After. Replication lag can last
 * minutes, and an unattended run of thousands of requests should ride it
 * out instead of throwing away everything fetched so far.
 */
const MAX_LAG_WAIT_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 60_000;
/** Wikimedia's API etiquette: wait while database replication lags. */
const MAXLAG_SECONDS = 5;
/** Progress lines while searching, every this many entries. */
const PROGRESS_EVERY = 250;

/**
 * The properties the qualifier checks read, with their English labels.
 * Every run fetches the labels first and compares them with these. A
 * property whose label differs is not compared that run (its facts read as
 * unknown, so no candidate can agree through it), and the output says so.
 */
export const PROPERTIES = {
  P17: "country",
  P50: "author",
  P225: "taxon name",
  P246: "element symbol",
  P297: "ISO 3166-1 alpha-2 code",
  P495: "country of origin",
  P569: "date of birth",
  P571: "inception",
  P577: "publication date",
  P580: "start time",
  P1086: "atomic number",
} as const;
export type PropertyId = keyof typeof PROPERTIES;
const PROPERTY_IDS = Object.keys(PROPERTIES) as PropertyId[];

const ENTITY_PATTERN = /^[QP][1-9][0-9]*$/;

// ---------------------------------------------------------------------------
// The output: content/answer-lists/_wikidata/<type>.json
// ---------------------------------------------------------------------------

const qid = z.string().regex(QID_PATTERN, "must be a Wikidata QID");
const factValue = z.union([z.string(), z.number()]);

/**
 * How a candidate stands: `match` when exactly one candidate agrees on
 * label and qualifier, `duplicate` when that QID already belongs to another
 * entry of the list (or another entry matches it too), `ambiguous` when
 * several candidates agree, `label-only` when a label agrees but no
 * qualifier fact could be compared, and `none` otherwise.
 */
export const VERDICTS = [
  "match",
  "duplicate",
  "ambiguous",
  "label-only",
  "none",
] as const;
export type Verdict = (typeof VERDICTS)[number];

const VERDICT_DOES_NOT_FOLLOW =
  "the file's verdict does not follow from its candidates";

/**
 * What a run judged an entry on, as entryHashOf computes it: apply holds a
 * record once the entry's name, aliases or qualifier differ from the run's.
 */
const entryHash = sha256Digest;
/** The item revision a fact came from: Special:PermanentLink/<revision>. */
const revision = z.int().min(1).nullable();

const SitelinkRecordSchema = z.strictObject({
  /** The list entry. */
  id: entityId,
  entryHash,
  /** The QID it references: its id, or its wikidataId. */
  qid,
  label: z.string().nullable(),
  /** Whether Wikidata's English label or an alias is the entry's name or one of its aliases. */
  labelMatch: z.enum(["label", "alias", "none"]),
  sitelinks: z.int().min(0).nullable(),
  /** The revision the run read; null for a missing item. */
  revision,
  missing: z.literal(true).optional(),
  /** The QID Wikidata redirected to (a merged item). */
  redirectedTo: qid.optional(),
});

const CandidateSchema = z.strictObject({
  qid,
  /** The revision the run read the labels and facts from. */
  revision,
  label: z.string().nullable(),
  description: z.string().nullable(),
  sitelinks: z.int().min(0),
  labelMatch: z.enum(["label", "alias"]),
  /** Wikidata's facts for each compared qualifier field. */
  facts: z.record(z.string(), z.array(factValue)),
  qualifier: z.enum(["agrees", "disagrees", "unknown"]),
});

const CandidateEntrySchema = z
  .strictObject({
    id: entityId,
    entryHash,
    name: z.string(),
    /** The entry's own value for each compared qualifier field. */
    ours: z.record(z.string(), factValue.nullable()),
    verdict: z.enum(VERDICTS),
    /** The agreeing QID for `match` and `duplicate`. */
    match: qid.nullable(),
    /** For `duplicate`: the other entries that hold or match the QID. */
    sharedWith: z.array(entityId).min(1).optional(),
    /** The strongest label-agreeing candidates, agreeing ones first. */
    candidates: z.array(CandidateSchema),
  })
  .superRefine((entry, ctx) => {
    // The verdict follows from the candidates kept, which always include
    // every candidate the verdict rests on: agreeing ones sort first, then
    // unknown ones. A hand edit or a bad merge that breaks this would turn
    // into a QID nobody fetched (CONTENT_GUIDE §9.6).
    const derived = verdictOf(entry.candidates);
    const duplicate = entry.verdict === "duplicate";
    if (
      derived.verdict !== (duplicate ? "match" : entry.verdict) ||
      derived.match !== entry.match
    )
      ctx.addIssue({
        code: "custom",
        path: ["verdict"],
        message: VERDICT_DOES_NOT_FOLLOW,
      });
    if (duplicate !== (entry.sharedWith !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["sharedWith"],
        message: "a duplicate names the entries it shares its QID with",
      });
  });

export const EnrichmentFileSchema = z.strictObject({
  format: z.literal(OUTPUT_FORMAT),
  type: answerType,
  /** The list version the run read. */
  listVersion: isoDate,
  fetchedAt: z.iso.datetime(),
  source: z.strictObject({
    api: z.literal(WIKIDATA_API),
    license: z.literal("CC0-1.0"),
  }),
  /** The properties this list's checks read: the fetched label and whether it matched. */
  properties: z.record(
    z.string(),
    z.strictObject({ label: z.string().nullable(), verified: z.boolean() }),
  ),
  sitelinks: z.array(SitelinkRecordSchema),
  candidates: z.array(CandidateEntrySchema),
});

export type EnrichmentFile = z.infer<typeof EnrichmentFileSchema>;
export type SitelinkRecord = z.infer<typeof SitelinkRecordSchema>;
export type CandidateEntry = z.infer<typeof CandidateEntrySchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
type FactValue = z.infer<typeof factValue>;

// ---------------------------------------------------------------------------
// The HTTP client
// ---------------------------------------------------------------------------

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface EnrichDeps {
  fetch: Fetch;
  sleep: (ms: number) => Promise<void>;
  userAgent: string;
  /** Progress lines. Nothing is logged before Wikidata has answered once. */
  log: (line: string) => void;
}

interface Http {
  get(params: Record<string, string>): Promise<unknown>;
}

interface ApiError extends Error {
  apiCode: string;
}

function apiError(code: string, message: string): ApiError {
  return Object.assign(new Error(message), { apiCode: code });
}

function isApiError(error: unknown, ...codes: string[]): boolean {
  return (
    error instanceof Error &&
    codes.includes(String((error as Partial<ApiError>).apiCode))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Errors that mean there is no route to the host: retrying only delays the failure. */
const PERMANENT_NETWORK_ERRORS = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function messageOf(value: unknown): string {
  const message =
    typeof value === "object" && value !== null
      ? (value as { message?: unknown }).message
      : value;
  return typeof message === "string" ? message : String(message ?? "");
}

/**
 * Why a fetch was rejected, and whether trying again could help. undici
 * wraps the real cause: "fetch failed", then the socket's error code
 * (ENOTFOUND), or a cancelled request whose own cause is a proxy refusing
 * the tunnel ("Proxy response (403) !== 200 when HTTP Tunneling").
 */
export function networkFailure(error: unknown): {
  reason: string;
  permanent: boolean;
} {
  const chain: unknown[] = [];
  for (
    let link: unknown = error;
    link !== undefined && link !== null && chain.length < 8;
    link = (link as { cause?: unknown }).cause
  )
    chain.push(link);
  if (
    chain.some((link) => link instanceof Error && link.name === "TimeoutError")
  )
    return {
      reason: `no answer within ${REQUEST_TIMEOUT_MS / 1000} s`,
      permanent: false,
    };
  for (const link of chain) {
    const proxy = /Proxy response \((\d{3})\)/.exec(messageOf(link));
    if (proxy)
      return {
        reason: `the proxy refused the tunnel with HTTP ${proxy[1]}`,
        permanent: proxy[1] === "403" || proxy[1] === "407",
      };
  }
  for (const link of [...chain].reverse()) {
    const code = (link as { code?: unknown }).code;
    if (typeof code === "string" && code !== "")
      return { reason: code, permanent: PERMANENT_NETWORK_ERRORS.has(code) };
  }
  const deepest = oneLine(messageOf(chain.at(-1)));
  return { reason: deepest || "fetch failed", permanent: false };
}

function backoffMs(attempt: number): number {
  return Math.min(MAX_WAIT_MS, 1000 * 2 ** attempt);
}

/** Retry-After in seconds or as an HTTP date, capped; the backoff otherwise. */
function waitMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header !== null) {
    const seconds = Number(header);
    const ms = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(header) - Date.now();
    if (Number.isFinite(ms) && ms >= 0) return Math.min(MAX_WAIT_MS, ms);
  }
  return backoffMs(attempt);
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Already read or closed: nothing holds the connection.
  }
}

function apiErrorOf(body: unknown): { code: string; info: string } | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, info } = body.error;
  return typeof code === "string"
    ? { code, info: typeof info === "string" ? info : "" }
    : null;
}

/** One request's two budgets (see createHttp). */
interface Budgets {
  /** Requests that failed on the way: no answer, a lost body, a 5xx. */
  failures: number;
  /** Waits Wikidata asked for, and their total in milliseconds. */
  waits: number;
  waited: number;
}

/**
 * After a request, or the body of its answer, failed on the way: waits to
 * try again, or throws once retrying can't help (no route to the host, or
 * MAX_ATTEMPTS used up). The 60 s timeout covers the body too, so a stalled
 * or dropped transfer lands here as well, never as "not JSON".
 */
async function afterNetworkFailure(
  error: unknown,
  budgets: Budgets,
  deps: EnrichDeps,
): Promise<void> {
  budgets.failures += 1;
  const { reason, permanent } = networkFailure(error);
  if (permanent || budgets.failures >= MAX_ATTEMPTS)
    throw new Error(`cannot reach ${WIKIDATA_HOST} (${reason})`);
  await deps.sleep(backoffMs(budgets.failures));
}

/** Waits as Wikidata asked (maxlag, ratelimited, 429), or throws once MAX_LAG_WAIT_MS is spent. */
async function afterAskedToWait(
  response: Response,
  problem: string,
  action: string,
  budgets: Budgets,
  deps: EnrichDeps,
): Promise<void> {
  budgets.waits += 1;
  const wait = waitMs(response, budgets.waits);
  if (budgets.waited + wait > MAX_LAG_WAIT_MS)
    throw new Error(
      `${WIKIDATA_HOST} still answered ${problem} to ${action} after ${Math.round(budgets.waited / 60_000)} minutes of waiting`,
    );
  budgets.waited += wait;
  await deps.sleep(wait);
}

/**
 * GET requests to the Action API, one at a time, as Wikimedia's API
 * etiquette asks: a descriptive User-Agent and maxlag. Two budgets decide
 * when a request gives up. Waits Wikidata asks for (maxlag, ratelimited,
 * HTTP 429) follow Retry-After and may add up to MAX_LAG_WAIT_MS. Failures
 * on the way (no answer, a connection lost while the body arrives, a 5xx
 * answer) get MAX_ATTEMPTS tries with growing waits, and a missing route to
 * the host ends the run at once.
 */
function createHttp(deps: EnrichDeps): Http {
  const headers = { "User-Agent": deps.userAgent, Accept: "application/json" };
  return {
    async get(params) {
      const url = new URL(WIKIDATA_API);
      const query = {
        format: "json",
        formatversion: "2",
        maxlag: String(MAXLAG_SECONDS),
        ...params,
      };
      for (const [key, value] of Object.entries(query))
        url.searchParams.set(key, value);
      const action = params.action ?? "request";
      const budgets: Budgets = { failures: 0, waits: 0, waited: 0 };
      for (;;) {
        let response: Response;
        try {
          response = await deps.fetch(url.href, {
            headers,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        } catch (error) {
          await afterNetworkFailure(error, budgets, deps);
          continue;
        }
        if (response.status === 429) {
          await discard(response);
          await afterAskedToWait(response, "HTTP 429", action, budgets, deps);
          continue;
        }
        if (response.status >= 500) {
          budgets.failures += 1;
          await discard(response);
          if (budgets.failures >= MAX_ATTEMPTS)
            throw new Error(
              `${WIKIDATA_HOST} still answered HTTP ${response.status} to ${action} after ${MAX_ATTEMPTS} attempts`,
            );
          await deps.sleep(waitMs(response, budgets.failures));
          continue;
        }
        if (!response.ok) {
          await discard(response);
          throw new Error(
            `${WIKIDATA_HOST} answered HTTP ${response.status} to ${action}`,
          );
        }
        let raw: string;
        try {
          raw = await response.text();
        } catch (error) {
          await afterNetworkFailure(error, budgets, deps);
          continue;
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new Error(
            `${WIKIDATA_HOST} sent a ${action} response that is not JSON`,
          );
        }
        const error = apiErrorOf(body);
        if (error === null) return body;
        if (error.code === "maxlag" || error.code === "ratelimited") {
          await afterAskedToWait(
            response,
            `API error ${error.code}`,
            action,
            budgets,
            deps,
          );
          continue;
        }
        throw apiError(
          error.code,
          `${WIKIDATA_HOST} refused ${action} (${error.code}${error.info ? `: ${oneLine(error.info)}` : ""})`,
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// API responses (formatversion=2)
// ---------------------------------------------------------------------------

/** An empty map can arrive as [] (PHP's JSON), so every map accepts that too. */
function apiMap<T extends z.ZodType>(value: T) {
  return z
    .union([z.record(z.string(), value), z.array(z.unknown()).max(0)])
    .transform((map) =>
      Array.isArray(map) ? {} : (map as Record<string, z.output<T>>),
    );
}

/**
 * The items of an array that fit the schema. A long run should not fail on
 * one odd statement or search result: an item that doesn't fit drops out,
 * so its fact reads as unknown and no candidate can agree through it.
 */
function lenientArray<T extends z.ZodType>(item: T) {
  return z.array(z.unknown()).transform((items) =>
    items.flatMap((value) => {
      const result = item.safeParse(value);
      return result.success ? [result.data as z.output<T>] : [];
    }),
  );
}

const Term = z.object({ value: z.string() });
const Statement = z.object({
  rank: z.string().optional(),
  mainsnak: z.object({
    snaktype: z.string(),
    datavalue: z.object({ type: z.string(), value: z.unknown() }).optional(),
  }),
});
/**
 * Terms and claims that don't fit read as absent (no label, no fact), which
 * can only lose a candidate. Sitelinks stay strict: a count the run can't
 * read fails the run rather than reaching popularity as 0.
 */
const ApiEntity = z.object({
  id: z.string().optional(),
  missing: z.unknown().optional(),
  /** props=info: the item's latest revision, which the run read. */
  lastrevid: z.int().min(1).optional().catch(undefined),
  redirects: z
    .object({ from: z.string(), to: z.string() })
    .optional()
    .catch(undefined),
  labels: apiMap(Term).optional().catch(undefined),
  descriptions: apiMap(Term).optional().catch(undefined),
  aliases: apiMap(lenientArray(Term)).optional().catch(undefined),
  claims: apiMap(lenientArray(Statement)).optional().catch(undefined),
  sitelinks: apiMap(z.unknown()).optional(),
});
const GetEntitiesResponse = z.object({ entities: apiMap(ApiEntity) });
const SearchHit = z.object({
  id: z.string(),
  label: z.string().optional().catch(undefined),
  aliases: lenientArray(z.string()).optional().catch(undefined),
  match: z
    .object({ type: z.string(), text: z.string() })
    .optional()
    .catch(undefined),
});
const SearchResponse = z.object({ search: lenientArray(SearchHit) });
const GetClaimsResponse = z.object({
  claims: apiMap(lenientArray(Statement)),
});

function parseResponse<T extends z.ZodType>(
  schema: T,
  body: unknown,
  action: string,
): z.output<T> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.map(String).join(".") || "the response";
  throw new Error(
    `${WIKIDATA_HOST} sent an unexpected ${action} response (${where}: ${oneLine(issue?.message ?? "invalid")})`,
  );
}

type ClaimValue = { type: string; value: unknown };

/** What the checks read from an item: English terms, the sitelink count and the claims they use. */
export interface EntityData {
  /** The id Wikidata answered with: a redirect's target. */
  id: string;
  /** The revision read (props=info), or null when the request didn't ask for it. */
  revision: number | null;
  label: string | null;
  description: string | null;
  aliases: string[];
  sitelinks: number;
  claims: Partial<Record<PropertyId, ClaimValue[]>>;
}

function entityData(
  requested: string,
  entity: z.output<typeof ApiEntity>,
): EntityData {
  const claims: Partial<Record<PropertyId, ClaimValue[]>> = {};
  for (const property of PROPERTY_IDS) {
    const values = (entity.claims?.[property] ?? []).flatMap((statement) =>
      statement.rank !== "deprecated" &&
      statement.mainsnak.snaktype === "value" &&
      statement.mainsnak.datavalue !== undefined
        ? [statement.mainsnak.datavalue]
        : [],
    );
    if (values.length > 0) claims[property] = values;
  }
  return {
    id:
      entity.id !== undefined && ENTITY_PATTERN.test(entity.id)
        ? entity.id
        : requested,
    revision: entity.lastrevid ?? null,
    label: entity.labels?.en?.value ?? null,
    description: entity.descriptions?.en?.value ?? null,
    aliases: (entity.aliases?.en ?? []).map((alias) => alias.value),
    sitelinks: Object.keys(entity.sitelinks ?? {}).length,
    claims,
  };
}

/**
 * wbgetentities in batches. An id Wikidata marks missing (deleted, or never
 * created) maps to null. An id the answer leaves out altogether is not
 * missing: MediaWiki drops whatever would take a result past its size limit
 * and only adds a warning, so those ids are asked again in batches half the
 * size, and one still left out on its own fails the run.
 */
async function getEntities(
  http: Http,
  ids: readonly string[],
  props: string,
): Promise<Map<string, EntityData | null>> {
  const out = new Map<string, EntityData | null>();
  let pending: readonly string[] = ids;
  for (
    let size = IDS_PER_REQUEST;
    pending.length > 0;
    size = Math.max(1, Math.floor(size / 2))
  ) {
    const absent: string[] = [];
    for (let start = 0; start < pending.length; start += size) {
      const chunk = pending.slice(start, start + size);
      const body = await http.get({
        action: "wbgetentities",
        ids: chunk.join("|"),
        props,
        languages: "en",
        languagefallback: "1",
      });
      const { entities } = parseResponse(
        GetEntitiesResponse,
        body,
        "wbgetentities",
      );
      const answered = Object.values(entities);
      for (const id of chunk) {
        const entity =
          entities[id] ?? answered.find((item) => item.redirects?.from === id);
        if (entity === undefined) absent.push(id);
        else
          out.set(
            id,
            entity.missing !== undefined ? null : entityData(id, entity),
          );
      }
    }
    if (absent.length > 0 && size === 1)
      throw new Error(
        `${WIKIDATA_HOST} left ${absent[0]} out of wbgetentities (the result was truncated)`,
      );
    pending = absent;
  }
  return out;
}

interface SearchHit {
  id: string;
  label: string | null;
  aliases: string[];
  matchType: string | null;
  matchText: string | null;
}

async function search(http: Http, text: string): Promise<SearchHit[]> {
  const body = await http.get({
    action: "wbsearchentities",
    search: text,
    language: "en",
    uselang: "en",
    type: "item",
    limit: String(SEARCH_LIMIT),
  });
  return parseResponse(SearchResponse, body, "wbsearchentities")
    .search.filter((hit) => QID_PATTERN.test(hit.id))
    .map((hit) => ({
      id: hit.id,
      label: hit.label ?? null,
      aliases: hit.aliases ?? [],
      matchType: hit.match?.type ?? null,
      matchText: hit.match?.text ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Facts and the qualifier checks (CONTENT_GUIDE §9.5.1)
// ---------------------------------------------------------------------------

function claimValues(entity: EntityData, property: PropertyId): ClaimValue[] {
  return entity.claims[property] ?? [];
}

function stringValues(entity: EntityData, property: PropertyId): string[] {
  return claimValues(entity, property).flatMap((claim) =>
    claim.type === "string" && typeof claim.value === "string"
      ? [claim.value]
      : [],
  );
}

/**
 * The signed year of a Wikidata time value ("+1746-03-30T00:00:00Z"), or
 * null when its precision is coarser than a year (a decade, a century).
 */
export function yearOf(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const { time, precision } = value;
  if (typeof time !== "string" || typeof precision !== "number") return null;
  if (precision < 9) return null;
  const match = /^([+-])(\d{1,16})-/.exec(time);
  if (match === null) return null;
  const year = Number(match[2]);
  return match[1] === "-" ? -year : year;
}

function yearValues(entity: EntityData, property: PropertyId): number[] {
  return claimValues(entity, property).flatMap((claim) => {
    const year = claim.type === "time" ? yearOf(claim.value) : null;
    return year === null ? [] : [year];
  });
}

function quantityValues(entity: EntityData, property: PropertyId): number[] {
  return claimValues(entity, property).flatMap((claim) => {
    if (claim.type !== "quantity" || !isRecord(claim.value)) return [];
    const amount = Number(claim.value.amount);
    return Number.isFinite(amount) ? [amount] : [];
  });
}

/** The item ids a claim points at, as Wikidata gave them. */
function itemValues(entity: EntityData, property: PropertyId): string[] {
  return claimValues(entity, property).flatMap((claim) => {
    if (claim.type !== "wikibase-entityid" || !isRecord(claim.value)) return [];
    const { id } = claim.value;
    return typeof id === "string" && QID_PATTERN.test(id) ? [id] : [];
  });
}

/** Item facts fetched in a second pass. */
export interface Resolved {
  /** ISO alpha-2 codes of country items (P297), by QID. */
  countries: Map<string, string[]>;
  /** Author names (English label, then aliases), by QID. */
  names: Map<string, string[]>;
}

interface FieldCheck {
  /** The qualifier field compared. */
  field: string;
  /** The properties it reads; every one must be verified this run. */
  properties: readonly PropertyId[];
  ours(qualifier: Record<string, unknown>): FactValue | null;
  theirs(entity: EntityData, resolved: Resolved): FactValue[];
  same(ours: FactValue, theirs: FactValue): boolean;
}

const own =
  (field: string) =>
  (qualifier: Record<string, unknown>): FactValue | null => {
    const value = qualifier[field];
    return typeof value === "string" || typeof value === "number"
      ? value
      : null;
  };

const compact = (text: string) => normalizeName(text).replace(/ /g, "");
const sameNumber = (a: FactValue, b: FactValue) => a === b;
const sameExact = (a: FactValue, b: FactValue) => a === b;
const sameCode = (a: FactValue, b: FactValue) =>
  String(a).toUpperCase() === String(b).toUpperCase();
const sameText = (a: FactValue, b: FactValue) =>
  normalizeName(String(a)) === normalizeName(String(b));
/** Names compared without spaces, so "J.R.R. Tolkien" meets "J. R. R. Tolkien". */
const sameName = (a: FactValue, b: FactValue) =>
  compact(String(a)) === compact(String(b));

function countryCheck(field: string, property: "P17" | "P495"): FieldCheck {
  return {
    field,
    properties: [property, "P297"],
    ours: own(field),
    theirs: (entity, resolved) =>
      itemValues(entity, property).flatMap(
        (id) => resolved.countries.get(id) ?? [],
      ),
    same: sameCode,
  };
}

function yearCheck(field: string, ...properties: PropertyId[]): FieldCheck {
  return {
    field,
    properties,
    ours: own(field),
    theirs: (entity) =>
      properties.flatMap((property) => yearValues(entity, property)),
    same: sameNumber,
  };
}

/**
 * Each list's qualifier checks: the list builder accepts a match only when
 * the label and the qualifier agree (a film's year, a book's author, a
 * city's country). A sport has no qualifier, so its candidates are never
 * better than label-only.
 */
export const CHECKS: Readonly<Record<AnswerType, readonly FieldCheck[]>> = {
  country: [
    {
      field: "iso_a2",
      properties: ["P297"],
      ours: own("iso_a2"),
      theirs: (entity) => stringValues(entity, "P297"),
      same: sameCode,
    },
  ],
  city: [countryCheck("country", "P17")],
  person: [yearCheck("born", "P569")],
  film: [yearCheck("year", "P577")],
  tv_series: [
    yearCheck("startYear", "P580", "P571", "P577"),
    countryCheck("country", "P495"),
  ],
  book: [
    {
      field: "author",
      properties: ["P50"],
      ours: own("author"),
      theirs: (entity, resolved) =>
        itemValues(entity, "P50").flatMap((id) => resolved.names.get(id) ?? []),
      same: sameName,
    },
  ],
  animal: [
    {
      field: "scientificName",
      properties: ["P225"],
      ours: own("scientificName"),
      theirs: (entity) => stringValues(entity, "P225"),
      same: sameText,
    },
  ],
  element: [
    {
      field: "symbol",
      properties: ["P246"],
      ours: own("symbol"),
      theirs: (entity) => stringValues(entity, "P246"),
      same: sameExact,
    },
    {
      field: "number",
      properties: ["P1086"],
      ours: own("number"),
      theirs: (entity) => quantityValues(entity, "P1086"),
      same: sameNumber,
    },
  ],
  landmark: [countryCheck("country", "P17")],
  music_artist: [
    {
      // A date of birth marks a person (solo or composer), an inception
      // without one a group. That tells a person from a group, not a
      // musician from a namesake (a company, a city or a cricketer agrees
      // too), so apply never accepts a music_artist match on its own.
      field: "kind",
      properties: ["P569", "P571"],
      ours: own("kind"),
      theirs: (entity) =>
        claimValues(entity, "P569").length > 0
          ? ["composer", "solo"]
          : claimValues(entity, "P571").length > 0
            ? ["band"]
            : [],
      same: sameExact,
    },
  ],
  dish: [countryCheck("origin", "P495")],
  sport: [],
};

function compareFacts(a: FactValue, b: FactValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function sortedUnique(values: FactValue[]): FactValue[] {
  return [...new Set(values)].sort(compareFacts);
}

/** Each field: our value, Wikidata's, and whether they agree (null: not comparable). */
export function compareQualifier(
  type: AnswerType,
  qualifier: Record<string, unknown>,
  entity: EntityData,
  resolved: Resolved,
  verified: ReadonlySet<PropertyId>,
): {
  field: string;
  ours: FactValue | null;
  theirs: FactValue[];
  agrees: boolean | null;
}[] {
  return CHECKS[type].map((check) => {
    const ours = check.ours(qualifier);
    const usable = check.properties.every((property) => verified.has(property));
    const theirs = usable ? sortedUnique(check.theirs(entity, resolved)) : [];
    const agrees =
      ours === null || theirs.length === 0
        ? null
        : theirs.some((value) => check.same(ours, value));
    return { field: check.field, ours, theirs, agrees };
  });
}

function qualifierStanding(
  results: readonly { agrees: boolean | null }[],
): Candidate["qualifier"] {
  if (results.some((result) => result.agrees === false)) return "disagrees";
  if (results.some((result) => result.agrees === true)) return "agrees";
  return "unknown";
}

/** The normalized names an entry answers to: its name, then its aliases. */
function keysOf(names: readonly string[]): Set<string> {
  return new Set(names.map(normalizeName).filter((key) => key !== ""));
}

/** Whether Wikidata's English label, or else an alias, is one of the entry's names. */
export function labelMatchOf(
  keys: ReadonlySet<string>,
  label: string | null,
  aliases: readonly string[],
): SitelinkRecord["labelMatch"] {
  if (label !== null && keys.has(normalizeName(label))) return "label";
  return aliases.some((alias) => keys.has(normalizeName(alias)))
    ? "alias"
    : "none";
}

function hitMatch(
  keys: ReadonlySet<string>,
  hit: SearchHit,
): SitelinkRecord["labelMatch"] {
  if (hit.label !== null && keys.has(normalizeName(hit.label))) return "label";
  const aliases = [
    ...hit.aliases,
    ...(hit.matchType === "alias" && hit.matchText !== null
      ? [hit.matchText]
      : []),
  ];
  return aliases.some((alias) => keys.has(normalizeName(alias)))
    ? "alias"
    : "none";
}

const STANDING_ORDER = { agrees: 0, unknown: 1, disagrees: 2 } as const;
const qidNumber = (id: string) => Number(id.slice(1));

function strongestFirst(a: Candidate, b: Candidate): number {
  return (
    STANDING_ORDER[a.qualifier] - STANDING_ORDER[b.qualifier] ||
    (a.labelMatch === b.labelMatch ? 0 : a.labelMatch === "label" ? -1 : 1) ||
    b.sitelinks - a.sitelinks ||
    qidNumber(a.qid) - qidNumber(b.qid)
  );
}

/** The §9.5.1 verdict over every label-agreeing candidate of one entry. */
export function verdictOf(candidates: readonly Candidate[]): {
  verdict: Verdict;
  match: string | null;
} {
  const agreeing = candidates.filter((c) => c.qualifier === "agrees");
  const [only] = agreeing;
  if (agreeing.length === 1 && only !== undefined)
    return { verdict: "match", match: only.qid };
  if (agreeing.length > 1) return { verdict: "ambiguous", match: null };
  if (candidates.some((c) => c.qualifier === "unknown"))
    return { verdict: "label-only", match: null };
  return { verdict: "none", match: null };
}

// ---------------------------------------------------------------------------
// The fetch
// ---------------------------------------------------------------------------

const isQid = (id: string | null | undefined): id is string =>
  typeof id === "string" && QID_PATTERN.test(id);

/** Active and not merged into another entry: the entries that ship. */
const live = (entity: AnswerEntity) =>
  entity.status === "active" && !entity.replacedBy;

/** The QID an entry references: its id when that is a QID, else its wikidataId. */
export function referencedQid(entity: AnswerEntity): string | null {
  if (isQid(entity.id)) return entity.id;
  return isQid(entity.wikidataId) ? entity.wikidataId : null;
}

/** Active x. entries without a wikidataId get candidates. */
export function needsCandidates(entity: AnswerEntity): boolean {
  return live(entity) && entity.id.startsWith("x.") && !entity.wikidataId;
}

function namesOf(entity: AnswerEntity): Set<string> {
  return keysOf([entity.name, ...entity.aliases]);
}

/** The properties that answer with their expected labels; the first request of a run. */
async function verifyProperties(
  http: Http,
): Promise<Map<PropertyId, { label: string | null; verified: boolean }>> {
  const found = await getEntities(http, PROPERTY_IDS, "labels");
  return new Map(
    PROPERTY_IDS.map((id) => {
      const label = found.get(id)?.label ?? null;
      const verified =
        label !== null && label.toLowerCase() === PROPERTIES[id].toLowerCase();
      return [id, { label, verified }];
    }),
  );
}

async function resolveCountries(
  http: Http,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const id of ids) {
    let codes: string[] = [];
    try {
      const body = await http.get({
        action: "wbgetclaims",
        entity: id,
        property: "P297",
      });
      const { claims } = parseResponse(GetClaimsResponse, body, "wbgetclaims");
      codes = [
        ...new Set(
          (claims.P297 ?? []).flatMap((statement) => {
            const value = statement.mainsnak.datavalue?.value;
            return statement.rank !== "deprecated" &&
              typeof value === "string" &&
              /^[A-Za-z]{2}$/.test(value)
              ? [value.toUpperCase()]
              : [];
          }),
        ),
      ];
    } catch (error) {
      // A deleted item names no country, and nor does a merged one:
      // wbgetclaims doesn't follow a redirect and answers
      // unresolved-redirect. Either way the fact reads as unknown.
      if (
        !isApiError(
          error,
          "no-such-entity",
          "invalid-entity-id",
          "unresolved-redirect",
        )
      )
        throw error;
    }
    out.set(id, codes);
  }
  return out;
}

async function resolveNames(
  http: Http,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const found = await getEntities(http, ids, "labels|aliases");
  return new Map(
    ids.map((id) => {
      const entity = found.get(id);
      return [
        id,
        entity
          ? [
              ...(entity.label === null ? [] : [entity.label]),
              ...entity.aliases,
            ]
          : [],
      ];
    }),
  );
}

function usesProperty(type: AnswerType, property: PropertyId): boolean {
  return CHECKS[type].some((check) => check.properties.includes(property));
}

/** What a run judges an entry on: its name, aliases and qualifier, hashed. */
export function entryHashOf(
  entity: Pick<AnswerEntity, "name" | "aliases" | "qualifier">,
): string {
  return sha256Hex(
    stableStringify({
      name: entity.name,
      aliases: entity.aliases,
      qualifier: entity.qualifier,
    }),
  );
}

/**
 * Every QID an entry already references, in every list given and whatever
 * the entry's status (a retired entry still names its entity, and merging
 * two entries is what replacedBy is for), plus the target of each one that
 * Wikidata redirects: QID to the ids of the entries holding it. One entity,
 * one entry (CONTENT_GUIDE §2.10 rule 1).
 */
export function qidHolders(
  lists: readonly AnswerList[],
  redirects: ReadonlyMap<string, string> = new Map(),
): Map<string, string[]> {
  const holders = new Map<string, string[]>();
  const add = (held: string, id: string) => {
    const ids = holders.get(held) ?? [];
    if (!ids.includes(id)) ids.push(id);
    holders.set(held, ids);
  };
  for (const list of lists)
    for (const entity of list.entities) {
      const held = referencedQid(entity);
      if (held === null) continue;
      add(held, entity.id);
      const target = redirects.get(held);
      if (target !== undefined) add(target, entity.id);
    }
  return holders;
}

/** The redirects runs found among the QIDs entries hold: QID to its target. */
export function redirectsOf(
  files: readonly EnrichmentFile[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of files)
    for (const record of file.sitelinks)
      if (record.redirectedTo !== undefined)
        out.set(record.qid, record.redirectedTo);
  return out;
}

/**
 * Marks a match as duplicate when another entry already holds its QID
 * (`held`, from qidHolders) or another entry of the run matches it too.
 */
function markDuplicates(
  entries: readonly CandidateEntry[],
  held: ReadonlyMap<string, readonly string[]>,
): void {
  const holders = new Map<string, string[]>(
    [...held].map(([qid, ids]) => [qid, [...ids]]),
  );
  for (const entry of entries) {
    if (entry.verdict === "match" && entry.match !== null)
      holders.set(entry.match, [...(holders.get(entry.match) ?? []), entry.id]);
  }
  for (const entry of entries) {
    if (entry.verdict !== "match" || entry.match === null) continue;
    const others = (holders.get(entry.match) ?? []).filter(
      (id) => id !== entry.id,
    );
    if (others.length > 0) {
      entry.verdict = "duplicate";
      entry.sharedWith = [...new Set(others)].sort();
    }
  }
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Fetches everything the lists need and returns one file per list. It
 * writes nothing: the caller writes once every request has succeeded.
 * `others` are lists this run doesn't fetch for, read only for the QIDs
 * their entries hold, so a match on one of those is a duplicate too.
 */
export async function fetchEnrichment(
  lists: readonly AnswerList[],
  deps: EnrichDeps,
  now: Date,
  others: readonly AnswerList[] = [],
): Promise<EnrichmentFile[]> {
  const http = createHttp(deps);
  // The first request: a run without network fails here, before any output.
  const properties = await verifyProperties(http);
  const verified = new Set(
    PROPERTY_IDS.filter((id) => properties.get(id)?.verified === true),
  );
  deps.log(
    `Wikidata answered; ${verified.size} of ${PROPERTY_IDS.length} qualifier properties verified by label.`,
  );

  // Every QID the lists hold, whatever the entry's status: a live entry's
  // for its sitelink count, and every one for the redirect a duplicate can
  // hide behind.
  const referenced = [
    ...new Set(
      lists.flatMap((list) =>
        list.entities.flatMap((entity) => {
          const held = referencedQid(entity);
          return held === null ? [] : [held];
        }),
      ),
    ),
  ];
  deps.log(`Reading sitelinks for ${referenced.length} referenced QIDs.`);
  const referencedData = await getEntities(
    http,
    referenced,
    "labels|aliases|sitelinks|info",
  );
  const redirects = new Map<string, string>();
  for (const [held, data] of referencedData)
    if (data && data.id !== held && isQid(data.id))
      redirects.set(held, data.id);

  const hits = new Map<AnswerEntity, SearchHit[]>();
  const candidateTypes = new Map<string, Set<AnswerType>>();
  // Namesakes share one search.
  const searched = new Map<string, SearchHit[]>();
  for (const list of lists) {
    const todo = list.entities.filter(needsCandidates);
    deps.log(`${list.type}: searching ${todo.length} entries.`);
    for (const [index, entity] of todo.entries()) {
      const keys = namesOf(entity);
      const found =
        searched.get(entity.name) ?? (await search(http, entity.name));
      searched.set(entity.name, found);
      const kept = found.filter((hit) => hitMatch(keys, hit) !== "none");
      hits.set(entity, kept);
      for (const hit of kept)
        candidateTypes.set(
          hit.id,
          (candidateTypes.get(hit.id) ?? new Set()).add(list.type),
        );
      if ((index + 1) % PROGRESS_EVERY === 0)
        deps.log(`${list.type}: ${index + 1} of ${todo.length} searched.`);
    }
  }

  const candidateIds = [...candidateTypes.keys()];
  deps.log(`Reading ${candidateIds.length} candidates.`);
  const candidateData = await getEntities(
    http,
    candidateIds,
    "labels|aliases|descriptions|claims|sitelinks|info",
  );

  const countryItems = new Set<string>();
  const authorItems = new Set<string>();
  for (const [id, types] of candidateTypes) {
    const entity = candidateData.get(id);
    if (!entity) continue;
    for (const type of types) {
      for (const property of ["P17", "P495"] as const) {
        if (
          usesProperty(type, property) &&
          verified.has(property) &&
          verified.has("P297")
        )
          for (const item of itemValues(entity, property))
            countryItems.add(item);
      }
      if (usesProperty(type, "P50") && verified.has("P50"))
        for (const item of itemValues(entity, "P50")) authorItems.add(item);
    }
  }
  deps.log(
    `Resolving ${countryItems.size} country items and ${authorItems.size} authors.`,
  );
  const resolved: Resolved = {
    countries: await resolveCountries(http, [...countryItems].sort()),
    names: await resolveNames(http, [...authorItems].sort()),
  };

  const fetchedAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const files = lists.map((list) => {
    const sitelinks: SitelinkRecord[] = [];
    for (const entity of list.entities.filter(live)) {
      const held = referencedQid(entity);
      if (held === null) continue;
      const data = referencedData.get(held);
      if (!data) {
        sitelinks.push({
          id: entity.id,
          entryHash: entryHashOf(entity),
          qid: held,
          label: null,
          labelMatch: "none",
          sitelinks: null,
          revision: null,
          missing: true,
        });
        continue;
      }
      sitelinks.push({
        id: entity.id,
        entryHash: entryHashOf(entity),
        qid: held,
        label: data.label,
        labelMatch: labelMatchOf(namesOf(entity), data.label, data.aliases),
        sitelinks: data.sitelinks,
        revision: data.revision,
        ...(data.id !== held && isQid(data.id)
          ? { redirectedTo: data.id }
          : {}),
      });
    }

    const entries: CandidateEntry[] = [];
    for (const entity of list.entities.filter(needsCandidates)) {
      const keys = namesOf(entity);
      const scored = new Map<string, Candidate>();
      for (const hit of hits.get(entity) ?? []) {
        const data = candidateData.get(hit.id);
        if (!data || !isQid(data.id) || scored.has(data.id)) continue;
        const detailed = labelMatchOf(keys, data.label, data.aliases);
        const labelMatch = detailed !== "none" ? detailed : hitMatch(keys, hit);
        if (labelMatch === "none") continue;
        const results = compareQualifier(
          list.type,
          entity.qualifier,
          data,
          resolved,
          verified,
        );
        scored.set(data.id, {
          qid: data.id,
          revision: data.revision,
          label: data.label,
          description: data.description,
          sitelinks: data.sitelinks,
          labelMatch,
          facts: Object.fromEntries(results.map((r) => [r.field, r.theirs])),
          qualifier: qualifierStanding(results),
        });
      }
      const candidates = [...scored.values()].sort(strongestFirst);
      const { verdict, match } = verdictOf(candidates);
      entries.push({
        id: entity.id,
        entryHash: entryHashOf(entity),
        name: entity.name,
        ours: Object.fromEntries(
          CHECKS[list.type].map((check) => [
            check.field,
            check.ours(entity.qualifier),
          ]),
        ),
        verdict,
        match,
        candidates: candidates.slice(0, CANDIDATES_KEPT),
      });
    }

    const used = PROPERTY_IDS.filter((id) => usesProperty(list.type, id));
    return {
      format: OUTPUT_FORMAT,
      type: list.type,
      listVersion: list.version,
      fetchedAt,
      source: { api: WIKIDATA_API, license: "CC0-1.0" },
      properties: Object.fromEntries(
        used.map((id) => [
          id,
          properties.get(id) ?? { label: null, verified: false },
        ]),
      ),
      sitelinks: sitelinks.sort(byId),
      candidates: entries.sort(byId),
    } satisfies EnrichmentFile;
  });
  // One holders map for every list read, of every status, so a match on a
  // QID another list (or a retired entry) holds is a duplicate too.
  markDuplicates(
    files.flatMap((file) => file.candidates),
    qidHolders([...lists, ...others], redirects),
  );
  return files;
}

/** Validates every file, then writes them; nothing is written if one fails. */
export async function writeEnrichmentFiles(
  dir: string,
  files: readonly EnrichmentFile[],
): Promise<string[]> {
  for (const file of files) {
    const result = EnrichmentFileSchema.safeParse(file);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        `the ${file.type} output fails its own schema at ${issue?.path.map(String).join(".") ?? "?"} (${oneLine(issue?.message ?? "")}); nothing was written`,
      );
    }
  }
  const paths: string[] = [];
  for (const file of files) {
    const path = join(dir, `${file.type}.json`);
    await writeJsonFile(path, file);
    paths.push(path);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// The summary (the pull request body)
// ---------------------------------------------------------------------------

export interface ListSummary {
  type: AnswerType;
  referenced: number;
  sitelinks: number;
  labelDiffers: number;
  missing: number;
  redirected: number;
  searched: number;
  verdicts: Record<Verdict, number>;
}

export function summarize(files: readonly EnrichmentFile[]): ListSummary[] {
  return files.map((file) => {
    const verdicts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<
      Verdict,
      number
    >;
    for (const entry of file.candidates) verdicts[entry.verdict] += 1;
    return {
      type: file.type,
      referenced: file.sitelinks.length,
      sitelinks: file.sitelinks.filter((r) => r.sitelinks !== null).length,
      labelDiffers: file.sitelinks.filter(
        (r) => !r.missing && r.labelMatch === "none",
      ).length,
      missing: file.sitelinks.filter((r) => r.missing).length,
      redirected: file.sitelinks.filter((r) => r.redirectedTo !== undefined)
        .length,
      searched: file.candidates.length,
      verdicts,
    };
  });
}

const RUN =
  "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/content/enrich-wikidata.ts";

function unverifiedProperties(files: readonly EnrichmentFile[]): string[] {
  const seen = new Map<string, string | null>();
  for (const file of files)
    for (const [id, check] of Object.entries(file.properties))
      if (!check.verified) seen.set(id, check.label);
  return [...seen].map(
    ([id, label]) =>
      `${id} (${PROPERTIES[id as PropertyId] ?? id}): Wikidata labels it ${label === null ? "nothing" : `"${label}"`}`,
  );
}

/** Markdown for the pull request body. */
export function summaryMarkdown(files: readonly EnrichmentFile[]): string {
  const rows = summarize(files);
  const fetchedAt = files[0]?.fetchedAt ?? "";
  const cell = (row: ListSummary) =>
    [
      row.type,
      row.referenced,
      row.sitelinks,
      row.labelDiffers,
      row.missing,
      row.redirected,
      row.searched,
      ...VERDICTS.map((v) => row.verdicts[v]),
    ].join(" | ");
  const unverified = unverifiedProperties(files);
  return [
    "## Wikidata enrichment",
    "",
    `Fetched ${fetchedAt} from ${WIKIDATA_API} (Wikidata, CC0). Wikidata is a candidate source, never evidence (CONTENT_GUIDE §9.5.1).`,
    "",
    "This pull request changes only `content/answer-lists/_wikidata/`. No list entry changes, so merging it ships nothing and moves no mystery's checks.",
    "",
    "| List | QIDs referenced | Sitelinks read | Label differs | Missing | Redirected | Entries searched | Match | Duplicate | Ambiguous | Label only | None |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) => `| ${cell(row)} |`),
    "",
    ...(unverified.length > 0
      ? [
          `**Not compared this run:** ${unverified.join("; ")}. Facts read through these properties count as unknown, so no candidate agrees through them.`,
          "",
        ]
      : []),
    "### After merging: the list builder",
    "",
    `1. See exactly what the write will change: \`${RUN} --apply --all --accept-matches\`. Popularity takes each referenced QID's sitelink count, and \`wikidataId\` the QID of each entry whose verdict is match. Every held entry is listed with its reason.`,
    "2. Make the changes: the same command with `--write`. It needs the content key, because it first runs C12's suggestion probe on every checking or active sealed mystery, with the lists as they stand and as they would be. Popularity breaks suggestion ties, so a clue word could start suggesting an answer. If any mystery gains a hit, it writes nothing and exits 1 (see the README for what to do then).",
    "3. `npm run content:build`: popularity ships in each list's client projection, so `public/content/lists/` and `src/content/generated/manifest.ts` change.",
    "4. `npm run content:check -- --sealed`, then `npm run content:check`, which runs the drift check that `--sealed` skips.",
    "5. Commit the changed lists together with the files `content:build` wrote, in a commit that touches no sealed envelope, the same UTC day, since a list version goes live with its commit (CONTENT_GUIDE §2.10 rule 5).",
    "",
    "Every changed list gets a new version, so pass D must be confirmed again for each unfrozen Daily that uses one, and the apply waits while a frozen Daily that hasn't been published uses one (CONTENT_GUIDE §9.9 rule 7, ARCHITECTURE §8.7).",
    "",
    "Entries marked duplicate, ambiguous, label only or none need the list builder's judgement, and so does every music_artist match: its check tells a person from a group, never a musician from a namesake, so `--accept-matches` holds them. Accept a QID only where the label and the qualifier agree, and copy it from these files, never from memory (CONTENT_GUIDE §2.12, §9.5.1).",
    "",
  ].join("\n");
}

function summaryLines(files: readonly EnrichmentFile[]): string[] {
  const lines = summarize(files).map(
    (row) =>
      `${row.type}: ${row.sitelinks} of ${row.referenced} referenced QIDs read (${row.labelDiffers} label differs, ${row.missing} missing, ${row.redirected} redirected); ${row.searched} entries searched: ${VERDICTS.map((v) => `${row.verdicts[v]} ${v}`).join(", ")}.`,
  );
  for (const line of unverifiedProperties(files))
    lines.push(`not compared this run: ${line}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Apply: the list builder's step after a merged run
// ---------------------------------------------------------------------------

export interface ApplyReport {
  type: AnswerType;
  /** The run read another list version than the one here now. */
  stale: boolean;
  popularity: { id: string; from: number; to: number }[];
  accepted: { id: string; qid: string }[];
  held: { id: string; reason: string }[];
  written: boolean;
}

/** Why apply holds every music_artist match (see CHECKS.music_artist). */
export const MUSIC_ARTIST_HELD =
  "music_artist needs the list builder's judgement: kind does not identify a musician";

/**
 * Copies a merged run into one list: popularity from every referenced QID's
 * sitelink count, and with acceptMatches a wikidataId from every `match`
 * entry. It holds a record whose entry changed since the run (its hash), a
 * match its own candidates don't bear out, a music_artist match, and a QID
 * that an entry already holds. It changes no other field and skips nothing
 * because a sealed item uses it. With write, the list object takes the
 * changes, a new version and liveAt; the caller writes the file.
 *
 * `holders` (qidHolders over every list, of every status) is shared by the
 * lists applied together, and each accepted match joins it, so two lists
 * never take one QID. Without it, this list's own entries and the file's
 * redirects stand in.
 */
export function applyEnrichment(
  list: AnswerList,
  file: EnrichmentFile,
  options: {
    write: boolean;
    acceptMatches: boolean;
    today: string;
    holders?: Map<string, string[]>;
  },
): ApplyReport {
  if (file.type !== list.type)
    throw new Error(
      `the enrichment file is for ${file.type}, the list is ${list.type}`,
    );
  const entities = new Map(list.entities.map((entity) => [entity.id, entity]));
  const report: ApplyReport = {
    type: list.type,
    stale: file.listVersion !== list.version,
    popularity: [],
    accepted: [],
    held: [],
    written: false,
  };
  const popularity = new Map<AnswerEntity, number>();
  const wikidataIds = new Map<AnswerEntity, string>();
  const changed = "the entry changed after the run; fetch again";

  for (const record of file.sitelinks) {
    const entity = entities.get(record.id);
    if (
      !entity ||
      !live(entity) ||
      referencedQid(entity) !== record.qid ||
      entryHashOf(entity) !== record.entryHash
    ) {
      report.held.push({ id: record.id, reason: changed });
      continue;
    }
    if (record.missing || record.sitelinks === null) {
      report.held.push({
        id: record.id,
        reason: `${record.qid} is missing on Wikidata`,
      });
      continue;
    }
    if (record.labelMatch === "none") {
      report.held.push({
        id: record.id,
        reason: `Wikidata labels ${record.qid} ${record.label === null ? "with nothing" : `"${record.label}"`}, which is neither the name nor an alias`,
      });
      continue;
    }
    if (entity.popularity !== record.sitelinks)
      popularity.set(entity, record.sitelinks);
  }

  if (options.acceptMatches) {
    const holders = options.holders ?? qidHolders([list], redirectsOf([file]));
    for (const entry of file.candidates) {
      if (entry.verdict !== "match" || entry.match === null) continue;
      const entity = entities.get(entry.id);
      if (
        !entity ||
        !needsCandidates(entity) ||
        entity.name !== entry.name ||
        entryHashOf(entity) !== entry.entryHash
      ) {
        report.held.push({ id: entry.id, reason: changed });
        continue;
      }
      const derived = verdictOf(entry.candidates);
      if (derived.verdict !== "match" || derived.match !== entry.match) {
        report.held.push({ id: entry.id, reason: VERDICT_DOES_NOT_FOLLOW });
        continue;
      }
      if (list.type === "music_artist") {
        report.held.push({ id: entry.id, reason: MUSIC_ARTIST_HELD });
        continue;
      }
      const holder = holders.get(entry.match)?.find((id) => id !== entry.id);
      if (holder !== undefined) {
        report.held.push({
          id: entry.id,
          reason: `${entry.match} already belongs to ${holder}`,
        });
        continue;
      }
      holders.set(entry.match, [...(holders.get(entry.match) ?? []), entry.id]);
      wikidataIds.set(entity, entry.match);
      report.accepted.push({ id: entry.id, qid: entry.match });
      const candidate = entry.candidates.find((c) => c.qid === entry.match);
      if (candidate && entity.popularity !== candidate.sitelinks)
        popularity.set(entity, candidate.sitelinks);
    }
  }

  for (const [entity, to] of popularity)
    report.popularity.push({ id: entity.id, from: entity.popularity, to });
  report.popularity.sort(byId);
  report.accepted.sort(byId);
  report.held.sort(byId);

  if (options.write && (popularity.size > 0 || wikidataIds.size > 0)) {
    for (const [entity, to] of popularity) entity.popularity = to;
    for (const [entity, id] of wikidataIds) entity.wikidataId = id;
    list.version = options.today;
    list.liveAt = options.today;
    creditWikidata(list, file.fetchedAt.slice(0, 10));
    report.written = true;
  }
  return report;
}

/**
 * The provenance entry a list gains once Wikidata data is in it, so /credits
 * names Wikidata (CC0) wherever the enrichment supplied ids or counts (PRD
 * §3.14). It names no `key@pin`, so content:lists reads it as no dataset.
 */
export const WIKIDATA_PROVENANCE =
  "Wikidata, through the enrichment workflow: sitelink counts and QIDs";

function creditWikidata(list: AnswerList, retrievedAt: string): void {
  const credit = list.provenance.find(
    (entry) => entry.source === WIKIDATA_PROVENANCE,
  );
  if (credit === undefined)
    list.provenance.push({
      source: WIKIDATA_PROVENANCE,
      license: "CC0-1.0",
      retrievedAt,
    });
  else if (credit.retrievedAt < retrievedAt) credit.retrievedAt = retrievedAt;
}

/**
 * C12's suggestion probe (scripts/content/lint/mysteries.ts) before --write
 * changes anything. Every checking or active mystery of `bank`, loaded with
 * its sealed content, is probed with the lists as they stand and again with
 * `changed` in their place; a hit only the changed lists bring is a
 * finding. content:check can't stand in: on a mystery accepted before
 * CNT-2's rules landed (lint/cutoff.ts) a C12 hit is only a warning, which
 * exits 0. A mystery file the bank couldn't read or parse is a finding too,
 * since the probe can't vouch for it, unless it says it is a draft (or cut
 * or retired). Findings carry ids, rule codes and paths only, for the
 * redacting reporter (ARCHITECTURE §5.4).
 */
export function suggestionGuard(
  bank: Bank,
  changed: readonly AnswerList[],
): { probed: number; findings: ReportFinding[] } {
  const after: Bank = { ...bank, lists: new Map(bank.lists) };
  for (const list of changed) {
    const before = bank.lists.get(list.type);
    if (before === undefined)
      throw new Error(`the ${list.type} list did not load into the bank`);
    // A new index object, so the probe builds its suggestion index afresh.
    after.lists.set(list.type, {
      ...before,
      version: list.version,
      entities: new Map(list.entities.map((entity) => [entity.id, entity])),
    });
  }
  const findings: ReportFinding[] = [];
  const loaded = new Set(bank.items.map((record) => record.file));
  for (const file of bank.files) {
    if (file.kind !== "mystery" || loaded.has(file)) continue;
    const status = isRecord(file.data) ? file.data.status : undefined;
    if (status === "draft" || status === "cut" || status === "retired")
      continue;
    findings.push({
      rule: "C01",
      severity: "error",
      file: file.rel,
      message: "the mystery could not be read, so the probe can't vouch for it",
      sealed: file.sealed,
    });
  }
  let probed = 0;
  for (const record of bank.items) {
    const item = record.item;
    if (!("kind" in item) || item.kind !== "mystery") continue;
    if (item.status !== "checking" && item.status !== "active") continue;
    probed += 1;
    const mystery = item as Mystery;
    const had = new Set(suggestionProbe(bank, mystery).map((hit) => hit.path));
    for (const hit of suggestionProbe(after, mystery)) {
      if (had.has(hit.path)) continue;
      const finding: ReportFinding = {
        rule: "C12",
        severity: "error",
        file: record.file.rel,
        itemId: record.id,
        message: hit.message,
        sealed: record.file.sealed,
      };
      if (hit.path !== undefined) finding.path = hit.path;
      findings.push(finding);
    }
  }
  return { probed, findings };
}

// ---------------------------------------------------------------------------
// The CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage:
  ${RUN} [--type <type>] [--root <dir>] [--summary <file>]
      Fetch from Wikidata (on a GitHub runner: the agents' sandbox can't
      reach it) and write content/answer-lists/_wikidata/<type>.json for
      every list, or for one with --type. No list entry changes.

  ${RUN} --apply (--type <type> | --all) [--write] [--accept-matches] [--today <date>]
      Report, or make with --write, what a merged run changes in the lists:
      popularity from each referenced QID's sitelink count, and with
      --accept-matches a wikidataId on every entry whose verdict is match.
      --write needs the content key: it first runs C12's suggestion probe
      on the sealed mysteries and writes nothing if one gains a hit. Then:
      npm run content:build, content:check -- --sealed, content:check.

  --type <type>      One list (default: every list)
  --all              Every list (with --apply)
  --root <dir>       Bank root (default content/)
  --summary <file>   Also write the run's Markdown summary (the pull request body)
  --write            Write the list changes (with --apply)
  --accept-matches   Also set wikidataId from match verdicts (with --apply)
  --today <date>     The version date --apply --write gives (default today, UTC)`;

export function userAgent(env: NodeJS.ProcessEnv = process.env): string {
  const contact =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
      : "a local run of the Knewt content pipeline";
  return `knewt-enrich-wikidata/1.0 (${contact}; answer-list enrichment, ENR-1) node/${process.versions.node}`;
}

function defaultDeps(): EnrichDeps {
  return {
    fetch: (url, init) => globalThis.fetch(url, init),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    userAgent: userAgent(),
    log: (line) => console.log(line),
  };
}

async function readList(layout: Layout, type: AnswerType): Promise<AnswerList> {
  const path = join(layout.answerListsDir, `${type}.json`);
  const rel = repoRelative(layout, path);
  if (!existsSync(path)) throw new Error(`${rel} does not exist`);
  const parsed = AnswerListSchema.safeParse((await readJsonFile(path)).data);
  if (!parsed.success || parsed.data.type !== type)
    throw new Error(`${rel} fails its schema; run npm run content:check first`);
  return parsed.data;
}

async function readEnrichment(
  layout: Layout,
  path: string,
): Promise<EnrichmentFile> {
  const rel = repoRelative(layout, path);
  const parsed = EnrichmentFileSchema.safeParse(
    (await readJsonFile(path)).data,
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `${rel} is not a format ${OUTPUT_FORMAT} enrichment file (${issue?.path.map(String).join(".") ?? "?"}: ${oneLine(issue?.message ?? "")}); merge a fresh run`,
    );
  }
  return parsed.data;
}

async function fetchMain(
  layout: Layout,
  types: readonly AnswerType[],
  present: readonly AnswerType[],
  summaryPath: string | undefined,
  deps: EnrichDeps,
): Promise<number> {
  const lists: AnswerList[] = [];
  for (const type of types) lists.push(await readList(layout, type));
  if (lists.length === 0)
    throw new Error(
      `no answer lists in ${repoRelative(layout, layout.answerListsDir)}/`,
    );
  // The other lists, for the QIDs their entries hold (a run for one type).
  const others: AnswerList[] = [];
  for (const type of present)
    if (!types.includes(type)) others.push(await readList(layout, type));
  let files: EnrichmentFile[];
  try {
    files = await fetchEnrichment(lists, deps, new Date(), others);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; nothing was written`,
      { cause: error },
    );
  }
  const outDir = join(layout.answerListsDir, OUTPUT_FOLDER);
  const written = await writeEnrichmentFiles(outDir, files);
  if (summaryPath !== undefined)
    await writeTextFile(resolve(summaryPath), summaryMarkdown(files));
  for (const line of summaryLines(files)) console.log(line);
  console.log(
    `${NAME}: wrote ${written.length} file(s) to ${repoRelative(layout, outDir)}/. No list entry changed; once the pull request merges, the list builder applies it with --apply.`,
  );
  return 0;
}

/** The content key, which --write needs for the suggestion probe; it is never printed. */
async function contentKeys(): Promise<SealKeys> {
  const key = await loadMasterKey(keySourceFromProcess());
  if (key === null)
    throw new Error(
      "--write needs the content key, because it runs C12's suggestion probe on the sealed mysteries before it writes anything: set QZ_CONTENT_KEY or restore the key file (content/sealed/README.md). Nothing was written",
    );
  return key.keys;
}

/**
 * The suggestion probe of --write, over the content bank decrypted in
 * memory. Anything thrown while reading sealed content is replaced by one
 * line that says nothing about it, as the redacting reporter does.
 */
async function probeSealed(
  layout: Layout,
  keys: SealKeys,
  changed: readonly AnswerList[],
): Promise<{ probed: number; findings: ReportFinding[] }> {
  try {
    return suggestionGuard(
      await loadBank(layout, { sealed: true, keys }),
      changed,
    );
  } catch {
    throw new Error(
      "C12's suggestion probe stopped on an internal error while it read sealed content; details are hidden (run npm run content:check -- --sealed). Nothing was written",
    );
  }
}

async function applyMain(
  layout: Layout,
  types: readonly AnswerType[],
  present: readonly AnswerType[],
  options: { write: boolean; acceptMatches: boolean; today: string },
): Promise<number> {
  const keys = options.write ? await contentKeys() : null;
  const outDir = join(layout.answerListsDir, OUTPUT_FOLDER);
  const files = new Map<AnswerType, EnrichmentFile>();
  for (const type of types) {
    const path = join(outDir, `${type}.json`);
    if (existsSync(path)) files.set(type, await readEnrichment(layout, path));
  }
  // Every list present, every entry of any status: the QIDs already held
  // anywhere (CONTENT_GUIDE §2.10 rule 1), shared by the lists applied here.
  const lists = new Map<AnswerType, AnswerList>();
  for (const type of new Set([...present, ...files.keys()]))
    lists.set(type, await readList(layout, type));
  const holders = qidHolders(
    [...lists.values()],
    redirectsOf([...files.values()]),
  );

  const results: { list: AnswerList; report: ApplyReport }[] = [];
  for (const type of types) {
    const file = files.get(type);
    const list = lists.get(type);
    if (file === undefined || list === undefined) {
      console.log(
        `${type}: no ${repoRelative(layout, join(outDir, `${type}.json`))} yet; nothing to apply.`,
      );
      continue;
    }
    results.push({
      list,
      report: applyEnrichment(list, file, { ...options, holders }),
    });
  }
  const changed = results.filter((result) => result.report.written);

  let probed = 0;
  if (keys !== null && changed.length > 0) {
    const guard = await probeSealed(
      layout,
      keys,
      changed.map((result) => result.list),
    );
    if (guard.findings.length > 0) {
      // Ids, rule codes and paths only, and no word of which entries moved.
      printReport(
        {
          command: NAME,
          items: guard.probed,
          findings: guard.findings,
          notes: [],
        },
        { redact: true, reveal: false, json: false },
      );
      console.log(
        `${NAME}: nothing was written. With these changes a word of a typed clue would bring up the answer among the top suggestions (C12), or a sealed mystery could not be read. Rewrite or swap out each mystery named, then apply again; if one is in a Daily inside the freeze window, hold this whole apply until that date has passed, never single entries (content/answer-lists/_wikidata/README.md).`,
      );
      return 1;
    }
    probed = guard.probed;
    for (const { list } of changed)
      await writeJsonFile(
        join(layout.answerListsDir, `${list.type}.json`),
        list,
      );
  }

  let changes = 0;
  for (const { report } of results) {
    changes += report.popularity.length + report.accepted.length;
    const verb = report.written ? "set" : "would set";
    console.log(
      `${report.type}: ${report.popularity.length} popularity change(s), ${report.accepted.length} wikidataId(s) accepted, ${report.held.length} held${report.stale ? " (the run read another list version)" : ""}.`,
    );
    for (const change of report.popularity)
      console.log(
        `  ${verb} popularity of ${change.id}: ${change.from} -> ${change.to}`,
      );
    for (const accepted of report.accepted)
      console.log(`  ${verb} wikidataId of ${accepted.id}: ${accepted.qid}`);
    for (const held of report.held)
      console.log(`  held ${held.id}: ${held.reason}`);
  }
  if (changed.length > 0)
    console.log(
      `${NAME}: C12's suggestion probe found no new hit on ${probed} checking or active sealed mystery(ies). Wrote ${changed.length} list(s) under version ${options.today}. Next: npm run content:build, then npm run content:check -- --sealed and npm run content:check, then commit the lists with the regenerated outputs, in a commit that touches no sealed envelope, today (CONTENT_GUIDE §2.10 rule 5). Pass D: see content/answer-lists/_wikidata/README.md.`,
    );
  else
    console.log(
      `${NAME}: ${changes} change(s)${changes > 0 ? "; --write makes them, once C12's suggestion probe passes with the content key" : ""}.`,
    );
  return 0;
}

export async function main(
  argv: string[],
  deps: EnrichDeps = defaultDeps(),
): Promise<number> {
  const values = parseCli(
    NAME,
    argv,
    {
      apply: { type: "boolean" },
      type: { type: "string" },
      all: { type: "boolean" },
      root: { type: "string" },
      summary: { type: "string" },
      write: { type: "boolean" },
      "accept-matches": { type: "boolean" },
      today: { type: "string" },
    },
    USAGE,
  );
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
  });
  const type = str(values, "type");
  if (type !== undefined && !(ANSWER_TYPES as readonly string[]).includes(type))
    throw new Error(`--type is one of ${ANSWER_TYPES.join(", ")}`);
  const present = ANSWER_TYPES.filter((t) =>
    existsSync(join(layout.answerListsDir, `${t}.json`)),
  );

  if (values.apply === true) {
    if ((type === undefined) === (values.all !== true))
      throw new Error(`--apply takes --type <type> or --all\n\n${USAGE}`);
    if (values.summary !== undefined)
      throw new Error(`--summary goes with a fetch, not --apply\n\n${USAGE}`);
    const today = str(values, "today") ?? todayUtc();
    if (!isoDate.safeParse(today).success)
      throw new Error(`--today must be a date (YYYY-MM-DD)`);
    return applyMain(layout, type ? [type as AnswerType] : present, present, {
      write: values.write === true,
      acceptMatches: values["accept-matches"] === true,
      today,
    });
  }
  for (const flag of ["all", "write", "accept-matches", "today"])
    if (values[flag] !== undefined)
      throw new Error(`--${flag} goes with --apply\n\n${USAGE}`);
  return fetchMain(
    layout,
    type ? [type as AnswerType] : present,
    present,
    str(values, "summary"),
    deps,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url))
  run(NAME, () => main(process.argv.slice(2)));
