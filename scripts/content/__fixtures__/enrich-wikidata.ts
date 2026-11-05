/**
 * A synthetic Wikidata for enrich-wikidata's tests (ENR-1). The agents'
 * sandbox can't reach Wikidata, so the tests stub fetch with this: it
 * answers wbgetentities, wbsearchentities and wbgetclaims in the Action
 * API's shapes (formatversion=2), and can fail the way a sandbox without
 * network does.
 *
 * Every QID here is copied from a dataset record, never typed from memory
 * (CONTENT_GUIDE §9.6):
 * - Q5432, Q296, Q46373, Q134741 and Q40599: moma-artists@51a140d, as
 *   content/answer-lists/person.json cites them (ConstituentID 2274, 4058,
 *   1465, 4640 and 3721);
 * - Q1299 and Q1203: moma-artists@51a140d, as music_artist.json cites them
 *   (ConstituentID 34671 and 3484);
 * - Q34221 and Q43278: natural-earth@ca96624
 *   ne_50m_geography_regions_points.geojson, as landmark.json cites them
 *   (ne_id 1159105019 and 1159104887);
 * - Q16, Q30, Q953 and Q954: natural-earth@ca96624
 *   ne_110m_admin_0_countries.geojson, the WIKIDATAID of ISO_A2 CA, US, ZM
 *   and ZW.
 * Labels follow those datasets' names, and birth years and country codes
 * follow the records the lists cite. Sitelink counts, revision ids,
 * descriptions and every other claim are invented for the tests. None of
 * this is Wikidata data.
 *
 * Nothing here runs on import. A CLI test preloads a module that calls
 * installFetchStub(), which reads the mode from ENR_FETCH.
 */

/** A claim's datavalue, as the API sends it. */
export interface DataValue {
  type: string;
  value: unknown;
}

export interface SyntheticEntity {
  label?: string;
  aliases?: string[];
  description?: string;
  sitelinks?: number;
  claims?: Record<string, DataValue[]>;
  missing?: true;
}

export interface SyntheticWorld {
  entities: Record<string, SyntheticEntity>;
  /** Search text to the QIDs found, in result order. */
  searches: Record<string, string[]>;
}

/** A time value at a precision (11 day, 9 year, 7 century). */
export function time(year: number, precision = 11): DataValue {
  const digits = String(Math.abs(year)).padStart(4, "0");
  return {
    type: "time",
    value: {
      time: `${year < 0 ? "-" : "+"}${digits}-01-01T00:00:00Z`,
      timezone: 0,
      before: 0,
      after: 0,
      precision,
    },
  };
}

export function item(id: string): DataValue {
  return {
    type: "wikibase-entityid",
    value: { "entity-type": "item", "numeric-id": Number(id.slice(1)), id },
  };
}

export function text(value: string): DataValue {
  return { type: "string", value };
}

export function quantity(amount: number): DataValue {
  return { type: "quantity", value: { amount: `+${amount}`, unit: "1" } };
}

/** The labels the script expects for its properties; a test keeps them equal to PROPERTIES. */
export const PROPERTY_LABELS: Record<string, string> = {
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
};

export const SYNTHETIC = "synthetic test record, not Wikidata data";

