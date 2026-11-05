/**
 * `/content-policy` (PRD §3.14, §3.9.5, §3.13): what isn't allowed in
 * quizzes, Group names and nicknames; how to report; what happens next,
 * with the response times we aim for (a first review within 72 hours,
 * Daily items within 12); and the takedown contact. The report flow it
 * describes is RPT-1's sheet and EDT-3's quiz reports; the filter's words
 * are PRD §3.7.3's and §3.9.4's.
 */
import type { FeatureFlag } from "@/config/features";
import { SHELL_COPY } from "@/features/shell";

import { CONTACT_EMAIL, CONTACT_LINK } from "../copy";
import { legalDate, sectionHref, type LegalDocument } from "../document";

/** The first review of any report, and of a report on a Daily item (PRD §3.14). */
export const REVIEW_TARGET_HOURS = { any: 72, daily: 12 } as const;

export function contentPolicyDocument(
  flags: (flag: FeatureFlag) => boolean,
): LegalDocument {
  const editor = flags("editor");
  const rooms = flags("rooms");
  const takedown = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}?subject=Takedown%20request)`;

  return {
    path: "/content-policy",
    title: SHELL_COPY.legal.contentPolicy,
    updated: legalDate("2026-11-05"),
    lede: [
      `We write the questions in Knewt. Players write a few things too: ${editor ? "Group names, nicknames, display names and the quizzes they share" : "Group names and nicknames"}. This page says what isn't allowed in them, and what happens when you report something.`,
    ],
    sections: [
      {
        id: "scope",
        heading: "Where it applies",
        blocks: [
          {
            kind: "list",
            items: [
              "Group names, which every member sees.",
              `Nicknames in a Group, and display names on challenges${rooms ? " and in rooms" : ""}.`,
              ...(editor
                ? [
                    "Quizzes you share or host (Beta): every title, question, answer and explanation in them.",
                  ]
                : []),
              "Notes on reports. Only we read them, but the same rules apply.",
            ],
          },
          ...(editor
            ? []
            : [
                {
                  kind: "p" as const,
                  text: "Sharing quizzes you make is coming later, as a Beta feature. This policy will cover them too.",
                },
              ]),
        ],
      },
      {
        id: "not-allowed",
        heading: "What isn't allowed",
        blocks: [
          { kind: "p", text: "Nothing that:" },
          {
            kind: "list",
            items: [
              "attacks or demeans people for who they are, such as their race, ethnicity, nationality, religion, disability, sex, gender identity or sexual orientation;",
              "harasses or threatens anyone, or urges others to;",
              "shares someone's personal information, such as a home address, phone number, email address or private photo;",
              "is sexual. Anything that sexualises a child is removed and reported to the authorities;",
              "praises violence or terrorism, or encourages self-harm;",
              "is spam or a scam, or links to one;",
              "pretends to be someone else, Knewt included;",
              "breaks the law or someone else's rights, such as copying another person's quiz without permission.",
            ],
          },
          {
            kind: "p",
            text: "Everything else is fair game, and an in-joke at nobody's expense is very welcome.",
          },
          {
            kind: "p",
            text: `Every name${editor ? " and every field of a quiz" : ""} goes through a word filter before it's saved. When it catches something, you'll see "Please choose a different name."${editor ? ' (in a quiz, "Please choose different wording.")' : ""} No filter catches everything, so reports matter. Players aged 13 to 17 pick from generated names rather than typing their own.`,
          },
        ],
      },
      {
        id: "report",
        heading: "How to report",
        blocks: [
          {
            kind: "terms",
            items: [
              {
                term: "A question of ours",
                details: [
                  "Use **Report a problem** on its reveal or explanation. Pick what's wrong (wrong answer, ambiguous, out of date, offensive, or a typo) and add a note if you like. On a Mystery you can also tell us your guess should have counted.",
                ],
              },
              ...(editor
                ? [
                    {
                      term: "A shared quiz (Beta)",
                      details: [
                        "Use **Report**. It's on every screen of a shared quiz.",
                      ],
                    },
                  ]
                : []),
              {
                term: "A Group name or a nickname",
                details: [
                  "The Group's admin can rename the Group and remove members. If that doesn't settle it, email us.",
                ],
              },
              {
                term: "Anything else, or a takedown request",
                details: [
                  `Email ${takedown} with a link to the page or quiz, or a description of where you saw the problem, and why it should come down.`,
                ],
              },
            ],
          },
        ],
      },
      {
        id: "next",
        heading: "What happens next",
        blocks: [
          {
            kind: "list",
            items: [
              `We read every report. We aim to give each one a first review within ${REVIEW_TARGET_HOURS.any} hours, and reports about a Daily question within ${REVIEW_TARGET_HOURS.daily} hours, because everyone plays the same Daily.`,
              ...(editor
                ? [
                    'A shared quiz that collects enough reports is hidden straight away while we look ("This quiz is being reviewed."). Reports from brand-new profiles count for less, so a few fresh profiles can\'t hide a quiz on their own.',
                  ]
                : []),
              "A practice question with enough reports comes out of play until we've checked it.",
              `When a report says one of our answers is wrong, a fresh fact-check looks at the claim again with published sources. If we got it wrong, we fix it and correct everyone's scores, as [How scoring works](${sectionHref("/how-scoring-works", "corrections")}) explains.`,
              "Content that breaks this policy is removed, and we may restrict a profile that keeps breaking it.",
            ],
          },
        ],
      },
      ...(editor
        ? [
            {
              id: "creators",
              heading: "If you make quizzes",
              blocks: [
                {
                  kind: "list" as const,
                  items: [
                    "Sharing quizzes is for players aged 18 and over.",
                    "You can unshare a quiz at any time, which stops its link working at once, or delete it.",
                    'If your quiz is hidden while we look into reports, your quizzes page says "Hidden while we review reports".',
                  ],
                },
              ],
            },
          ]
        : []),
      {
        id: "contact",
        heading: "Contact",
        blocks: [
          {
            kind: "p",
            text: `Takedown requests and questions about this policy: ${CONTACT_LINK}.`,
          },
        ],
      },
    ],
  };
}
