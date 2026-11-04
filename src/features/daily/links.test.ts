// @vitest-environment node
/**
 * The Daily's links lead only where a route answers (RITE round 1, R1-02):
 * Past 7 days shows once ARC-1's `/archive` route exists, and not before.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ARCHIVE_HREF, PRACTICE_HREF } from "./links";

const APP = join(process.cwd(), "src/app");

describe("where the Daily links", () => {
  it("R1-02 shows Past 7 days only while a route serves /archive", () => {
    const archive = existsSync(join(APP, "(tabs)/archive/page.tsx"));
    expect(ARCHIVE_HREF !== null).toBe(archive);
    if (ARCHIVE_HREF !== null) expect(ARCHIVE_HREF).toBe("/archive");
  });

  it("sends the Practice fallbacks to a route that exists", () => {
    expect(PRACTICE_HREF).toBe("/practice/run");
    expect(existsSync(join(APP, "(play)/practice/run/page.tsx"))).toBe(true);
  });
});
