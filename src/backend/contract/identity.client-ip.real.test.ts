/**
 * The client-ip contract test (ARCHITECTURE §8.6; SQL-2). The limiter keys
 * on the client address that private.config.client_ip names, by default the
 * first X-Forwarded-For hop, and Supabase does not say whether a client can
 * write that hop itself. This test sends a forged first hop, 203.0.113.7,
 * and asks t_client_ip where it landed. It fails while the address the
 * limiter keys on is the forged one, and also while it is no client's
 * address at all: none (a header the gateway does not send, or a rule
 * client_ip() does not recognize) or a reserved proxy hop every client
 * shares, since either would put every player behind one subject. It prints
 * the report (booleans, kinds and header names, never an address), so CI-0
 * can move the rule to a hop the client cannot write, mark it
 * "verified": true, and run this again. Until the rule is verified, a client
 * that forges the hop escapes the per-address limits up to the project-wide
 * bounds and can spend another address's (supabase/README.md §9).
 *
 * Runs only in the backend-contract workflow (QZ_REAL_BACKEND=1), with a
 * test identity; it skips itself in the sandbox.
 */
import { describe, expect, it } from "vitest";

import {
  REAL_BACKEND,
  REAL_TIMEOUT_MS,
  createContractEnv,
  realProject,
} from "./harness";

/** TEST-NET-3: never a real client, and the value t_client_ip looks for. */
const FORGED_HOP = "203.0.113.7";

interface ClientIpReport {
  chosen_forged: boolean;
  /** "none", "forged", "reserved" or "public": only "public" names a client. */
  chosen_kind: string;
  first_hop_forged: boolean;
  last_hop_forged: boolean;
  hops: number;
  hop_kinds: string[];
  header_names: string[];
  forged_headers: string[];
  rule: unknown;
}

async function clientIpReport(): Promise<{
  body: string;
  report: ClientIpReport;
}> {
  const env = createContractEnv("real");
  const registered = await env.backend.identity.register({
    context: "unknown",
    app: "none",
    platform: "other",
  });
  expect(registered.ok, JSON.stringify(registered)).toBe(true);
  const { playerId, secret } = env.identity.current();
  const { url, publishableKey } = realProject();
  const response = await fetch(`${url}/rest/v1/rpc/t_client_ip`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      "X-Forwarded-For": FORGED_HOP,
    },
    body: JSON.stringify({ p_player: playerId, p_secret: secret }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  const envelope = JSON.parse(body) as { ok: boolean; data?: ClientIpReport };
  expect(envelope.ok, body).toBe(true);
  return { body, report: envelope.data as ClientIpReport };
}

describe.skipIf(!REAL_BACKEND)("the client-ip contract", () => {
  it(
    "SQL-2 the address the limiter keys on is a client's public address and not a hop the client wrote",
    async () => {
      const { body, report } = await clientIpReport();
      // The report is what CI-0 reads to choose the hop; it holds no address.
      console.info(`client-ip report: ${JSON.stringify(report)}`);
      expect(body).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
      expect(report.hop_kinds).toHaveLength(report.hops);
      expect(
        report.chosen_forged,
        "private.client_ip() keys on the X-Forwarded-For hop this client forged. Move " +
          "private.config.client_ip to a hop the client cannot write and set " +
          `"verified": true (ARCHITECTURE §8.6). Report: ${JSON.stringify(report)}`,
      ).toBe(false);
      expect(
        report.chosen_kind,
        'private.client_ip() keys on no client\'s address: "none" when the rule names a ' +
          "header the gateway does not send or a hop it does not recognize, " +
          '"reserved" for a proxy hop every client shares. Either puts every ' +
          "player behind one subject. Move private.config.client_ip to the hop " +
          `that holds the client's public address (ARCHITECTURE §8.6). Report: ${JSON.stringify(report)}`,
      ).toBe("public");
    },
    REAL_TIMEOUT_MS,
  );
});
