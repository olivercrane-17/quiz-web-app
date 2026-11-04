/**
 * The footer on Today and Me (DESIGN §6.13, PRD §6.1): the seven legal and
 * trust pages as 44 px links. LGL-1 builds the pages and touches this file;
 * the links don't prefetch until then, because a prefetch of a missing
 * route logs a 404 in the console.
 */
import type { Route } from "next";
import Link from "next/link";

import { SHELL_COPY } from "./copy";

export const LEGAL_LINKS: readonly { href: string; label: string }[] = [
  { href: "/how-scoring-works", label: SHELL_COPY.legal.howScoringWorks },
  { href: "/about-our-questions", label: SHELL_COPY.legal.aboutOurQuestions },
  { href: "/privacy", label: SHELL_COPY.legal.privacy },
  { href: "/terms", label: SHELL_COPY.legal.terms },
  { href: "/content-policy", label: SHELL_COPY.legal.contentPolicy },
  { href: "/accessibility", label: SHELL_COPY.legal.accessibility },
  { href: "/credits", label: SHELL_COPY.legal.credits },
];

export function SiteFooter() {
  return (
    <footer className="kn-footer">
      <nav aria-label={SHELL_COPY.footerNav}>
        <ul>
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href as Route} prefetch={false}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
