/**
 * The trust pages' documents (LGL-1), checked as data: the house style
 * of the project brief and DESIGN §1.3, every link and anchor resolving,
 * the privacy page describing every key the app stores, the scoring page's
 * numbers matching the engine and config, and Beta and Should features
 * appearing only with their flags.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { FEATURE_FLAGS, type FeatureFlag } from "@/config/features";
import { TUNABLES } from "@/config/tunables";
import { blitzPoints } from "@/engine/scoring/blitz";
import { roomPoints } from "@/engine/scoring/room";
import { BACKUP_COOKIE_NAME } from "@/platform/identity/cookie";
import { SESSION_KEYS, STORAGE_KEYS } from "@/platform/storage/schema";

import { LEGAL_COPY } from "./copy";
import {
  LEGAL_PATHS,
  sectionAnchor,
  type Block,
  type LegalDocument,
  type LegalPath,
} from "./document";
import { LEGAL_DOCUMENTS } from "./documents";
import {
  LOCAL_STORAGE_LINES,
  SESSION_STORAGE_LINES,
} from "./documents/privacy";

const ALL_ON = () => true;
const ALL_OFF = () => false;
const only =
  (...on: FeatureFlag[]) =>
  (flag: FeatureFlag) =>
    on.includes(flag);

function documents(flags: (flag: FeatureFlag) => boolean): LegalDocument[] {
  return LEGAL_PATHS.map((path) => LEGAL_DOCUMENTS[path](flags));
}

/** Every string a block shows, licence texts aside (they are quoted as written). */
function blockStrings(block: Block): string[] {
  switch (block.kind) {
    case "p":
      return [block.text];
    case "list":
      return [...block.items];
    case "terms":
      return block.items.flatMap((item) => [
        item.term,
        ...item.details,
        ...(item.licence === undefined ? [] : [item.licence.summary]),
      ]);
    case "subhead":
      return [block.text];
    case "licence":
      return [block.summary];
    case "slot":
      return [];
  }
}

interface Found {
  path: LegalPath;
  section: string;
  text: string;
}

function strings(document: LegalDocument): Found[] {
  const found: Found[] = [
    ...document.lede.map((text) => ({
      path: document.path,
      section: "lede",
      text,
    })),
    { path: document.path, section: "title", text: document.title },
  ];
  for (const section of document.sections) {
    found.push({
      path: document.path,
      section: section.id,
      text: section.heading,
    });
    for (const block of section.blocks) {
      for (const text of blockStrings(block)) {
        found.push({ path: document.path, section: section.id, text });
      }
    }
  }
  return found;
}

/** Our own words: the credits' package lines quote each package's copyright notice as written. */
function ourWords(flags: (flag: FeatureFlag) => boolean): Found[] {
  return documents(flags)
    .flatMap(strings)
    .filter(
      (found) =>
        !(
          found.path === "/credits" &&
          found.section === "software" &&
          found.text.startsWith("`")
        ),
    );
}

const BANNED_WORDS =
  /\b(delve|tapestry|crucial|bustling|seamless|testament|landscape|multifaceted|paramount|underscores?|utili[sz]e[sd]?)\b/i;
const BANNED_OPENERS =
  /(^|[.!?]\s+)(Moreover|Furthermore|Additionally|In addition|Consequently|It is important to note that|Generally speaking)\b/;

