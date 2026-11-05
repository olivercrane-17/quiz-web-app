/**
 * Per-user paths and the static shells that serve them (ARCHITECTURE
 * §10.1, §1.4 item 17). Each pattern is rewritten onto one prerendered page
 * under `/shell/`, so no code, token or id ever costs a render or sits in a
 * cached page; the address bar keeps the original path, and the shell's
 * island reads its param from `location.pathname` in an effect.
 *
 * next.config.ts builds its `rewrites()` from this table, which is why the
 * module has no imports (the config cannot resolve the `@/` alias). Each
 * shell page lives at `src/app/(<group>)/shell/<shell>/page.tsx` and
 * re-exports its feature's route module.
 *
 * `rewrites()` returns a plain array, which Next applies after the
 * filesystem, so real pages such as `/g/new`, `/join` and `/create/import`
 * still win over these patterns.
 */

export type ShellGroup = "landing" | "play" | "tabs" | "host";

export interface ShellRoute {
  /** The per-user pattern, in next.config.ts's syntax. */
  source: string;
  /** The shell page's name: it is served at `/shell/<shell>`. */
  shell: string;
  /** The route group that holds the shell page, which picks its layout. */
  group: ShellGroup;
  /** The Beta flag that gates the route (its module calls notFound() when off), or null. */
  flag: "rooms" | "editor" | null;
  /** The ticket that builds the route module. */
  owner: string;
}

export const SHELL_ROUTES: readonly ShellRoute[] = [
  {
    source: "/c/:code",
    shell: "challenge",
    group: "landing",
    flag: null,
    owner: "CHL-1",
  },
  {
    source: "/c/:code/play",
    shell: "challenge-play",
    group: "play",
    flag: null,
    owner: "CHL-1",
  },
  {
    source: "/c/:code/result",
    shell: "challenge-result",
    group: "landing",
    flag: null,
    owner: "CHL-1",
  },
  {
    source: "/j/:code",
    shell: "group-invite",
    group: "landing",
    flag: null,
    owner: "GRP-1",
  },
  {
    source: "/claim/:token",
    shell: "claim",
    group: "landing",
    flag: null,
    owner: "IDN-2",
  },
  {
    source: "/g/:groupId",
    shell: "group",
    group: "tabs",
    flag: null,
    owner: "GRP-1",
  },
  {
    source: "/g/:groupId/settings",
    shell: "group-settings",
    group: "tabs",
    flag: null,
    owner: "GRP-1",
  },
  {
    source: "/room/:roomId",
    shell: "room",
    group: "play",
    flag: "rooms",
    owner: "ROM-3",
  },
  {
    source: "/host/:roomId",
    shell: "host-room",
    group: "host",
    flag: "rooms",
    owner: "ROM-2",
  },
  {
    source: "/join/:code",
    shell: "join",
    group: "landing",
    flag: "rooms",
    owner: "ROM-3",
  },
  {
    source: "/q/:code",
    shell: "quiz",
    group: "landing",
    flag: "editor",
    owner: "EDT-3",
  },
  {
    source: "/q/:code/play",
    shell: "quiz-play",
    group: "play",
    flag: "editor",
    owner: "EDT-3",
  },
  {
    source: "/q/:code/result",
    shell: "quiz-result",
    group: "landing",
    flag: "editor",
    owner: "EDT-3",
  },
  {
    source: "/create/:quizId",
    shell: "editor",
    group: "tabs",
    flag: "editor",
    owner: "EDT-1",
  },
];

/** The address a shell is prerendered at. */
export function shellPath(shell: string): string {
  return `/shell/${shell}`;
}

/** The `rewrites()` entries: a plain array, so the filesystem wins (see above). */
export function shellRewrites(): { source: string; destination: string }[] {
  return SHELL_ROUTES.map((route) => ({
    source: route.source,
    destination: shellPath(route.shell),
  }));
}
