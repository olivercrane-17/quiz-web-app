/**
 * The seven trust pages as their routes render them (LGL-1; PRD §3.14,
 * DESIGN §12.40): one `h1` that matches a unique title, the "Last updated"
 * line, a table of contents that leads to every section, indexable
 * metadata with a canonical address, the footer with the page marked, and
 * the text assertions of AC-LGL-02.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { screen, within } from "@testing-library/react";
import type { Metadata } from "next";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

import { HOW_TO_PLAY } from "@/features/daily";
import { SHELL_COPY } from "@/features/shell";
import { isNoindex, titleText } from "@/lib/metadata";
import { renderWithUser } from "@/test/render";

import { LIST_NAMES } from "./copy";
import { LEGAL_PATHS, type LegalPath } from "./document";
import { QUESTIONS_PROMISE } from "./documents/about-our-questions";
import {
  HONEST_PLAY_DISCLOSURE,
  PERCENT_OFF_EXPLANATION,
} from "./documents/how-scoring-works";
import AboutOurQuestions, * as aboutModule from "./routes/about-our-questions";
import Accessibility, * as accessibilityModule from "./routes/accessibility";
import ContentPolicy, * as contentPolicyModule from "./routes/content-policy";
import Credits, * as creditsModule from "./routes/credits";
import HowScoringWorks, * as scoringModule from "./routes/how-scoring-works";
import Privacy, * as privacyModule from "./routes/privacy";
import Terms, * as termsModule from "./routes/terms";

const ROUTES: Record<
  LegalPath,
  { Page: ComponentType; metadata: Metadata; label: string }
> = {
  "/how-scoring-works": {
    Page: HowScoringWorks,
    metadata: scoringModule.metadata,
    label: SHELL_COPY.legal.howScoringWorks,
  },
  "/about-our-questions": {
    Page: AboutOurQuestions,
    metadata: aboutModule.metadata,
    label: SHELL_COPY.legal.aboutOurQuestions,
  },
  "/privacy": {
    Page: Privacy,
    metadata: privacyModule.metadata,
    label: SHELL_COPY.legal.privacy,
  },
  "/terms": {
    Page: Terms,
    metadata: termsModule.metadata,
    label: SHELL_COPY.legal.terms,
  },
  "/content-policy": {
    Page: ContentPolicy,
    metadata: contentPolicyModule.metadata,
    label: SHELL_COPY.legal.contentPolicy,
  },
  "/accessibility": {
    Page: Accessibility,
    metadata: accessibilityModule.metadata,
    label: SHELL_COPY.legal.accessibility,
  },
  "/credits": {
    Page: Credits,
    metadata: creditsModule.metadata,
    label: SHELL_COPY.legal.credits,
  },
};

function renderPage(path: LegalPath) {
  const { Page } = ROUTES[path];
  return renderWithUser(<Page />);
}

/** The visible text of the page's article, whitespace collapsed. */
function pageText(container: HTMLElement): string {
  return (container.querySelector("article")?.textContent ?? "").replace(
    /\s+/g,
    " ",
  );
}