describe("the house style (project brief, DESIGN §1.3)", () => {
  for (const [name, flags] of [
    ["every flag on", ALL_ON],
    ["every flag off", ALL_OFF],
  ] as const) {
    it(`has no em or en dash, banned word, banned opener, "not only" or "not just" construction, with ${name}`, () => {
      const problems = ourWords(flags).filter(
        ({ text }) =>
          /[—–]/.test(text) ||
          BANNED_WORDS.test(text) ||
          BANNED_OPENERS.test(text) ||
          /\bnot only\b/i.test(text) ||
          /\bit'?s not just\b/i.test(text),
      );
      expect(problems).toEqual([]);
    });

    it(`stays calm: no exclamation mark, no all-caps word and no "tap", with ${name}`, () => {
      const problems = ourWords(flags).filter(
        ({ text }) =>
          text.includes("!") ||
          /\btap(s|ped|ping)?\b/i.test(text) ||
          // Sentence case and no shouting; acronyms (WCAG, UTC) are fine.
          /\b[A-Z]{2,}[a-z]*\s[A-Z]{2,}\s[A-Z]{2,}\b/.test(
            text.replace(/\[[^\]]*\]\([^)]*\)|`[^`]*`/g, ""),
          ),
      );
      expect(problems).toEqual([]);
    });
  }

  it("keeps the frame's labels in the same style", () => {
    for (const label of Object.values(LEGAL_COPY)) {
      expect(label).not.toMatch(/[—–!]/);
    }
  });
});

/** Every page under src/app, by the address it serves. */
function appPages(): Set<string> {
  const app = join(process.cwd(), "src/app");
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry === "page.tsx") {
        const segments = relative(app, dir)
          .split(sep)
          .filter((segment) => segment !== "" && !/^\(.+\)$/.test(segment));
        found.add(`/${segments.join("/")}`);
      }
    }
  };
  walk(app);
  return found;
}

describe("links and anchors", () => {
  const anchorsOf = new Map<LegalPath, Set<string>>(
    documents(ALL_ON).map((document) => [
      document.path,
      new Set(
        document.sections.map((section) =>
          sectionAnchor(document.path, section.id),
        ),
      ),
    ]),
  );

  it("gives every section an anchor that no other trust page uses", () => {
    const all = [...anchorsOf.values()].flatMap((anchors) => [...anchors]);
    expect(new Set(all).size).toBe(all.length);
  });

  for (const [name, flags] of [
    ["every flag on", ALL_ON],
    ["every flag off", ALL_OFF],
  ] as const) {
    it(`links only to pages that exist, sections that exist, https and mail, with ${name}`, () => {
      const pages = appPages();
      const broken: string[] = [];
      for (const { path, text } of ourWords(flags)) {
        for (const [, , href = ""] of text.matchAll(
          /\[([^\]]+)\]\(([^)\s]+)\)/g,
        )) {
          if (href.startsWith("https://") || href.startsWith("mailto:"))
            continue;
          const [target = "", hash] = href.split("#");
          if (!pages.has(target)) broken.push(`${path}: ${href}`);
          if (hash !== undefined) {
            const anchors = anchorsOf.get(target as LegalPath);
            if (anchors === undefined || !anchors.has(hash)) {
              broken.push(`${path}: ${href} (no such section)`);
            }
          }
        }
      }
      expect(broken).toEqual([]);
    });
  }

  it("writes marks the view can draw: balanced links, strong text and code", () => {
    for (const { text } of ourWords(ALL_ON)) {
      const stripped = text
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "")
        .replace(/\*\*(.+?)\*\*/g, "")
        .replace(/`[^`]+`/g, "");
      expect(stripped, text).not.toMatch(/\]\(|\*\*|`/);
    }
  });
});

describe("/privacy describes what the app stores", () => {
  const privacy = (flags: (flag: FeatureFlag) => boolean) =>
    LEGAL_DOCUMENTS["/privacy"](flags);
  const text = (flags: (flag: FeatureFlag) => boolean) =>
    strings(privacy(flags))
      .map((found) => found.text)
      .join("\n");

  it("describes every local-storage key and every session key the storage schema declares", () => {
    const described = new Set(
      [...LOCAL_STORAGE_LINES, ...SESSION_STORAGE_LINES].flatMap(
        (line) => line.keys,
      ),
    );
    expect([...described].sort()).toEqual(
      [
        ...STORAGE_KEYS.map((definition) => definition.key),
        ...SESSION_KEYS,
      ].sort(),
    );
    const shown = text(ALL_ON);
    for (const key of described) {
      expect(shown).toContain(`\`${key.endsWith(":") ? `${key}…` : key}\``);
    }
  });

  it("names the one cookie, the backup of the guest identity", () => {
    expect(text(ALL_OFF)).toContain(
      `There is one cookie, \`${BACKUP_COOKIE_NAME}\`.`,
    );
  });

  it("says where data lives, the retention of PRD §8.3, and that there are no trackers or ads", () => {
    const shown = text(ALL_OFF);
    expect(shown).toContain(
      "Supabase, in its us-east-1 region in the United States",
    );
    expect(shown).toContain("run on Vercel");
    expect(shown).toContain("Analytics events: 7 days");
    expect(shown).toContain("the round-by-round detail for 30 days");
    expect(shown).toContain("deleted 400 days after it ends");
    expect(shown).toContain("Report notes: 180 days.");
    expect(shown).toContain("There are no third-party trackers");
    expect(shown).toContain("Knewt has no ads.");
    expect(shown).toContain("Download my data");
    expect(shown).toContain("Delete my data");
    expect(shown).toContain("hello@knewt.app");
  });

  it("lists Beta and Should storage only in builds that have those features", () => {
    const off = text(ALL_OFF);
    for (const key of [
      "qz:drafts:",
      "qz:seats:",
      "qz:host:",
      "qz:review",
      "qz:mastery",
    ]) {
      expect(off).not.toContain(`\`${key}`);
    }
    expect(off).not.toContain("Quizzes you save (Beta)");
    expect(off).not.toContain("Rooms (Beta)");
    const on = text(ALL_ON);
    expect(on).toContain("Quizzes you save (Beta)");
    expect(on).toContain("Rooms (Beta): 24 hours after the room ends.");
  });
});

