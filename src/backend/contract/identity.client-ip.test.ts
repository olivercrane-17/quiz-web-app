import { describe, expect, it } from "vitest";

import {
  EXPECTED_FAILURE_MARKER,
  clientIpVerdict,
  isVerifiedRule,
  type ClientIpReport,
} from "./identity.client-ip";

const FIRST = { header: "x-forwarded-for", hop: "first" };

/** The report the real project gave on 5 November 2026, under the shipped rule. */
function report(overrides: Partial<ClientIpReport> = {}): ClientIpReport {
  return {
    chosen_forged: true,
    chosen_kind: "forged",
    first_hop_forged: true,
    last_hop_forged: false,
    hops: 2,
    hop_kinds: ["forged", "public"],
    header_names: ["cf-connecting-ip", "x-forwarded-for"],
    forged_headers: ["x-forwarded-for"],
    rule: { ...FIRST, verified: false },
    ...overrides,
  };
}

const PUBLIC_HOP = { chosen_forged: false, chosen_kind: "public" } as const;

describe("the client-ip verdict", () => {
  it("SQL-2 a forged first hop under an unverified rule is the expected failure, marked as such", () => {
    for (const rule of [
      { ...FIRST, verified: false },
      FIRST,
      { ...FIRST, verified: "true" },
    ]) {
      const verdict = clientIpVerdict(report({ rule }));
      expect(verdict.kind).toBe("expected_failure");
      expect(verdict.kind !== "pass" && verdict.reason).toContain(
        `${EXPECTED_FAILURE_MARKER}: `,
      );
    }
  });

  it('SQL-2 the same outcome fails once the rule carries "verified": true', () => {
    const verdict = clientIpVerdict(
      report({ rule: { ...FIRST, verified: true } }),
    );
    expect(verdict.kind).toBe("fail");
    expect(verdict.kind !== "pass" && verdict.reason).not.toContain(
      EXPECTED_FAILURE_MARKER,
    );
  });

  it("SQL-2 a public hop the client did not write passes, verified or not", () => {
    const rule = { header: "x-forwarded-for", hop: "last" };
    expect(clientIpVerdict(report({ ...PUBLIC_HOP, rule }))).toEqual({
      kind: "pass",
      verified: false,
    });
    expect(
      clientIpVerdict(
        report({ ...PUBLIC_HOP, rule: { ...rule, verified: true } }),
      ),
    ).toEqual({ kind: "pass", verified: true });
  });

  it("SQL-2 no client's address fails whether or not the rule is verified", () => {
    for (const chosen_kind of ["none", "reserved", "invalid"]) {
      for (const verified of [false, true]) {
        const verdict = clientIpVerdict(
          report({
            chosen_forged: false,
            chosen_kind,
            rule: { ...FIRST, verified },
          }),
        );
        expect(verdict.kind, `${chosen_kind}, verified ${verified}`).toBe(
          "fail",
        );
      }
    }
  });

  it("SQL-2 a report whose flags disagree fails rather than passing or being expected", () => {
    expect(
      clientIpVerdict(report({ chosen_forged: true, chosen_kind: "public" }))
        .kind,
    ).toBe("fail");
    expect(
      clientIpVerdict(report({ chosen_forged: false, chosen_kind: "forged" }))
        .kind,
    ).toBe("fail");
  });

  it("SQL-2 only the JSON boolean true marks a rule verified, as private.client_ip_verified() reads it", () => {
    expect(isVerifiedRule({ ...FIRST, verified: true })).toBe(true);
    for (const rule of [
      FIRST,
      { ...FIRST, verified: false },
      { ...FIRST, verified: "true" },
      { ...FIRST, verified: 1 },
      [{ verified: true }],
      null,
      "verified",
      undefined,
    ]) {
      expect(isVerifiedRule(rule), JSON.stringify(rule)).toBe(false);
    }
  });
});
