// @vitest-environment node
/**
 * The spike's precache list (PWA-0), over a fake `.next/` written to a
 * temporary directory: shells, first-load chunks, the HTML's assets and
 * the walk through lazy chunks and stylesheet urls.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assetsOfHtml,
  firstLoadChunksByRoute,
  firstLoadChunksOf,
  shellHtmlOf,
  shellPrecacheOf,
  staticUrlOf,
  walkStaticReferences,
} from "./precache.mts";

let projectDir: string;

function write(file: string, content: string): void {
  const absolute = path.join(projectDir, ".next", file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function writeStats(entries: unknown): void {
  write("diagnostics/route-bundle-stats.json", JSON.stringify(entries));
}

/** A Turbopack async loader: the chunk names its lazy chunks as literals. */
function loader(...chunks: string[]): string {
  const list = chunks.map((chunk) => `"static/chunks/${chunk}"`).join(",");
  return `(globalThis.TURBOPACK||[]).push([1,s=>{s.v(t=>Promise.all([${list}].map(t=>s.l(t))))}]);`;
}

function html(...tags: string[]): string {
  return `<!DOCTYPE html><html><head>${tags.join("")}</head><body><script>self.__next_f=[]</script></body></html>`;
}

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), "qz-pwa-spike-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("paths and URLs", () => {
  it("serves .next/static/ files under /_next/static/", () => {
    expect(staticUrlOf("static/chunks/a1.js")).toBe(
      "/_next/static/chunks/a1.js",
    );
    expect(() => staticUrlOf("server/app/index.html")).toThrow(
      /not under static/,
    );
  });

  it("finds a route's prerendered HTML, route groups and all", () => {
    expect(shellHtmlOf("/")).toBe("server/app/index.html");
    expect(shellHtmlOf("/practice/run")).toBe("server/app/practice/run.html");
    expect(() => shellHtmlOf("practice")).toThrow(/not a route path/);
  });
});

describe("assetsOfHtml", () => {
  it("keeps the stylesheets, scripts, preloads and icons a shell loads", () => {
    const assets = assetsOfHtml(
      html(
        '<link rel="stylesheet" href="/_next/static/chunks/a.css" data-precedence="next"/>',
        '<link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/b.js"/>',
        '<script src="/_next/static/chunks/c.js" async=""></script>',
        '<link rel="icon" href="/icon.svg?icon.0abc.svg" sizes="any" type="image/svg+xml"/>',
        "<link rel='apple-touch-icon' href='/apple-icon.png?apple.1def.png'/>",
      ),
    );
    expect(assets.staticUrls).toEqual([
      "/_next/static/chunks/a.css",
      "/_next/static/chunks/b.js",
      "/_next/static/chunks/c.js",
    ]);
    expect(assets.otherUrls).toEqual([
      "/icon.svg?icon.0abc.svg",
      "/apple-icon.png?apple.1def.png",
    ]);
  });

  it("skips nomodule polyfills, other origins, inline scripts and links the page never loads", () => {
    const assets = assetsOfHtml(
      html(
        '<script src="/_next/static/chunks/polyfills.js" noModule=""></script>',
        '<script src="https://cdn.example/x.js"></script>',
        '<script src="//cdn.example/y.js"></script>',
        '<script id="_R_">self.__next_r="x"</script>',
        '<link rel="canonical" href="/practice/run"/>',
        '<link rel="alternate" href="/feed.xml"/>',
      ),
    );
    expect(assets).toEqual({ staticUrls: [], otherUrls: [] });
  });

  it("refuses static URLs with a query, which a deployment id would add", () => {
    expect(() =>
      assetsOfHtml(
        html('<script src="/_next/static/chunks/c.js?dpl=dpl_1"></script>'),
      ),
    ).toThrow(/query string/);
  });
});

