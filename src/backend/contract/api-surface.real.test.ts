/**
 * The real project's API surface (ARCHITECTURE §8.2, §11.7; SQL-1). Runs
 * only in the backend-contract workflow (QZ_REAL_BACKEND=1), since the
 * sandbox cannot reach Supabase. The SQL standing checks prove the same
 * properties from inside the database; these prove them over HTTP, with
 * the publishable key a browser holds.
 */
import { describe, expect, it } from "vitest";

import { REAL_BACKEND, REAL_TIMEOUT_MS, realProject } from "./harness";

const OWNER_STEP =
  "the owner applies supabase/migrations/20261104000300_api_surface_owner_only.sql (supabase/README.md)";

type HeaderMap = Record<string, string>;

async function request(
  path: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeaderMap } = {},
): Promise<Response> {
  const { url, publishableKey } = realProject();
  return fetch(`${url}${path}`, {
    ...init,
    headers: { apikey: publishableKey, ...init.headers },
  });
}

/** No profile header, and the header that asks PostgREST for schema private. */
function profiles(header: string): HeaderMap[] {
  return [{}, { [header]: "private" }];
}

describe.skipIf(!REAL_BACKEND)("the real project's API surface", () => {
  it(
    "lists no RPC at the OpenAPI root",
    async () => {
      const response = await request("/rest/v1/", {
        headers: { Accept: "application/openapi+json" },
      });
      if (!response.ok) {
        // The gateway refuses the publishable key at the root: nothing listed.
        expect(response.status, await response.text()).toBeLessThan(500);
        return;
      }
      const document = (await response.json()) as {
        paths?: Record<string, unknown>;
      };
      const rpcs = Object.keys(document.paths ?? {}).filter((path) =>
        path.startsWith("/rpc/"),
      );
      expect(rpcs, `GET /rest/v1/ lists RPCs: ${OWNER_STEP}`).toEqual([]);
    },
    REAL_TIMEOUT_MS,
  );

  it(
    "reaches no RPC through GraphQL",
    async () => {
      const response = await request("/graphql/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "{ __schema { queryType { fields { name } } mutationType { fields { name } } } }",
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        expect(response.status, text).toBeLessThan(500);
        return;
      }
      const reply = JSON.parse(text) as {
        data?: {
          __schema?: {
            queryType?: { fields?: { name: string }[] | null } | null;
            mutationType?: { fields?: { name: string }[] | null } | null;
          } | null;
        } | null;
      };
      const schema = reply.data?.__schema;
      // pg_graphql is not installed, so the placeholder answers with an error.
      const queries = (schema?.queryType?.fields ?? []).map(
        (field) => field.name,
      );
      const mutations = (schema?.mutationType?.fields ?? []).map(
        (field) => field.name,
      );
      expect(mutations, `GraphQL exposes mutations: ${OWNER_STEP}`).toEqual([]);
      expect(
        queries.filter((name) => name !== "node"),
        `GraphQL exposes queries: ${OWNER_STEP}`,
      ).toEqual([]);
    },
    REAL_TIMEOUT_MS,
  );

  it(
    "exposes no private table through the Data API",
    async () => {
      for (const headers of profiles("Accept-Profile")) {
        const response = await request("/rest/v1/key_escrow?select=kid", {
          headers,
        });
        expect(response.ok, JSON.stringify(headers)).toBe(false);
        expect(response.status).toBeLessThan(500);
      }
    },
    REAL_TIMEOUT_MS,
  );

  it(
    "cannot call a private function as an RPC",
    async () => {
      for (const headers of profiles("Content-Profile")) {
        const response = await request("/rest/v1/rpc/now", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: "{}",
        });
        expect(response.ok, JSON.stringify(headers)).toBe(false);
        expect(response.status).toBeLessThan(500);
      }
    },
    REAL_TIMEOUT_MS,
  );
});
