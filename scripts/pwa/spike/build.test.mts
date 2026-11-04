// @vitest-environment node
/**
 * The spike builder's guard and cleanup (PWA-0): it only ever overwrites
 * or deletes a public/sw.js that it built itself. The build proper runs in
 * e2e/pwa/spike.spec.ts, on a real `next build`.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertNoForeignWorker,
  buildSpikeWorker,
  removeSpikeWorker,
  workerFileOf,
} from "./build.mts";
import { isSpikeWorker, SPIKE_BANNER } from "./marker.mts";

let projectDir: string;

function writePublic(file: string, content: string): void {
  mkdirSync(path.join(projectDir, "public"), { recursive: true });
  writeFileSync(path.join(projectDir, "public", file), content);
}

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), "qz-pwa-spike-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("the spike's banner", () => {
  it("marks the first line of the spike's worker only", () => {
    expect(isSpikeWorker(`${SPIKE_BANNER}\nvar y=[];`)).toBe(true);
    expect(isSpikeWorker(`"use strict";\n${SPIKE_BANNER}`)).toBe(false);
    expect(isSpikeWorker("self.addEventListener('fetch',()=>{})")).toBe(false);
  });
});

describe("assertNoForeignWorker", () => {
  it("passes with no worker, or with the spike's own", () => {
    expect(() => assertNoForeignWorker(projectDir)).not.toThrow();
    writePublic("sw.js", `${SPIKE_BANNER}\nvar y=[];`);
    expect(() => assertNoForeignWorker(projectDir)).not.toThrow();
  });

  it("stops at a worker the spike didn't build, which means PWA-1's has landed", () => {
    writePublic("sw.js", "self.addEventListener('install',()=>{});");
    expect(() => assertNoForeignWorker(projectDir)).toThrow(
      /spike is retired: delete scripts\/pwa\/spike/,
    );
  });
});

describe("buildSpikeWorker", () => {
  it("needs a production build first", () => {
    expect(() => buildSpikeWorker(projectDir)).toThrow(
      /Run "npm run build" first/,
    );
  });

  it("never overwrites another worker", () => {
    mkdirSync(path.join(projectDir, ".next"), { recursive: true });
    writeFileSync(path.join(projectDir, ".next", "BUILD_ID"), "build-1");
    writePublic("sw.js", "self.addEventListener('install',()=>{});");
    expect(() => buildSpikeWorker(projectDir)).toThrow(/spike is retired/);
    expect(readFileSync(workerFileOf(projectDir), "utf8")).toContain("install");
  });
});

describe("removeSpikeWorker", () => {
  it("deletes the spike's worker and source map, then the empty public/", () => {
    writePublic("sw.js", `${SPIKE_BANNER}\nvar y=[];`);
    writePublic("sw.js.map", "{}");
    expect(removeSpikeWorker(projectDir)).toEqual([
      "public/sw.js",
      "public/sw.js.map",
      "public",
    ]);
    expect(existsSync(path.join(projectDir, "public"))).toBe(false);
  });

  it("keeps public/ when other files live there", () => {
    writePublic("sw.js", `${SPIKE_BANNER}\nvar y=[];`);
    writePublic("robots.txt", "User-agent: *");
    expect(removeSpikeWorker(projectDir)).toEqual(["public/sw.js"]);
    expect(existsSync(path.join(projectDir, "public", "robots.txt"))).toBe(
      true,
    );
  });

  it("leaves a worker it didn't build, and copes with none", () => {
    expect(removeSpikeWorker(projectDir)).toEqual([]);
    writePublic("sw.js", "self.addEventListener('install',()=>{});");
    expect(removeSpikeWorker(projectDir)).toEqual([]);
    expect(existsSync(workerFileOf(projectDir))).toBe(true);
  });
});