export const FIXTURE_WORLD: SyntheticWorld = {
  entities: {
    ...Object.fromEntries(
      Object.entries(PROPERTY_LABELS).map(([id, label]) => [id, { label }]),
    ),
    Q5432: {
      label: "Francisco Goya",
      aliases: ["Goya"],
      description: SYNTHETIC,
      sitelinks: 7,
      claims: { P569: [time(1746)] },
    },
    Q296: {
      label: "Claude Monet",
      description: SYNTHETIC,
      sitelinks: 9,
      claims: { P569: [time(1840)] },
    },
    Q46373: {
      label: "Edgar Degas",
      description: SYNTHETIC,
      sitelinks: 8,
      claims: { P569: [time(1834)] },
    },
    Q134741: {
      label: "Camille Pissarro",
      description: SYNTHETIC,
      sitelinks: 6,
      claims: { P569: [time(1830)] },
    },
    Q40599: { missing: true },
    Q34221: {
      label: "Niagara Falls",
      description: SYNTHETIC,
      sitelinks: 5,
      claims: { P17: [item("Q16"), item("Q30")] },
    },
    Q43278: {
      label: "Victoria Falls",
      description: SYNTHETIC,
      sitelinks: 4,
      claims: { P17: [item("Q953"), item("Q954")] },
    },
    Q1299: {
      label: "The Beatles",
      description: SYNTHETIC,
      sitelinks: 3,
      claims: { P571: [time(1960, 9)] },
    },
    Q1203: {
      label: "John Lennon",
      description: SYNTHETIC,
      sitelinks: 2,
      claims: { P569: [time(1940)] },
    },
    Q16: {
      label: "Canada",
      description: SYNTHETIC,
      sitelinks: 10,
      claims: { P297: [text("CA")] },
    },
    Q30: { label: "United States of America", claims: { P297: [text("US")] } },
    Q953: {
      label: "Zambia",
      description: SYNTHETIC,
      sitelinks: 1,
      claims: { P297: [text("ZM")] },
    },
    Q954: { label: "Zimbabwe", claims: { P297: [text("ZW")] } },
  },
  searches: {
    "Claude Monet": ["Q296"],
    "Edgar Degas": ["Q46373"],
    "Camille Pissarro": ["Q134741"],
    "Niagara Falls": ["Q34221"],
    "Victoria Falls": ["Q43278"],
    "John Lennon": ["Q1203"],
    Canada: ["Q16"],
    // Zimbabwe's label is not the entry's name, so the search keeps only Zambia.
    Zambia: ["Q953", "Q954"],
  },
};

export interface Reply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** An entity's synthetic latest revision (props=info's lastrevid), invented like the rest. */
export function revisionOf(id: string): number {
  return 2_400_000_000 + Number(id.slice(1));
}

const PROPS = [
  "labels",
  "aliases",
  "descriptions",
  "claims",
  "sitelinks",
  "info",
];

function terms(entity: SyntheticEntity, props: Set<string>) {
  const out: Record<string, unknown> = {};
  if (props.has("labels"))
    out.labels =
      entity.label === undefined
        ? {}
        : { en: { language: "en", value: entity.label } };
  if (props.has("descriptions"))
    out.descriptions =
      entity.description === undefined
        ? {}
        : { en: { language: "en", value: entity.description } };
  if (props.has("aliases"))
    out.aliases =
      entity.aliases === undefined
        ? {}
        : {
            en: entity.aliases.map((value) => ({ language: "en", value })),
          };
  return out;
}

function statements(property: string, values: DataValue[]) {
  return values.map((datavalue, index) => ({
    mainsnak: { snaktype: "value", property, datavalue },
    type: "statement",
    id: `fixture$${property}-${index}`,
    rank: "normal",
  }));
}

function claimsOf(entity: SyntheticEntity) {
  return Object.fromEntries(
    Object.entries(entity.claims ?? {}).map(([property, values]) => [
      property,
      statements(property, values),
    ]),
  );
}

function sitelinksOf(entity: SyntheticEntity) {
  return Object.fromEntries(
    Array.from({ length: entity.sitelinks ?? 0 }, (_, index) => [
      `fixture${index}wiki`,
      { site: `fixture${index}wiki`, title: entity.label ?? "", badges: [] },
    ]),
  );
}

function refuse(code: string, info: string): Reply {
  return { status: 200, body: { error: { code, info } } };
}

