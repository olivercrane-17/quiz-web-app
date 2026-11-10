/**
 * `/terms` (PRD §3.14): who may play (13 and over) and who may share or
 * host a quiz they made (18 and over); acceptable use; the licence quiz
 * creators give us to host and show their quizzes; honest play; no
 * warranty; how the terms change. Sensible defaults without legal review
 * (decisions memo §7, §10); the review flag lives in the launch report,
 * not on the page.
 *
 * "Our content" matches the licence the repository grants: LICENSE and
 * package.json are MIT with no carve-out, and the repository (public,
 * ARCHITECTURE D10) commits the practice items and packs, so the terms
 * can't claim them or forbid copying them. Only the sealed Daily content
 * stays unpublished. Whether content/ and public/content/ keep MIT or get
 * a licence of their own is the owner's call (launch report).
 *
 * Sections about what isn't built yet are marked "coming later" (RITE
 * round 3, R3-06): quiz-making and rooms, until their flags are on, and
 * deleting your data in Settings, until SET-1 builds Settings. Round 3's
 * Lena read the Terms as covering features she couldn't find. Streaks,
 * challenge links and the crowd's numbers follow their switches in
 * `./shipped` the same way. The 13+ and 18+ rules stay word for word
 * (AC-LGL-02).
 */
import type { FeatureFlag } from "@/config/features";
import { SHELL_COPY } from "@/features/shell";

import { CONTACT_LINK } from "../copy";
import { legalDate, sectionHref, type LegalDocument } from "../document";
import { SHIPPED_FEATURES, type ShippedFeatures } from "./shipped";

/** A section about something not built yet says so in its heading (R3-06). */
const COMING_LATER = "(coming later)";

