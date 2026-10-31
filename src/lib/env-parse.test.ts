import { describe, expect, it } from "vitest";

import {
  DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  DEFAULT_SUPABASE_URL,
  LOCAL_SITE_URL,
  findPrivilegedPublicKeys,
  isPrivilegedKey,
  parsePublicEnv,
} from "./env-parse";

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fakeJwt(claims: Record<string, unknown>): string {
  return `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url(claims)}.sig`;
}

describe("parsePublicEnv", () => {
  describe("backend mode", () => {
    it("defaults to the real Supabase project with built-in public values", () => {
      expect(parsePublicEnv({})).toEqual({
        backendMode: "supabase",
        supabase: {
          url: DEFAULT_SUPABASE_URL,
          publishableKey: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
        },
        siteUrl: LOCAL_SITE_URL,
        issues: [],
      });
    });

    it.each(["mock", "off"] as const)(
      "uses %s mode without any Supabase config",
      (mode) => {
        const env = parsePublicEnv({
          NEXT_PUBLIC_BACKEND_MODE: mode,
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
        });

        expect(env.backendMode).toBe(mode);
        expect(env.supabase).toBeNull();
        expect(env.issues).toEqual([]);
      },
    );

    it("ignores case and surrounding whitespace", () => {
      expect(
        parsePublicEnv({ NEXT_PUBLIC_BACKEND_MODE: "  MOCK " }).backendMode,
      ).toBe("mock");
    });

    it("treats a blank value as unset", () => {
      expect(parsePublicEnv({ NEXT_PUBLIC_BACKEND_MODE: "   " })).toMatchObject(
        { backendMode: "supabase", issues: [] },
      );
    });

    it("reports an unknown mode and falls back to the default", () => {
      const env = parsePublicEnv({ NEXT_PUBLIC_BACKEND_MODE: "firebase" });

      expect(env.backendMode).toBe("supabase");
      expect(env.issues).toEqual([
        expect.stringContaining('NEXT_PUBLIC_BACKEND_MODE="firebase"'),
      ]);
    });
  });

  describe("supabase config", () => {
    it("uses a custom URL and publishable key, without trailing slashes", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co/ ",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_example ",
      });

      expect(env.supabase).toEqual({
        url: "https://example.supabase.co",
        publishableKey: "sb_publishable_example",
      });
      expect(env.issues).toEqual([]);
    });

    it("accepts the legacy anon key when no publishable key is set", () => {
      const anonKey = fakeJwt({ role: "anon" });
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      });

      expect(env.supabase?.publishableKey).toBe(anonKey);
    });

    it("prefers the publishable key over the legacy anon key", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_new",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }),
      });

      expect(env.supabase?.publishableKey).toBe("sb_publishable_new");
    });

    it("pairs an explicit key with the default URL", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_rotated",
      });

      expect(env.supabase).toEqual({
        url: DEFAULT_SUPABASE_URL,
        publishableKey: "sb_publishable_rotated",
      });
    });

    it("keeps the built-in key when the default URL is set explicitly", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: `${DEFAULT_SUPABASE_URL}/`,
      });

      expect(env.supabase?.publishableKey).toBe(
        DEFAULT_SUPABASE_PUBLISHABLE_KEY,
      );
    });

    it("switches the backend off when a custom URL has no key", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co",
      });

      expect(env.backendMode).toBe("off");
      expect(env.supabase).toBeNull();
      expect(env.issues).toEqual([
        expect.stringContaining("custom project"),
        expect.stringContaining("switched off"),
      ]);
    });

    it.each([
      "not a url",
      "ftp://example.supabase.co",
      "//example.supabase.co",
    ])("switches the backend off for an invalid URL (%s)", (url) => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      });

      expect(env.backendMode).toBe("off");
      expect(env.issues[0]).toContain("not a valid http(s) URL");
    });

    it.each([
      ["a secret key", "sb_secret_abc123"],
      ["a service_role JWT", fakeJwt({ role: "service_role" })],
    ])("refuses %s and switches the backend off", (_label, key) => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      });

      expect(env.backendMode).toBe("off");
      expect(env.supabase).toBeNull();
      expect(env.issues[0]).toContain("secret or service_role");
    });

    it("does not choke on a malformed JWT-like key", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "aaa.%%%not-base64%%%.bbb",
      });

      expect(env.backendMode).toBe("supabase");
      expect(env.supabase?.publishableKey).toBe("aaa.%%%not-base64%%%.bbb");
    });
  });

  describe("URL and key from different projects", () => {
    it("switches the backend off when the built-in key meets a custom URL", () => {
      // A URL exported in the shell plus the key from a copied .env.example.
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://otherproject.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
      });

      expect(env.backendMode).toBe("off");
      expect(env.supabase).toBeNull();
      expect(env.issues).toEqual([
        expect.stringContaining("built-in key"),
        expect.stringContaining("switched off"),
      ]);
    });

    it("switches the backend off when a JWT key names another project", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://projecta.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({
          role: "anon",
          ref: "projectb",
        }),
      });

      expect(env.backendMode).toBe("off");
      expect(env.issues[0]).toContain('belongs to project "projectb"');
    });

    it("checks a JWT key against the default URL too", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({
          role: "anon",
          ref: "projectb",
        }),
      });

      expect(env.backendMode).toBe("off");
    });

    it("accepts a JWT key whose project matches the URL", () => {
      const anonKey = fakeJwt({ role: "anon", ref: "projecta" });
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://ProjectA.supabase.co/",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      });

      expect(env.supabase).toEqual({
        url: "https://projecta.supabase.co",
        publishableKey: anonKey,
      });
      expect(env.issues).toEqual([]);
    });

    it("skips the project check for a custom domain", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://api.quiz.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({
          role: "anon",
          ref: "projectb",
        }),
      });

      expect(env.backendMode).toBe("supabase");
    });
  });

  describe("site URL", () => {
    it("uses an explicit site URL without a trailing slash", () => {
      expect(
        parsePublicEnv({ NEXT_PUBLIC_SITE_URL: "https://quiz.example.com/" })
          .siteUrl,
      ).toBe("https://quiz.example.com");
    });

    it("assumes https when the protocol is missing", () => {
      expect(
        parsePublicEnv({ NEXT_PUBLIC_SITE_URL: "quiz.example.com" }).siteUrl,
      ).toBe("https://quiz.example.com");
    });

    it("prefers the explicit site URL over Vercel values", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_SITE_URL: "https://quiz.example.com",
        NEXT_PUBLIC_VERCEL_ENV: "production",
        NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "quiz.vercel.app",
        NEXT_PUBLIC_VERCEL_URL: "quiz-abc123.vercel.app",
      });

      expect(env.siteUrl).toBe("https://quiz.example.com");
    });

    it("uses the production domain on Vercel production deployments", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_VERCEL_ENV: "production",
        NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "quiz.vercel.app",
        NEXT_PUBLIC_VERCEL_URL: "quiz-abc123.vercel.app",
      });

      expect(env.siteUrl).toBe("https://quiz.vercel.app");
    });

    it("uses the deployment URL on Vercel preview deployments", () => {
      const env = parsePublicEnv({
        NEXT_PUBLIC_VERCEL_ENV: "preview",
        NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "quiz.vercel.app",
        NEXT_PUBLIC_VERCEL_URL: "quiz-git-feature.vercel.app",
      });

      expect(env.siteUrl).toBe("https://quiz-git-feature.vercel.app");
    });

    it("reports an invalid site URL and falls back", () => {
      const env = parsePublicEnv({ NEXT_PUBLIC_SITE_URL: "https://bad host" });

      expect(env.siteUrl).toBe(LOCAL_SITE_URL);
      expect(env.issues).toEqual([
        expect.stringContaining("NEXT_PUBLIC_SITE_URL"),
      ]);
    });
  });
});

