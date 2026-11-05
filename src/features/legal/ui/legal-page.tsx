/**
 * A legal or trust page (DESIGN §12.40): in the `(info)` layout's 640 px
 * reading column, the title in `display-2`, a "Last updated" line, the
 * lede, a short table of contents, then each section under a `display-6`
 * head in `body` text, and the footer's links to the other trust pages,
 * this one marked. A server component with no client code: the pages are
 * HTML, not JavaScript (ARCHITECTURE §10.9).
 *
 * One `h1` per page, then `h2` per section and `h3` inside long ones, so
 * the title stays the largest heading at any text size (R1-34). Anchors
 * are prefixed with the page (`sectionAnchor`), so they stay unique among
 * the routes Next keeps hidden in the document.
 */
import type { ReactNode } from "react";

import { SiteFooter } from "@/features/shell";
import { cx } from "@/ui/cx";

import { LEGAL_COPY, formatUpdated } from "../copy";
import {
  pageSlug,
  sectionAnchor,
  type Block,
  type LegalDocument,
  type LicenceText,
  type TermItem,
} from "../document";
import { LINK_CLASSES, RichText } from "./rich-text";

/** Components a document places by name (`{ kind: "slot" }`). */
export type LegalSlots = Readonly<Record<string, ReactNode>>;

function Licence({ licence }: { licence: LicenceText }) {
  return (
    <details className="border-t border-rule">
      <summary className="min-h-11 cursor-pointer py-2.5 text-body-sm font-bold">
        {licence.summary}
      </summary>
      <pre className="pb-3 text-[0.8125rem] leading-snug wrap-anywhere whitespace-pre-wrap text-ink-2">
        {licence.text}
      </pre>
    </details>
  );
}

function Term({ item }: { item: TermItem }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-bold wrap-anywhere">
        <RichText text={item.term} />
      </dt>
      {item.details.map((detail) => (
        <dd key={detail} className="wrap-anywhere">
          <RichText text={detail} />
        </dd>
      ))}
      {item.licence === undefined ? null : (
        <dd>
          <Licence licence={item.licence} />
        </dd>
      )}
    </div>
  );
}

function BlockView({ block, slots }: { block: Block; slots: LegalSlots }) {
  switch (block.kind) {
    case "p":
      return (
        <p>
          <RichText text={block.text} />
        </p>
      );
    case "list": {
      const List = block.ordered === true ? "ol" : "ul";
      return (
        <List
          className={cx(
            "flex flex-col gap-2 marker:text-ink-3",
            block.ordered === true ? "list-decimal pl-6" : "list-disc pl-5",
          )}
        >
          {block.items.map((item) => (
            <li key={item} className="pl-1 wrap-anywhere">
              <RichText text={item} />
            </li>
          ))}
        </List>
      );
    }
    case "terms":
      return (
        <dl className="flex flex-col gap-4">
          {block.items.map((item) => (
            <Term key={item.term} item={item} />
          ))}
        </dl>
      );
    case "subhead":
      return <h3 className="pt-2 text-body font-bold">{block.text}</h3>;
    case "licence":
      return <Licence licence={block} />;
    case "slot": {
      const slot = slots[block.name];
      if (slot === undefined) {
        throw new Error(`No component given for the "${block.name}" slot`);
      }
      return <>{slot}</>;
    }
  }
}

export function LegalPage({
  document,
  slots = {},
}: {
  document: LegalDocument;
  slots?: LegalSlots;
}) {
  const slug = pageSlug(document.path);
  const tocId = `${slug}-toc`;
  return (
    <>
      <article data-legal-page={slug} className="flex flex-col gap-8 py-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-display-2">{document.title}</h1>
          <p className="text-meta text-ink-3">
            {LEGAL_COPY.lastUpdated}{" "}
            <time dateTime={document.updated}>
              {formatUpdated(document.updated)}
            </time>
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {document.lede.map((line) => (
            <p key={line}>
              <RichText text={line} />
            </p>
          ))}
        </div>

        <nav aria-labelledby={tocId} className="flex flex-col gap-1">
          <p id={tocId} className="text-meta text-ink-3">
            {LEGAL_COPY.onThisPage}
          </p>
          <ol className="flex flex-wrap gap-x-4">
            {document.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${sectionAnchor(document.path, section.id)}`}
                  className={cx(
                    "inline-flex min-h-11 items-center text-body-sm",
                    LINK_CLASSES,
                  )}
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {document.sections.map((section) => (
          <section key={section.id} className="flex flex-col gap-3">
            <h2
              id={sectionAnchor(document.path, section.id)}
              className="font-display text-display-6"
            >
              {section.heading}
            </h2>
            {section.blocks.map((block, index) => (
              <BlockView key={index} block={block} slots={slots} />
            ))}
          </section>
        ))}
      </article>
      <SiteFooter current={document.path} />
    </>
  );
}