describe("every trust page", () => {
  it.each(LEGAL_PATHS.map((path) => [path]))(
    "AC-LGL-01 %s shows its title as its one h1, under a title of its own, indexable at its canonical address",
    (path) => {
      const { metadata, label } = ROUTES[path];
      renderPage(path);
      const [h1, ...others] = screen.getAllByRole("heading", { level: 1 });
      expect(others).toEqual([]);
      expect(h1).toHaveTextContent(label);
      expect(titleText(metadata.title)).toBe(label);
      // The trust pages are for search engines (ARCHITECTURE §10.1).
      expect(isNoindex(metadata)).toBe(false);
      expect(metadata.alternates?.canonical).toBe(path);
      // No placeholder left behind (R1-02's stub copy).
      expect(screen.queryByText(SHELL_COPY.notReady)).toBeNull();
    },
  );

  it("R1-09 gives each trust page a title of its own, for the route announcer", () => {
    const titles = LEGAL_PATHS.map((path) =>
      titleText(ROUTES[path].metadata.title),
    );
    expect(new Set(titles).size).toBe(LEGAL_PATHS.length);
  });

  it.each(LEGAL_PATHS.map((path) => [path]))(
    "DESIGN §12.40 %s says when it was last updated, in words, with a machine-readable date",
    (path) => {
      const { container } = renderPage(path);
      const time = container.querySelector("article header time");
      expect(time?.getAttribute("dateTime")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(time?.parentElement).toHaveTextContent(
        /^Last updated \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/,
      );
    },
  );

  it.each(LEGAL_PATHS.map((path) => [path]))(
    "DESIGN §12.40 %s has a table of contents whose links reach every section heading, in order",
    (path) => {
      const { container } = renderPage(path);
      const toc = screen.getByRole("navigation", { name: "On this page" });
      const targets = within(toc)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
      const headings = [...container.querySelectorAll("article h2")].map(
        (heading) => `#${heading.id}`,
      );
      expect(targets).toEqual(headings);
      expect(new Set(headings).size).toBe(headings.length);
      for (const heading of headings) {
        // Prefixed with the page, so no hidden route shares an anchor.
        expect(heading.startsWith(`#${path.slice(1)}-`)).toBe(true);
      }
    },
  );

  it.each(LEGAL_PATHS.map((path) => [path]))(
    "%s ends with the footer's links to all seven trust pages, itself marked as the current page",
    (path) => {
      renderPage(path);
      const footer = screen.getByRole("navigation", {
        name: SHELL_COPY.footerNav,
      });
      const links = within(footer).getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        ...LEGAL_PATHS,
      ]);
      const current = links.filter(
        (link) => link.getAttribute("aria-current") === "page",
      );
      expect(current.map((link) => link.getAttribute("href"))).toEqual([path]);
    },
  );

  it.each(LEGAL_PATHS.map((path) => [path]))(
    "AC-LGL-02 %s never claims stored sources",
    (path) => {
      const { container } = renderPage(path);
      expect(pageText(container)).not.toMatch(/stored sources/i);
    },
  );
});

