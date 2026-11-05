/**
 * The client-ip contract test (ARCHITECTURE §8.6; SQL-2). The limiter keys
 * on the client address that private.config.client_ip names, by default the
 * first X-Forwarded-For hop, and Supabase does not say whether a client can
 * write that hop itself. This test sends a forged first hop, 203.0.113.7,
 * and asks t_client_ip where it landed. It prints the report (booleans,
 * kinds and header names, never an address), so CI-0 can move the rule to
 * a hop the client cannot write, mark it "verified": true, and run this
 * again. Until the rule is verified, a client that forges the hop escapes
 * the per-address limits up to the project-wide bounds and can spend
 * another address's (supabase/README.md §9).
 *
 * Two tests share one call. The first holds the call itself to account
 * every time: a test identity registers, t_client_ip answers 200 with ok,
 * and the reply holds no address. The second judges where the forged hop
 * landed (identity.client-ip.ts). It passes only when the limiter keys on a
 * public hop the client did not write, and it fails on "none" or
 * "reserved", which would put every player behind one subject. One outcome
 * is an expected failure: the rule is not marked "verified" and the limiter
 * keys on the forged first hop, which is how the project ships until CI-0
 * verifies the hop. That outcome is reported as a skip with a warning
 * annotation that says so, never as a pass, and it fails again as soon as
 * private.config.client_ip carries "verified": true.
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
import {
  FORGED_HOP,
  clientIpVerdict,
  type ClientIpReport,
} from "./identity.client-ip";

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
  // One test identity and one t_client_ip call serve both tests; a call
  // that fails fails both.
  let pending: ReturnType<typeof clientIpReport> | undefined;
  const reported = () => (pending ??= clientIpReport());

  it(
    "SQL-2 t_client_ip reports where a forged first hop lands, with kinds and header names and never an address",
    async () => {
      const { body, report } = await reported();
      // The report is what CI-0 reads to choose the hop; it holds no address.
      console.info(`client-ip report: ${JSON.stringify(report)}`);
      expect(body).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
      expect(report.hop_kinds).toHaveLength(report.hops);
      // The verdict reads "verified" from this rule, so it must be the rule
      // object itself and never a stand-in.
      expect(
        typeof report.rule === "object" &&
          report.rule !== null &&
          !Array.isArray(report.rule),
        `t_client_ip reports the rule in force as an object: ${JSON.stringify(report.rule)}`,
      ).toBe(true);
    },
    REAL_TIMEOUT_MS,
  );

  it(
    "SQL-2 the address the limiter keys on is a client's public address and not a hop the client wrote",
    async (ctx) => {
      const verdict = clientIpVerdict((await reported()).report);
      if (verdict.kind === "expected_failure") {
        await ctx.annotate(verdict.reason, "warning");
        ctx.skip(verdict.reason);
        return;
      }
      if (verdict.kind === "fail") throw new Error(verdict.reason);
      if (!verdict.verified) {
        await ctx.annotate(
          "private.client_ip() keys on a public hop this client did not write. CI-0 can " +
            'confirm that hop holds the client\'s own address and set "verified": true ' +
            "(supabase/README.md §9).",
          "notice",
        );
      }
    },
    REAL_TIMEOUT_MS,
  );
});