/** The API's answer to one request URL. */
export function answer(world: SyntheticWorld, url: URL): Reply {
  const param = (name: string) => url.searchParams.get(name) ?? "";
  if (url.origin + url.pathname !== "https://www.wikidata.org/w/api.php")
    return { status: 404, body: { error: { code: "not-found" } } };
  if (param("format") !== "json" || param("formatversion") !== "2")
    return refuse("badformat", "expected format=json&formatversion=2");
  switch (param("action")) {
    case "wbgetentities": {
      const ids = param("ids").split("|");
      if (ids.length > 50)
        return refuse("toomanyvalues", "too many values for ids (50 at most)");
      const props = new Set(param("props").split("|"));
      if ([...props].some((prop) => !PROPS.includes(prop)))
        return refuse("badvalue", `props=${param("props")}`);
      const entities: Record<string, unknown> = {};
      for (const id of ids) {
        const entity = world.entities[id];
        if (entity === undefined || entity.missing) {
          entities[id] = { id, missing: true };
          continue;
        }
        entities[id] = {
          type: id.startsWith("P") ? "property" : "item",
          id,
          ...(props.has("info")
            ? {
                pageid: Number(id.slice(1)),
                ns: id.startsWith("P") ? 120 : 0,
                title: id.startsWith("P") ? `Property:${id}` : id,
                lastrevid: revisionOf(id),
                modified: "2026-11-01T00:00:00Z",
              }
            : {}),
          ...terms(entity, props),
          ...(props.has("claims") ? { claims: claimsOf(entity) } : {}),
          ...(props.has("sitelinks") ? { sitelinks: sitelinksOf(entity) } : {}),
        };
      }
      return { status: 200, body: { entities, success: 1 } };
    }
    case "wbsearchentities": {
      const limit = Number(param("limit") || "7");
      const found = (world.searches[param("search")] ?? []).slice(0, limit);
      return {
        status: 200,
        body: {
          searchinfo: { search: param("search") },
          search: found.map((id) => {
            const entity = world.entities[id] ?? {};
            return {
              id,
              title: id,
              repository: "wikidata",
              label: entity.label,
              description: entity.description,
              match: { type: "label", language: "en", text: entity.label },
            };
          }),
          success: 1,
        },
      };
    }
    case "wbgetclaims": {
      const entity = world.entities[param("entity")];
      if (entity === undefined || entity.missing)
        return refuse("no-such-entity", `no entity ${param("entity")}`);
      const property = param("property");
      const values = entity.claims?.[property];
      return {
        status: 200,
        body: {
          claims:
            values === undefined
              ? {}
              : { [property]: statements(property, values) },
        },
      };
    }
    default:
      return refuse("unknown_action", `action=${param("action")}`);
  }
}

/** A rejected fetch shaped like undici's: "fetch failed", then the socket error. */
export function networkError(code: string): TypeError {
  const cause = Object.assign(
    new Error(`getaddrinfo ${code} www.wikidata.org`),
    { code, syscall: "getaddrinfo", hostname: "www.wikidata.org" },
  );
  return new TypeError("fetch failed", { cause });
}

export function replyToResponse(reply: Reply): Response {
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "content-type": "application/json", ...reply.headers },
  });
}

/**
 * For the CLI tests, through a preloaded module. ENR_FETCH is "world"
 * (answer from FIXTURE_WORLD), "offline" (every request fails like a sandbox
 * without network) or "fail-after:<n>" (n answers, then no network).
 */
export function installFetchStub(): void {
  const mode = process.env.ENR_FETCH ?? "world";
  const limit = mode.startsWith("fail-after:")
    ? Number(mode.slice("fail-after:".length))
    : mode === "offline"
      ? 0
      : Number.POSITIVE_INFINITY;
  let calls = 0;
  globalThis.fetch = (input: string | URL | Request) => {
    calls += 1;
    if (calls > limit) return Promise.reject(networkError("ENOTFOUND"));
    const url = new URL(input instanceof Request ? input.url : String(input));
    return Promise.resolve(replyToResponse(answer(FIXTURE_WORLD, url)));
  };
}
