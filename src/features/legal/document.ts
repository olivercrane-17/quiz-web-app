/**
 * The shape of a legal or trust page (PRD §3.14, DESIGN §12.40): a title,
 * the date it was last updated, a short lede, and sections, each a
 * `display-6` heading over blocks of text. The pages are data, written in
 * `./documents/`, so the words sit together where the design team and the
 * copy tests can read them, and one view (`./ui/legal-page.tsx`) draws
 * them all the same way.
 *
 * Text is plain words with three marks, and nothing else:
 * `[label](href)` for a link (a path on this site, `#anchor`, `https:` or
 * `mailto:`), `**strong**`, and `` `code` `` for a storage key or a file
 * name. Licence texts are the one exception: they are shown exactly as
 * their authors wrote them.
 */
import { parseLocalDate, type LocalDate } from "@/engine/types";

/** The seven pages, in the footer's order (DESIGN §6.13). */
export const LEGAL_PATHS = [
  "/how-scoring-works",
  "/about-our-questions",
  "/privacy",
  "/terms",
  "/content-policy",
  "/accessibility",
  "/credits",
] as const;
export type LegalPath = (typeof LEGAL_PATHS)[number];

/** Words with links, strong text and code marks (see above). */
export type Inline = string;

export interface LicenceText {
  /** The disclosure's label: "Read the SIL Open Font License". */
  readonly summary: string;
  /** Shown as written. */
  readonly text: string;
}

export interface TermItem {
  readonly term: Inline;
  readonly details: readonly Inline[];
  readonly licence?: LicenceText;
}

export type Block =
  | { readonly kind: "p"; readonly text: Inline }
  | {
      readonly kind: "list";
      readonly items: readonly Inline[];
      readonly ordered?: boolean;
    }
  | { readonly kind: "terms"; readonly items: readonly TermItem[] }
  /** A heading one level under the section's, for long sections. */
  | { readonly kind: "subhead"; readonly text: string }
  | ({ readonly kind: "licence" } & LicenceText)
  /** A component the route passes in by name, such as How to play. */
  | { readonly kind: "slot"; readonly name: string };

export interface LegalSection {
  /** Unique on its page; the anchor is `<page>-<id>` (`sectionAnchor`). */
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly Block[];
}

export interface LegalDocument {
  readonly path: LegalPath;
  readonly title: string;
  /** The "Last updated" date. Bump it with every change of meaning. */
  readonly updated: LocalDate;
  readonly lede: readonly Inline[];
  readonly sections: readonly LegalSection[];
}

/** A page's "Last updated" date, written `YYYY-MM-DD`. */
export function legalDate(iso: string): LocalDate {
  const date = parseLocalDate(iso);
  if (date === null) throw new Error(`"${iso}" is not a calendar date`);
  return date;
}

/** `/privacy` gives `privacy`. */
export function pageSlug(path: LegalPath): string {
  return path.slice(1);
}

/**
 * A section's anchor: the page's slug, then the section's id. Next keeps
 * up to three visited routes in the document, hidden, so two pages that
 * both had a `contact` section would give a `#contact` link two targets;
 * prefixed, every anchor is unique across the trust pages.
 */
export function sectionAnchor(path: LegalPath, id: string): string {
  return `${pageSlug(path)}-${id}`;
}

/** A link to a section of a trust page, for `[label](...)` marks. */
export function sectionHref(path: LegalPath, id: string): string {
  return `${path}#${sectionAnchor(path, id)}`;
}
