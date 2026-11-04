/**
 * The footer on Today and Me (DESIGN §6.13, PRD §6.1): the seven legal and
 * trust pages as 44 px links. Each opens a page in the (info) group, a
 * placeholder until LGL-1 writes it and touches this file. They prefetch
 * once they scroll into view, like every link to a page that exists, so a
 * page's title arrives with it for the route announcer (R1-09).
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
              <Link href={link.href as Route}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