describe("walkStaticReferences", () => {
  it("follows lazy chunks through every loader, and stylesheet urls, without looping", () => {
    write("static/chunks/entry.js", loader("lazy-a.js", "lazy-b.js"));
    write("static/chunks/lazy-a.js", loader("deep.js", "entry.js"));
    write(
      "static/chunks/lazy-b.js",
      'e.exports="/_next/static/media/photo.1a2b.png"',
    );
    write("static/chunks/deep.js", "export{}");
    write(
      "static/chunks/sheet.css",
      [
        '@font-face{src:url("../media/face.3c4d.woff2") format("woff2")}',
        ".a{background:url(/_next/static/media/bg.5e6f.svg)}",
        ".b{background:url('data:image/png;base64,AAAA')}",
        ".c{mask:url(#clip)}",
      ].join(""),
    );
    write("static/media/photo.1a2b.png", "png");
    write("static/media/face.3c4d.woff2", "woff2");
    write("static/media/bg.5e6f.svg", "<svg/>");

    const { files, unresolved } = walkStaticReferences(projectDir, [
      "static/chunks/entry.js",
      "static/chunks/sheet.css",
    ]);
    expect([...files].sort()).toEqual([
      "static/chunks/deep.js",
      "static/chunks/entry.js",
      "static/chunks/lazy-a.js",
      "static/chunks/lazy-b.js",
      "static/chunks/sheet.css",
      "static/media/bg.5e6f.svg",
      "static/media/face.3c4d.woff2",
      "static/media/photo.1a2b.png",
    ]);
    expect([...unresolved]).toEqual([]);
  });

  it("reports references that name no file", () => {
    write("static/chunks/entry.js", loader("gone.js"));
    const { files, unresolved } = walkStaticReferences(projectDir, [
      "static/chunks/entry.js",
    ]);
    expect([...files]).toEqual(["static/chunks/entry.js"]);
    expect([...unresolved]).toEqual(["static/chunks/gone.js"]);
  });

  it("ignores a template that builds chunk names at run time", () => {
    write(
      "static/chunks/runtime.js",
      'const p="static/chunks/"+id;const q=`static/chunks/${id}`;',
    );
    const { files, unresolved } = walkStaticReferences(projectDir, [
      "static/chunks/runtime.js",
    ]);
    expect([...files]).toEqual(["static/chunks/runtime.js"]);
    expect([...unresolved]).toEqual([]);
  });

  it("never leaves static/, takes files only and skips malformed escapes", () => {
    write(
      "static/chunks/entry.js",
      '"static/chunks/../../server/app/secret.html","static/media/folder"',
    );
    write("server/app/secret.html", "<html></html>");
    write("static/media/folder/inside.png", "png");
    write("static/chunks/sheet.css", ".a{background:url(../media/bad%E0.png)}");
    const { files, unresolved } = walkStaticReferences(projectDir, [
      "static/chunks/entry.js",
      "static/chunks/sheet.css",
    ]);
    expect([...files].sort()).toEqual([
      "static/chunks/entry.js",
      "static/chunks/sheet.css",
    ]);
    expect([...unresolved].sort()).toEqual([
      "static/chunks/../../server/app/secret.html",
      "static/media/folder",
    ]);
  });
});

describe("firstLoadChunksOf", () => {
  it("lists a route's first-load chunks relative to .next/", () => {
    writeStats([
      { route: "/", firstLoadChunkPaths: [".next/static/chunks/home.js"] },
      {
        route: "/practice/run",
        firstLoadUncompressedJsBytes: 10,
        firstLoadChunkPaths: [
          ".next/static/chunks/main.js",
          ".next/static/chunks/run.js",
        ],
      },
    ]);
    expect(firstLoadChunksOf(projectDir, "/practice/run")).toEqual([
      "static/chunks/main.js",
      "static/chunks/run.js",
    ]);
    expect([...firstLoadChunksByRoute(projectDir)]).toEqual([
      ["/", ["static/chunks/home.js"]],
      ["/practice/run", ["static/chunks/main.js", "static/chunks/run.js"]],
    ]);
  });

  it("explains a missing, malformed or incomplete stats file", () => {
    expect(() => firstLoadChunksOf(projectDir, "/")).toThrow(
      /Run "next build" first/,
    );
    writeStats({ route: "/" });
    expect(() => firstLoadChunksOf(projectDir, "/")).toThrow(/format changed/);
    writeStats([{ route: "/", firstLoadChunkPaths: ["static/chunks/a.js"] }]);
    expect(() => firstLoadChunksByRoute(projectDir)).toThrow(/outside \.next/);
    writeStats([
      { route: "/", firstLoadChunkPaths: [".next/static/chunks/a.js"] },
    ]);
    expect(() => firstLoadChunksOf(projectDir, "/practice/run")).toThrow(
      /no entry for \/practice\/run/,
    );
  });
});