describe("AC-LGL-02 the words each page must carry", () => {
  it("AC-LGL-02 /terms carries the 13+ rule for playing and the 18+ rule for sharing or hosting a quiz", () => {
    const { container } = renderPage("/terms");
    const text = pageText(container);
    expect(text).toContain("You must be 13 or older to play Knewt.");
    expect(text).toContain(
      "Sharing a quiz you made, or hosting one in a room, needs you to be 18 or older.",
    );
  });

  it("AC-LGL-02 /how-scoring-works carries the honest-play disclosure and how “% off” is measured", () => {
    const { container } = renderPage("/how-scoring-works");
    const text = pageText(container);
    expect(text).toContain(HONEST_PLAY_DISCLOSURE);
    expect(HONEST_PLAY_DISCLOSURE).toContain(
      "Nothing else happens: no penalty, no label, no ban.",
    );
    expect(text).toContain(PERCENT_OFF_EXPLANATION);
    // 2 times too high and 2 times too low both read "100% off" (§4.2.2).
    expect(text).toContain("2,500 km and 625 km are both 100% off.");
    // The bulk new-profile rule is part of the disclosure (PRD §3.14).
    expect(text).toContain(
      "runs from brand-new profiles created in bulk from one network, which join the crowd's numbers once the profile is a day old or has finished a second Daily",
    );
  });

  it("AC-LGL-02 /about-our-questions carries CONTENT_GUIDE's sentence and says questions are drafted with AI assistance", () => {
    const { container } = renderPage("/about-our-questions");
    const text = pageText(container);
    expect(text).toContain(
      "Each one is accepted only after two independent checks, and any fact that is uncertain or easy to get wrong is checked against published data or sources.",
    );
    expect(text).toContain("Questions are drafted with AI assistance.");
    expect(QUESTIONS_PROMISE).toBe(
      "Questions are drafted with AI assistance. Each one is accepted only after two independent checks, and any fact that is uncertain or easy to get wrong is checked against published data or sources.",
    );
    // The honest account the tech lead asked for: the second check on a
    // different model where we can choose one (no check record names its
    // model yet, CONTENT_GUIDE §0.2), an editor, tiebreaks with evidence,
    // the audits, and how to report.
    expect(text).toContain(
      "Wherever we can choose the model, the second check runs on a different AI model from the writer and the first check",
    );
    // Decisions memo §18: a risky fact no dataset covered could pass on
    // both checkers' certain knowledge once the searches ran out, and the
    // page says so rather than letting the lede overstate it.
    expect(text).toContain(
      "When no dataset covers a fact that is easy to get wrong and our web searches have run out, the fact can still pass if both checkers, working separately, are certain of it.",
    );
    expect(text).not.toMatch(/leave out anything that can change/);
    expect(text).toContain("carry a review date");
    expect(text).toMatch(/An editor reads the question and both checks/);
    expect(text).toMatch(/a third check settles it with published data/);
    expect(text).toMatch(/Before launch, and every month after, an auditor/);
    expect(text).toContain("Report a problem");
  });

  it("AC-LGL-02 /credits names every source in the shipped answer lists' provenance", () => {
    const manifest = JSON.parse(
      readFileSync(
        join(process.cwd(), "content/datasets/manifest.json"),
        "utf8",
      ),
    ) as { datasets: { key: string; title: string; sourceLabel: string }[] };
    const dir = join(process.cwd(), "content/answer-lists");
    const { container } = renderPage("/credits");
    const text = pageText(container);
    const rows = new Map(
      [...container.querySelectorAll("#credits-answer-lists ~ dl > div")].map(
        (row) => [
          row.querySelector("dt")?.textContent ?? "",
          row.textContent ?? "",
        ],
      ),
    );

    const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const list = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        type: string;
        provenance: { source: string }[];
      };
      const row = rows.get(LIST_NAMES[list.type] ?? list.type);
      expect(row, `a row for the ${list.type} list`).toBeDefined();
      for (const { source } of list.provenance) {
        const refs = [
          ...source.matchAll(/([a-z0-9]+(?:-[a-z0-9]+)*)@[0-9A-Za-z.+-]+/g),
        ].map((match) => match[1]);
        for (const key of refs) {
          const dataset = manifest.datasets.find((entry) => entry.key === key);
          expect(dataset, `${file} names ${key}`).toBeDefined();
          if (dataset === undefined) continue;
          // Named in the list's own row, and credited with its licence below.
          expect(row).toContain(dataset.sourceLabel);
          expect(text).toContain(dataset.title);
        }
        const datasetOnly =
          refs.length === 1 && /^[a-z0-9-]+@\S+$/.test(source.trim());
        if (!datasetOnly) {
          // A batch written by the content team, in its own words.
          expect(row).toContain("Compiled by our content team");
        }
      }
    }
  });

  it("AC-LGL-02 /credits credits Wikidata where a dataset supplied its ids", () => {
    const { container } = renderPage("/credits");
    expect(pageText(container)).toMatch(
      /carry their Wikidata identifiers, which came with the datasets above\. Wikidata's data is available under CC0/,
    );
  });
});

describe("/how-scoring-works", () => {
  it("PRD §3.1.3 carries the Daily's own How to play text, its five parts one level under the section heading", () => {
    const { container } = renderPage("/how-scoring-works");
    const section = container.querySelector("#how-scoring-works-how-to-play")
      ?.parentElement as HTMLElement;
    expect(section).not.toBeNull();
    const parts = within(section).getAllByRole("heading", { level: 3 });
    expect(parts.map((part) => part.textContent)).toEqual(
      HOW_TO_PLAY.parts.map((part) => part.heading),
    );
    for (const part of HOW_TO_PLAY.parts) {
      for (const line of part.body) {
        expect(within(section).getByText(line)).toBeVisible();
      }
    }
  });
});