describe("isPrivilegedKey", () => {
  it.each([
    ["an sb_secret_ key", "sb_secret_abc123", true],
    ["a service_role JWT", fakeJwt({ role: "service_role" }), true],
    ["a publishable key", "sb_publishable_abc123", false],
    ["an anon JWT", fakeJwt({ role: "anon" }), false],
    ["an empty string", "", false],
    ["a malformed JWT", "aaa.%%%.bbb", false],
  ])("treats %s correctly", (_label, key, expected) => {
    expect(isPrivilegedKey(key)).toBe(expected);
  });
});

describe("findPrivilegedPublicKeys", () => {
  it("names every NEXT_PUBLIC_ variable that holds a privileged key", () => {
    expect(
      findPrivilegedPublicKeys({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_secret_abc123 ",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "service_role" }),
        // Not read by the app, but still inlined if anything ever reads it.
        NEXT_PUBLIC_ANALYTICS_TOKEN: "sb_secret_def456",
      }),
    ).toEqual([
      "NEXT_PUBLIC_ANALYTICS_TOKEN",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  });

  it("ignores server-only variables and public keys", () => {
    expect(
      findPrivilegedPublicKeys({
        // Server-only names never reach the browser bundle.
        SUPABASE_SECRET_KEY: "sb_secret_abc123",
        SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "service_role" }),
        NEXT_PUBLIC_SUPABASE_URL: DEFAULT_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }),
        NEXT_PUBLIC_SITE_URL: undefined,
      }),
    ).toEqual([]);
  });
});
