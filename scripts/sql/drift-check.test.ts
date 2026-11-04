// @vitest-environment node
/**
 * scripts/sql/drift-check.ts: the repository's migrations against
 * list_migrations output (ARCHITECTURE §8.16).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  driftProblems,
  driftReport,
  formatReport,
  main,
} from "./drift-check.ts";
import { parseMigrationName, type MigrationFile } from "./lib.ts";

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function files(...names: string[]): MigrationFile[] {
  return names.map((name) => parseMigrationName(name) as MigrationFile);
}

const REPO = files(
  "20261031000000_key_escrow.sql",
  "20261104000000_baseline.sql",
  "20261104000100_helpers.sql",
  "20261104000200_platform_jobs_attended.sql",
  "20261104000300_api_surface_owner_only.sql",
);

describe("driftReport", () => {
  it("sorts migrations into applied, pending, attended and owner items", () => {
    const report = driftReport(
      REPO,
      [],
      ["20261031000000_key_escrow"],
      () => "select 1;",
    );
    expect(report).toEqual({
      applied: ["20261031000000_key_escrow"],
      missing: [],
      pending: ["20261104000000_baseline", "20261104000100_helpers"],
      outOfOrder: [],
      attendedPending: ["20261104000200_platform_jobs_attended"],
      ownerOnly: [
        { stem: "20261104000300_api_surface_owner_only", applied: false },
      ],
      badNames: [],
      forbidden: [],
    });
    expect(driftProblems(report, false)).toEqual([]);
    expect(driftProblems(report, true)).toHaveLength(2);
    expect(formatReport(report)).toContain(
      "attended item: 20261104000200_platform_jobs_attended (waits for an attended session)",
    );
    expect(formatReport(report)).toContain(
      "owner item: 20261104000300_api_surface_owner_only",
    );
  });

  it("passes --strict at the wave exit while the attended migration waits", () => {
    const report = driftReport(
      REPO,
      [],
      [
        "20261031000000_key_escrow",
        "20261104000000_baseline",
        "20261104000100_helpers",
      ],
      () => "select 1;",
    );
    expect(report.pending).toEqual([]);
    expect(report.attendedPending).toEqual([
      "20261104000200_platform_jobs_attended",
    ]);
    expect(driftProblems(report, true)).toEqual([]);
  });

  it("never calls a waiting attended migration out of order once a later one is applied", () => {
    const report = driftReport(
      files(...REPO.map((file) => file.file), "20261105000000_identity.sql"),
      [],
      [
        "20261031000000_key_escrow",
        "20261104000000_baseline",
        "20261104000100_helpers",
        "20261105000000_identity",
      ],
      () => "select 1;",
    );
    expect(report.outOfOrder).toEqual([]);
    expect(report.attendedPending).toEqual([
      "20261104000200_platform_jobs_attended",
    ]);
    expect(driftProblems(report, false)).toEqual([]);
    expect(driftProblems(report, true)).toEqual([]);
  });

  it("still scans a waiting attended migration for forbidden words", () => {
    const report = driftReport(
      REPO,
      [],
      ["20261031000000_key_escrow"],
      (file) =>
        file.attended
          ? "select 1;\ndelete from private.t where id < 0;\ntruncate private.t;"
          : "select 1;",
    );
    expect(report.forbidden).toHaveLength(1);
    expect(report.forbidden[0]).toContain("TRUNCATE");
  });

  it("fails on an applied migration with no file, one applied out of order, and a bad name", () => {
    const report = driftReport(
      REPO,
      ["baseline.sql"],
      [
        "20261031000000_key_escrow",
        "20261104000100_helpers",
        "20261103000000_hand_made",
      ],
      () => "select 1;",
    );
    expect(report.missing).toEqual(["20261103000000_hand_made"]);
    expect(report.outOfOrder).toEqual(["20261104000000_baseline"]);
    expect(report.pending).toEqual([]);
    expect(report.attendedPending).toEqual([
      "20261104000200_platform_jobs_attended",
    ]);
    const problems = driftProblems(report, false).join("\n");
    expect(problems).toContain(
      "20261103000000_hand_made is applied but has no file",
    );
    expect(problems).toContain(
      "20261104000000_baseline was never applied but sorts before",
    );
    expect(problems).toContain("baseline.sql is not <14-digit version>");
  });

  it("fails on a statement the MCP would stop for in a migration still to apply", () => {
    const bodies: Record<string, string> = {
      "20261031000000_key_escrow":
        "revoke all on t from anon; -- applied, never sent again",
      "20261104000000_baseline": "revoke all on t from anon;",
      "20261104000100_helpers": "update private.config set value = '0';",
      "20261104000200_platform_jobs_attended":
        "select 1;\ndelete from private.t where id < 0;",
      "20261104000300_api_surface_owner_only": "drop extension pg_graphql;",
    };
    const report = driftReport(
      REPO,
      [],
      ["20261031000000_key_escrow"],
      (file) => bodies[file.stem] as string,
    );
    expect(report.forbidden).toHaveLength(2);
    expect(report.forbidden[0]).toContain("REVOKE");
    expect(report.forbidden[1]).toContain(
      "the MCP would ask a human to confirm: UPDATE without WHERE",
    );
    expect(driftProblems(report, false).join("\n")).toContain(
      "would stop for confirmation",
    );
  });
});

describe("main", () => {
  it("reads pasted list_migrations output and reports this repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "qz-sql-drift-"));
    temps.push(dir);
    const applied = join(dir, "applied.json");
    writeFileSync(
      applied,
      JSON.stringify({
        migrations: [
          { version: "20261031222446", name: "20261031000000_key_escrow" },
        ],
      }),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main(["--applied", applied])).toBe(0);
    expect(main(["--applied", applied, "--strict"])).toBe(1);
    expect(main([])).toBe(1);
    const logged = log.mock.calls.flat().join("\n");
    expect(logged).toContain("pending (2)");
    expect(logged).toContain(
      "attended item: 20261104000200_platform_jobs_attended",
    );
    const errors = error.mock.calls.flat().join("\n");
    expect(errors).toContain("20261104000000_baseline is not applied yet");
    expect(errors).not.toContain("20261104000200_platform_jobs_attended");
    log.mockRestore();
    error.mockRestore();
  });
});