describe("shellPrecacheOf", () => {
  function writeShellBuild(): void {
    writeStats([
      {
        route: "/practice/run",
        firstLoadChunkPaths: [
          ".next/static/chunks/main.js",
          ".next/static/chunks/run.js",
        ],
      },
      {
        route: "/practice/results",
        firstLoadChunkPaths: [
          ".next/static/chunks/main.js",
          ".next/static/chunks/results.js",
        ],
      },
    ]);
    const tags = (page: string) =>
      html(
        '<link rel="stylesheet" href="/_next/static/chunks/app.css"/>',
        '<script src="/_next/static/chunks/main.js" async=""></script>',
        `<script src="/_next/static/chunks/${page}.js" async=""></script>`,
        '<script src="/_next/static/chunks/polyfills.js" noModule=""></script>',
        '<link rel="icon" href="/icon.svg?icon.0abc.svg"/>',
      );
    write("server/app/practice/run.html", tags("run"));
    write("server/app/practice/results.html", tags("results"));
    write("static/chunks/main.js", "export{}");
    write("static/chunks/run.js", loader("pack.js"));
    write("static/chunks/results.js", "export{}");
    write("static/chunks/pack.js", "export{}");
    write("static/chunks/app.css", "body{}");
    write("static/chunks/polyfills.js", "export{}");
  }

  it("lists both shells, then every static file they reach, then the icon", () => {
    writeShellBuild();
    expect(shellPrecacheOf(projectDir)).toEqual({
      files: [
        { file: ".next/server/app/practice/run.html", url: "/practice/run" },
        {
          file: ".next/server/app/practice/results.html",
          url: "/practice/results",
        },
        {
          file: ".next/static/chunks/app.css",
          url: "/_next/static/chunks/app.css",
        },
        {
          file: ".next/static/chunks/main.js",
          url: "/_next/static/chunks/main.js",
        },
        {
          file: ".next/static/chunks/pack.js",
          url: "/_next/static/chunks/pack.js",
        },
        {
          file: ".next/static/chunks/results.js",
          url: "/_next/static/chunks/results.js",
        },
        {
          file: ".next/static/chunks/run.js",
          url: "/_next/static/chunks/run.js",
        },
      ],
      extraUrls: ["/icon.svg?icon.0abc.svg"],
      unresolved: [],
    });
  });

  it("refuses a route that is not prerendered", () => {
    writeShellBuild();
    rmSync(path.join(projectDir, ".next/server/app/practice/results.html"));
    expect(() => shellPrecacheOf(projectDir)).toThrow(
      /\/practice\/results has no prerendered HTML/,
    );
  });

  it("refuses a build whose shell loads a file it does not have", () => {
    writeShellBuild();
    rmSync(path.join(projectDir, ".next/static/chunks/results.js"));
    expect(() => shellPrecacheOf(projectDir)).toThrow(
      /\/practice\/results loads static\/chunks\/results\.js/,
    );
  });

  it("takes other routes when asked", () => {
    writeShellBuild();
    writeStats([
      { route: "/", firstLoadChunkPaths: [".next/static/chunks/main.js"] },
    ]);
    write(
      "server/app/index.html",
      html('<script src="/_next/static/chunks/main.js"></script>'),
    );
    expect(shellPrecacheOf(projectDir, ["/"]).files).toEqual([
      { file: ".next/server/app/index.html", url: "/" },
      {
        file: ".next/static/chunks/main.js",
        url: "/_next/static/chunks/main.js",
      },
    ]);
  });
});
