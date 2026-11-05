/**
 * Draws one line of a legal page's text (`../document.ts`): plain words
 * with `[label](href)` links, `**strong**` and `` `code` ``. A path on
 * this site becomes a Next `<Link>`; an anchor, `https:` or `mailto:` a
 * plain `<a>`. Nothing else is interpreted, so the text can never inject
 * markup.
 */
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/** Inline link text: ink with an eft underline, as the footer and text buttons have it. */
export const LINK_CLASSES =
  "text-link underline decoration-link-underline decoration-2 underline-offset-3 wrap-anywhere";

const MARKS = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|`([^`]+)`/g;

function InlineLink({ href, children }: { href: string; children: string }) {
  if (href.startsWith("/")) {
    return (
      <Link href={href as Route} className={LINK_CLASSES}>
        {children}
      </Link>
    );
  }
  if (/^(#|https:\/\/|mailto:)/.test(href)) {
    return (
      <a href={href} className={LINK_CLASSES}>
        {children}
      </a>
    );
  }
  throw new Error(`A legal page links to "${href}", which isn't allowed`);
}

/** The text's parts, marks drawn. Exported for tests. */
export function renderMarks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKS)) {
    const index = match.index;
    if (index > last) parts.push(text.slice(last, index));
    const [whole, label, href, strong, code] = match;
    if (label !== undefined && href !== undefined) {
      parts.push(
        <InlineLink key={index} href={href}>
          {label}
        </InlineLink>,
      );
    } else if (strong !== undefined) {
      parts.push(<strong key={index}>{strong}</strong>);
    } else if (code !== undefined) {
      parts.push(
        <code key={index} className="text-[0.92em] wrap-anywhere">
          {code}
        </code>,
      );
    }
    last = index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function RichText({ text }: { text: string }) {
  return <>{renderMarks(text)}</>;
}
