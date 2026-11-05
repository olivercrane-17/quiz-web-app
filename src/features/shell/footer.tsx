/**
 * The footer (DESIGN §6.13, PRD §6.1): the seven legal and trust pages
 * (LGL-1, PRD §3.14) as 44 px links, on Today and at the foot of each
 * trust page, where `current` marks the page you're on (`aria-current`),
 * so the links lead from one trust page to the next. The mark is bold
 * with no underline as well as ink, never colour alone (DESIGN §11), so
 * it survives forced colours, where every link turns LinkText; the
 * utilities beat `.kn-footer a` in the components layer. Me and Settings
 * render it too once STA-1 and SET-1 build them. They prefetch once they
 * scroll into view, like every link to a page that exists, so a page's
 * title arrives with it for the route announcer (R1-09).
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

export function SiteFooter({
  current,
}: {
  /** The trust page this footer sits on, marked as the current page. */
  current?: string;
} = {}) {
  return (
    <footer className="kn-footer">
      <nav aria-label={SHELL_COPY.footerNav}>
        <ul>
          {LEGAL_LINKS.map((link) => {
            const here = link.href === current;
            return (
              <li key={link.href}>
                <Link
                  href={link.href as Route}
                  aria-current={here ? "page" : undefined}
                  className={
                    here ? "font-bold text-ink no-underline" : undefined
                  }
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </footer>
  );
}
