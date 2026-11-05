/**
 * How the client-ip contract test judges a t_client_ip report (ARCHITECTURE
 * §8.6; SQL-2). It lives apart from the network so unit tests cover every
 * outcome in the sandbox, which cannot reach Supabase.
 *
 * The limiter keys on the client address that private.config.client_ip
 * names. The test sends a forged first X-Forwarded-For hop and asks where
 * it landed. One outcome passes: the limiter keys on a public hop the
 * client did not write. One outcome is an expected failure, and only while
 * the rule is unverified: the rule reads the first hop and the client
 * forged it. That is the state supabase/README.md §9 documents until CI-0
 * moves the rule to a hop the client cannot write and sets "verified": true,
 * and once the rule carries that flag the same outcome fails again. Every
 * other outcome fails, verified or not: "none" (a header the gateway does
 * not send, or a rule client_ip() does not recognize) and "reserved" (a
 * proxy hop every client shares) would each put every player behind one
 * subject.
 */

/** TEST-NET-3: never a real client, and the value t_client_ip looks for. */
export const FORGED_HOP = "203.0.113.7";

/** What t_client_ip answers: booleans, kinds and header names, never an address. */
export interface ClientIpReport {
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

export type ClientIpVerdict =
  /** The limiter keys on a public hop the client did not write. */
  | { kind: "pass"; verified: boolean }
  /** The documented state until CI-0 verifies the hop; never once the rule is verified. */
  | { kind: "expected_failure"; reason: string }
  | { kind: "fail"; reason: string };

/** Marks the reason of the one outcome that may fail while the rule is unverified. */
export const EXPECTED_FAILURE_MARKER =
  "EXPECTED FAILURE until CI-0 verifies private.config.client_ip";

/**
 * True when the rule carries "verified": true, read the way
 * private.client_ip_verified() reads it: the JSON boolean, nothing else.
 */
export function isVerifiedRule(rule: unknown): boolean {
  return (
    typeof rule === "object" &&
    rule !== null &&
    !Array.isArray(rule) &&
    (rule as { verified?: unknown }).verified === true
  );
}

export function clientIpVerdict(report: ClientIpReport): ClientIpVerdict {
  const verified = isVerifiedRule(report.rule);
  const detail = `Report: ${JSON.stringify(report)}`;
  if (report.chosen_forged === false && report.chosen_kind === "public") {
    return { kind: "pass", verified };
  }
  if (report.chosen_forged === true && report.chosen_kind === "forged") {
    const forged =
      "private.client_ip() keys on the X-Forwarded-For hop this client forged. Move " +
      "private.config.client_ip to a hop the client cannot write, run this test again, " +
      'and set "verified": true (ARCHITECTURE §8.6, supabase/README.md §9).';
    return verified
      ? {
          kind: "fail",
          reason: `The rule is marked "verified": true, but ${forged} ${detail}`,
        }
      : {
          kind: "expected_failure",
          reason: `${EXPECTED_FAILURE_MARKER}: ${forged} ${detail}`,
        };
  }
  return {
    kind: "fail",
    reason:
      `private.client_ip() keys on no client's address (chosen_kind ` +
      `${JSON.stringify(report.chosen_kind)}, chosen_forged ${String(report.chosen_forged)}): ` +
      '"none" when the rule names a header the gateway does not send or a hop it does not ' +
      'recognize, "reserved" for a proxy hop every client shares. Either puts every player ' +
      "behind one subject. Move private.config.client_ip to the hop that holds the client's " +
      `public address (ARCHITECTURE §8.6). ${detail}`,
  };
}
