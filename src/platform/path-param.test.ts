// @vitest-environment node
import { describe, expect, it } from "vitest";

import { matchPathParam } from "./path-param";

describe("matchPathParam", () => {
  it.each([
    ["/g/:groupId", "/g/0f8fad5b", "0f8fad5b"],
    ["/g/:groupId", "/g/0f8fad5b/", "0f8fad5b"],
    ["/g/:groupId/settings", "/g/0f8fad5b/settings", "0f8fad5b"],
    ["/c/:code/play", "/c/AB12CD34/play", "AB12CD34"],
    [
      "/claim/:token",
      "/claim/kq3Zr0x9TWb7vY4mN2cH8s-Lp6eJd_1g",
      "kq3Zr0x9TWb7vY4mN2cH8s-Lp6eJd_1g",
    ],
    ["/q/:code", "/q/AB%20CD", "AB CD"],
  ])("%s at %s is %j", (source, pathname, expected) => {
    expect(matchPathParam(source, pathname)).toBe(expected);
  });

  it.each([
    // The shell's own address, other routes, and near misses.
    ["/g/:groupId", "/shell/group"],
    ["/g/:groupId", "/"],
    ["/g/:groupId", "/g"],
    ["/g/:groupId", "/g/"],
    ["/g/:groupId", "/g/abc/settings"],
    ["/g/:groupId/settings", "/g/abc"],
    ["/c/:code/play", "/c/AB12CD34/result"],
    ["/q/:code", "/q/%E0%A4%A"],
    ["/g/new", "/g/new"],
    ["/:a/:b", "/x/y"],
  ])("%s at %s is no match", (source, pathname) => {
    expect(matchPathParam(source, pathname)).toBeNull();
  });

  it("is null without a pathname", () => {
    expect(matchPathParam("/g/:groupId", null)).toBeNull();
  });
});