describe("/how-scoring-works matches the rules it explains", () => {
  const scoring = (flags: (flag: FeatureFlag) => boolean) =>
    strings(LEGAL_DOCUMENTS["/how-scoring-works"](flags))
      .map((found) => found.text)
      .join("\n");

  it("takes the Encore bands and the crowd threshold from the shared config", () => {
    const shown = scoring(ALL_OFF);
    const { quantity, year } = TUNABLES.encoreBands;
    expect(shown).toContain(
      `Within ${String(quantity.bullseye * 100)}% is a **bullseye** and within ${String(quantity.close * 100)}% is **close**.`,
    );
    expect(shown).toContain(
      `within ${String(year.bullseye)} years is a bullseye`,
    );
    expect(shown).toContain(
      `once ${String(TUNABLES.crowd.percentileMinN)} have finished there`,
    );
    expect(shown).toContain(
      `up to ${String(TUNABLES.timing.roundCapMs / 60_000)} minutes a round`,
    );
  });

  it("works its Encore examples out with the engine: 4% off is a bullseye, 14% close, 39% neither", () => {
    const shown = scoring(ALL_OFF);
    expect(shown).toContain("1,200 km is 4% off: a bullseye.");
    expect(shown).toContain("1,100 km is 14% off: close.");
    expect(shown).toContain("900 km is 39% off.");
  });

  it("follows decisions memo §14.1 on time zones: no 20-hour rule, and a zone change still earns streak credit", () => {
    const shown = scoring(ALL_OFF);
    expect(shown).not.toMatch(/20 hours/);
    expect(shown).toContain(
      "If your device's time zone changed since your previous Daily, that run still counts for your streak, but stays out of the crowd's numbers.",
    );
    expect(shown).toContain(
      "A Daily counts for your streak only when its date is later than your last Daily that counted",
    );
  });

  it("explains Blitz, Survival and rooms only in builds that have them", () => {
    const off = scoring(ALL_OFF);
    expect(off).not.toContain("**Blitz**");
    expect(off).not.toContain("**Survival**");
    expect(off).not.toContain("In a room,");
    const on = scoring(only("blitz", "survival", "rooms"));
    expect(on).toContain("**Blitz**");
    expect(on).toContain("**Survival**");
    expect(on).toContain("In a room,");
  });

  it("gives the Blitz numbers the engine scores with", () => {
    const on = scoring(only("blitz"));
    expect(blitzPoints(0, true)).toBe(150);
    expect(blitzPoints(8000, true)).toBe(100);
    expect(on).toContain(
      `**Blitz** gives you ${String(TUNABLES.blitz.seconds)} seconds to answer as many questions as you can. A right answer scores 100 points plus up to 50 for speed: all 50 if you answer at once, none after 8 seconds.`,
    );
  });

  it("gives the room numbers the engine scores with", () => {
    const on = scoring(only("rooms"));
    const base = {
      scoring: "classic" as const,
      answer: "correct" as const,
      limitMs: 20_000,
      tServerMs: 0,
      tClientMs: 0,
      streakBefore: 0,
      final: false,
    };
    // 700 at the deadline, plus up to 300 for speed...
    expect(
      roomPoints({ ...base, tServerMs: 20_400, tClientMs: 20_000 }).points,
    ).toBe(700);
    expect(roomPoints(base).points).toBe(1000);
    // ...plus 50 a right answer in a row, up to 250, doubled on the last one.
    expect(roomPoints({ ...base, streakBefore: 1 }).points).toBe(1050);
    expect(roomPoints({ ...base, streakBefore: 9 }).points).toBe(1250);
    expect(roomPoints({ ...base, final: true }).points).toBe(2000);
    expect(roomPoints({ ...base, scoring: "accuracy" }).points).toBe(1000);
    expect(on).toContain(
      "In a room, a right answer scores 700 points plus up to 300 for speed, and 50 more for each right answer in a row before it, up to 250. The last question counts double.",
    );
    expect(on).toContain("a right answer scores 1,000 plus the same bonus");
  });
});

describe("feature flags", () => {
  it("builds every page with any combination of flags it reads", () => {
    for (const flag of FEATURE_FLAGS) {
      for (const document of documents(only(flag))) {
        expect(document.sections.length).toBeGreaterThan(0);
      }
    }
  });

  it("names quiz sharing on /content-policy and /accessibility's Should settings only in builds that have them", () => {
    const policyOff = strings(LEGAL_DOCUMENTS["/content-policy"](ALL_OFF))
      .map((f) => f.text)
      .join("\n");
    expect(policyOff).not.toContain("A shared quiz (Beta)");
    expect(policyOff).toContain("Sharing quizzes you make is coming later");
    const a11yOff = strings(LEGAL_DOCUMENTS["/accessibility"](ALL_OFF))
      .map((f) => f.text)
      .join("\n");
    expect(a11yOff).not.toContain("High-contrast feedback");
    expect(a11yOff).not.toContain("Read aloud");
    const a11yOn = strings(LEGAL_DOCUMENTS["/accessibility"](ALL_ON))
      .map((f) => f.text)
      .join("\n");
    expect(a11yOn).toContain("High-contrast feedback");
    expect(a11yOn).toContain("Readable text");
    expect(a11yOn).toContain("Read aloud");
  });
});