export function termsDocument(
  flags: (flag: FeatureFlag) => boolean,
  built: Partial<ShippedFeatures> = {},
): LegalDocument {
  const shipped = { ...SHIPPED_FEATURES, ...built };
  const editor = flags("editor");
  const rooms = flags("rooms");

  return {
    path: "/terms",
    title: SHELL_COPY.legal.terms,
    updated: legalDate("2026-11-10"),
    lede: [
      "Knewt is a free daily trivia game. These terms say what you can expect from us and what we ask of you. By playing, you agree to them.",
    ],
    sections: [
      {
        id: "age",
        heading: "Who can play",
        blocks: [
          {
            kind: "list",
            items: [
              "You must be 13 or older to play Knewt.",
              editor || rooms
                ? "Sharing a quiz you made, or hosting one in a room, needs you to be 18 or older."
                : "Sharing a quiz you made, or hosting one in a room, needs you to be 18 or older. Both are coming later.",
              "We ask your age band when it first matters, and we take your word for it. If you tell us you're under 13, we delete the profile and stop collecting anything from that device, as our [privacy page](/privacy) explains.",
            ],
          },
        ],
      },
      {
        id: "profile",
        heading: "Your profile",
        blocks: [
          {
            kind: "p",
            text: "There are no accounts. Your profile is a random player id and secret kept in your browser, backed up by a cookie and, if you make one, a sync code.",
          },
          {
            kind: "p",
            text: "Keep your sync code private: anyone who has it can play as you. We don't know who you are, so if you lose your device and never saved a code, we can't hand your profile back.",
          },
        ],
      },
      {
        id: "fair-play",
        heading: "Playing fair",
        blocks: [
          {
            kind: "p",
            text: `Solo play runs on the honour system, and we never treat a looked-up answer as cheating. ${shipped.crowdNumbers ? "Some runs stay out of the crowd's numbers" : "Some runs will stay out of the crowd's numbers, which are coming later"}, as [How scoring works](${sectionHref("/how-scoring-works", "honest-play")}) explains, and nothing else happens to them.`,
          },
          {
            kind: "p",
            text: "What isn't allowed is attacking the game: playing with bots or scripts, flooding our servers, making profiles in bulk to move the crowd's numbers, or trying to read answers before you've earned them.",
          },
        ],
      },
      {
        id: "acceptable-use",
        heading: "Acceptable use",
        blocks: [
          { kind: "p", text: "Please don't use Knewt to:" },
          {
            kind: "list",
            items: [
              "break the law, or help someone else break it;",
              "harass or threaten anyone, or share someone's personal information;",
              "post anything our [content policy](/content-policy) rules out, in a name or in a quiz;",
              "break into another player's profile or our systems, or get in their way;",
              "scrape the app or flood it with automated requests.",
            ],
          },
          {
            kind: "p",
            text: "When these terms are broken, we may remove content or limit what a profile can do, and we block traffic that attacks the service.",
          },
        ],
      },
      {
        id: "quizzes",
        heading: editor
          ? "Quizzes you make"
          : `Quizzes you make ${COMING_LATER}`,
        blocks: [
          ...(editor
            ? []
            : [
                {
                  kind: "p" as const,
                  text: "Making and sharing quizzes is coming later, as a Beta feature. When it opens, these rules apply.",
                },
              ]),
          {
            kind: "p",
            text: "Your quizzes stay yours. When you save one to our server or share it (by link or in a room), you give us permission to store it, copy it, show it and serve it to the people you share it with and to the players in your rooms, worldwide and free of charge, for as long as it stays saved. We may also check it against our content policy. The permission ends when you delete the quiz.",
          },
          {
            kind: "p",
            text: "You confirm that you have the right to share what's in your quiz, and that it follows our [content policy](/content-policy). Anyone with your link can play it, so don't put anything in it you wouldn't want strangers to read.",
          },
          {
            kind: "p",
            text: "We may hide or remove a quiz after reports, or if it breaks these terms. You can unshare or delete your quizzes at any time.",
          },
        ],
      },
      {
        id: "our-content",
        heading: "Our content",
        blocks: [
          {
            kind: "p",
            text: `Knewt's code and the practice questions in its public repository are open source under the MIT License. The Daily puzzles are ours, as are Knewt's name and the newt. ${shipped.challenges ? "Share your results and challenge links anywhere you like." : "Share your results anywhere you like."}`,
          },
          {
            kind: "p",
            text: "The fonts, icons, datasets and open-source software we use belong to their owners, under the licences on our [credits page](/credits).",
          },
        ],
      },
      {
        id: "free",
        heading: "Free to play",
        blocks: [
          {
            kind: "p",
            text: "Knewt is free, with no ads and nothing to buy, and the Daily will always be free. If we ever offer something paid, it will be optional, and we'll update these terms first.",
          },
        ],
      },
      {
        id: "service",
        heading: "Changes to Knewt",
        blocks: [
          {
            kind: "p",
            text: "Knewt keeps changing as we improve it. Beta features in particular may change a lot, or go away.",
          },
          {
            kind: "p",
            text: `We work hard to keep the Daily running, but we can't promise it will always be available.${shipped.streaks ? " If a problem on our side stops you playing, that day is covered for everyone, so your streak is safe." : ""}`,
          },
        ],
      },
      {
        id: "warranty",
        heading: "No warranty",
        blocks: [
          {
            kind: "p",
            text: "We check our questions carefully and fix mistakes you report, but Knewt comes as it is, without warranties of any kind, to the extent the law allows.",
          },
          {
            kind: "p",
            text: `To the extent the law allows, we aren't liable for indirect or consequential losses, or for ${shipped.streaks ? "lost streaks or progress" : "lost progress"}. Nothing in these terms limits rights that consumer law gives you and that can't be limited.`,
          },
        ],
      },
      {
        id: "ending",
        heading: "Stopping",
        blocks: [
          {
            kind: "p",
            text: shipped.settings
              ? "You can stop playing at any time, and delete your data in Settings. We may suspend a profile that seriously or repeatedly breaks these terms."
              : "You can stop playing at any time. Deleting your data from Settings is coming later. We may suspend a profile that seriously or repeatedly breaks these terms.",
          },
        ],
      },
      {
        id: "changes",
        heading: "Changes to these terms",
        blocks: [
          {
            kind: "p",
            text: "We'll post any change here with a new date. If a change matters, we'll tell you in the app before it takes effect. Playing after that means you accept the new terms.",
          },
          {
            kind: "p",
            text: `Questions about these terms? Email ${CONTACT_LINK}.`,
          },
        ],
      },
    ],
  };
}
