/**
 * `/privacy` (PRD §3.14, §8.3): what we keep and where, what stays on the
 * device, what we never collect, how long things last, and how to take or
 * delete it all. It matches what the app stores: the guest identity
 * (ARCHITECTURE §9), the backup cookie (`BACKUP_COOKIE_NAME`), the
 * local-storage keys of `src/platform/storage/schema.ts` (a test checks
 * that every key there is described here), first-party analytics into our
 * own database, and no third-party tracker or ad. Beta and Should features
 * add their lines only when their flag is on, so the page describes the
 * build it ships in.
 *
 * The server's side follows the schema (ARCHITECTURE §8.3, §8.4, §8.12 and
 * supabase/migrations/20261104000400_identity.sql): a player's zone, first
 * browser contexts and devices; each attempt's zone, context, app version,
 * hidden time and honest-play flags; practice kept only as a bitset of
 * answered items for 180 days, the answers themselves folded into
 * anonymous counts. Download my data says what `export_json` holds today:
 * reports, hearts, the practice bitset and events have no export hook yet
 * (a follow-up for SQL-9 and SQL-10, so AC-DAT-01 can hold).
 */
import type { FeatureFlag } from "@/config/features";
import { TUNABLES } from "@/config/tunables";
import { BACKUP_COOKIE_NAME } from "@/platform/identity/cookie";

import { CONTACT_LINK } from "../copy";
import { legalDate, sectionHref, type LegalDocument } from "../document";
import { SHELL_COPY } from "@/features/shell";

/** One line of the storage list: the key as code, then what it holds. */
export interface StorageLine {
  /** Keys as the schema names them; a family ends with `:` (`qz:runs:`). */
  readonly keys: readonly string[];
  readonly text: string;
  /** Present only when this flag is on. */
  readonly flag?: FeatureFlag;
}

/** Local storage, in the order the page lists it (ARCHITECTURE §6.2). */
export const LOCAL_STORAGE_LINES: readonly StorageLine[] = [
  { keys: ["qz:identity"], text: "your player id and secret." },
  {
    keys: ["qz:profile"],
    text: "a copy of your names and age band, so they show offline.",
  },
  {
    keys: ["qz:sync"],
    text: "your sync code, if you've made one, so you can find it again.",
  },
  { keys: ["qz:settings"], text: "your settings." },
  {
    keys: ["qz:practice"],
    text: "which practice questions you've seen, and your best scores.",
  },
  { keys: ["qz:history"], text: "your last 100 practice rounds." },
  {
    keys: ["qz:runs:"],
    text: "a practice round you haven't finished, so you can carry on later.",
  },
  {
    keys: ["qz:review"],
    text: "practice questions you missed, saved to come back to.",
    flag: "review",
  },
  {
    keys: ["qz:mastery"],
    text: "your first-try results in each category, for mastery tiers.",
    flag: "mastery",
  },
  {
    keys: ["qz:cache:daily", "qz:cache:groups", "qz:cache:challenges"],
    text: "copies of what our server last sent you (your Daily, streak and stats, your Groups and your challenges), so they show offline.",
  },
  {
    keys: ["qz:denylist"],
    text: "the practice questions we've taken out for review, so practice skips them.",
  },
  {
    keys: ["qz:outbox"],
    text: "analytics events, reports, hearts and practice answers waiting to be sent.",
  },
  { keys: ["qz:offers"], text: "which tips and offers you've already seen." },
  {
    keys: ["qz:drafts:"],
    text: "quizzes you're writing, until you save them (Beta).",
    flag: "editor",
  },
  {
    keys: ["qz:seats:", "qz:host:"],
    text: "your seat in a room, or the key to a room you started (Beta). Each goes after 24 hours.",
    flag: "rooms",
  },
  {
    keys: ["qz:under13"],
    text: "set only if someone said they're under 13 on this device. It stops the app sending anything.",
  },
  { keys: ["qz:meta"], text: "the version of this storage, for updates." },
  {
    keys: ["qz:quarantine:"],
    text: "a damaged value, set aside so the rest keeps working.",
  },
];

/** Session storage: gone when the tab closes. */
export const SESSION_STORAGE_LINES: readonly StorageLine[] = [
  {
    keys: ["qz:session"],
    text: "a random id for this tab, sent with analytics events.",
  },
  {
    keys: ["qz:practice-intent"],
    text: "the practice round you just picked.",
  },
  {
    keys: ["qz:practice-run"],
    text: "the practice round this tab is playing, so a reload carries on with it.",
  },
  {
    keys: ["qz:server-clock"],
    text: "how far your device's clock is from ours.",
  },
  {
    keys: ["qz:share-origin"],
    text: "a shared result you opened, so your own result can be set beside it.",
  },
  {
    keys: ["qz:restore-notice"],
    text: "after you restore your profile, the welcome-back note Today shows once.",
  },
];

function storageItems(
  lines: readonly StorageLine[],
  flags: (flag: FeatureFlag) => boolean,
): string[] {
  return lines
    .filter((line) => line.flag === undefined || flags(line.flag))
    .map((line) => {
      const keys = line.keys
        .map((key) => `\`${key.endsWith(":") ? `${key}…` : key}\``)
        .join(", ");
      return `${keys}: ${line.text}`;
    });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function privacyDocument(
  flags: (flag: FeatureFlag) => boolean,
): LegalDocument {
  const rooms = flags("rooms");
  const editor = flags("editor");
  const lowTrustDays = TUNABLES.identity.lowTrustUntilAgeMs / DAY_MS;

  return {
    path: "/privacy",
    title: SHELL_COPY.legal.privacy,
    updated: legalDate("2026-11-05"),
    lede: [
      "Knewt works without an account. We never ask for your name, email, phone number or birthday, and the app has no ads and no trackers.",
      "This page lists what we do keep and why, where it lives, how long it stays and how you can take it with you or delete it.",
    ],
    sections: [
      {
        id: "short-version",
        heading: "The short version",
        blocks: [
          {
            kind: "list",
            items: [
              "You play as a guest. Your browser makes a random player id and a secret on your first visit. The secret first reaches our server when you play something online, such as the Daily, or report or heart a question. Until then it stays on your device, and your player id travels only with the practice answers and analytics events described below.",
              "We keep your Daily games and your stats on our server, so they survive a cleared browser and can move to a new device.",
              "There is one cookie, and its only job is to back up your profile. No analytics or advertising cookie, ever.",
              "Our own analytics count things like finished Dailies and shares. They go to our own database and nowhere else.",
              "You can download or delete your data at any time in Settings.",
            ],
          },
        ],
      },
      {
        id: "server",
        heading: "What we keep on our server",
        blocks: [
          {
            kind: "p",
            text: "When you play online, these records live in our database. Each is tied to your random player id, which says nothing about who you are.",
          },
          {
            kind: "terms",
            items: [
              {
                term: "Your player id and secret",
                details: [
                  "The id is random. The secret proves that a request comes from you, and we keep only a one-way hash of it (SHA-256), never the secret itself. Each device you restore your profile on gets its own secret, up to 10.",
                ],
              },
              {
                term: "Your Daily games",
                details: [
                  "For each Daily you play: your guesses, the clue you solved each Mystery on, your Encore number, your score and your times. With them we keep how long the tab was hidden during each round, your time zone and the kind of browser you played in, the app's version, and whether the run stays out of the crowd's numbers. We also keep your streak history (freezes and repairs included) and the totals behind your stats.",
                ],
              },
              {
                term: "Your time zone and devices",
                details: [
                  "Your device's time zone (such as Europe/London), when it last changed and the zone of the last Daily you finished, which decide your local date and which part of the world you're compared with; when you were last active; the kind of browser you first played in and first finished a Daily in (such as inside a messaging app); and when each of your devices was added and last used.",
                ],
              },
              {
                term: "Practice answers",
                details: [
                  "When you first answer a practice question, your device sends which question it was, whether you got it right, the option you chose, a rough time, the mode and whether you picked the category. We keep only a list of the questions you've answered, tied to your player id. Whether you got each one right, and the option you chose, go into anonymous counts of how hard each question is. The rest of your practice history stays on your device.",
                ],
              },
              {
                term: "Names",
                details: [
                  "The friendly name we give you (such as Plucky Otter), and any display name or Group nickname you choose.",
                ],
              },
              {
                term: "Your age band",
                details: [
                  "Only if we've asked, and we ask only when it matters, such as when you join a Group. We keep the band (13 to 17, or 18 or over), never a birth date.",
                ],
              },
              {
                term: "Groups and challenges",
                details: [
                  "The Groups you're in, with your nickname in each, and the challenges you send and play.",
                ],
              },
              ...(editor
                ? [
                    {
                      term: "Quizzes you save (Beta)",
                      details: [
                        "The quizzes you save to our server, whether each one is shared, and how often it has been played.",
                      ],
                    },
                  ]
                : []),
              ...(rooms
                ? [
                    {
                      term: "Rooms (Beta)",
                      details: [
                        "While a room runs: its players' seats and room names, and their answers. We delete a room 24 hours after it ends.",
                      ],
                    },
                  ]
                : []),
              {
                term: "Reports and hearts",
                details: [
                  "When you report a question: the question and your reason, with any note you add (we strip links out of notes). When you heart a question, that you liked it. Nobody else sees either.",
                ],
              },
              {
                term: "Your sync code and claim links",
                details: [
                  "If you make a sync code, we keep only a hash of it and when you made it. The code itself stays on your device. A link that moves your profile out of an in-app browser works the same way: we keep its hash and when it was made and used.",
                ],
              },
              {
                term: "Analytics events",
                details: [
                  "Short records of what happened in the app, such as a Daily finished or a share opened. Each one carries your player id, a random id for the browser tab, the time, the app version, the part of the app you were in and the kind of browser you use (such as Android, inside a messaging app), never its full user agent. Events never carry your IP address or anything you typed.",
                ],
              },
              {
                term: "Network addresses",
                details: [
                  `We use your IP address only to slow down abuse, such as a flood of new profiles or reports from one network. New profiles made in bulk from one network join the crowd's numbers after ${lowTrustDays === 1 ? "a day" : `${lowTrustDays} days`} or a second Daily, as [How scoring works](${sectionHref("/how-scoring-works", "honest-play")}) explains. We keep addresses only as salted hashes (an IPv6 address by its /64 block), and we delete each day's salt after 48 hours, after which no hash can be traced back to an address.`,
                ],
              },
            ],
          },
        ],
      },
      {
        id: "device",
        heading: "What stays on your device",
        blocks: [
          {
            kind: "p",
            text: `There is one cookie, \`${BACKUP_COOKIE_NAME}\`. It holds your player id and secret, so your profile survives if your browser clears the site's storage, as some browsers do after a few weeks without a visit. Our own server sets it once your profile is saved there, scripts on the page can't read it, it is sent only to this site, and it lasts 400 days, renewed at most once a week while you play. It never goes to our database or to anyone else. Delete my data removes it.`,
          },
          {
            kind: "p",
            text: "Everything else the app keeps is in your browser's own storage, under names that start with `qz:`. Most of it never leaves your device:",
          },
          { kind: "list", items: storageItems(LOCAL_STORAGE_LINES, flags) },
          {
            kind: "p",
            text: "And for as long as a tab is open, in its session storage:",
          },
          { kind: "list", items: storageItems(SESSION_STORAGE_LINES, flags) },
        ],
      },
      {
        id: "never",
        heading: "What we never collect",
        blocks: [
          {
            kind: "list",
            items: [
              "Your name, email address, phone number or birth date.",
              "Your precise location, contacts, camera or microphone. Your device's time zone is the closest we come.",
              "Advertising ids. Knewt has no ads.",
              "Anything for third parties. There are no third-party trackers, analytics tools, fonts or embeds: your browser talks only to this site and to our database.",
            ],
          },
          {
            kind: "p",
            text: "We don't sell your data, and we don't share it for advertising.",
          },
        ],
      },
      {
        id: "where",
        heading: "Where it lives, and for how long",
        blocks: [
          {
            kind: "p",
            text: "Our database runs on Supabase, in its us-east-1 region in the United States. Our pages, and the two small routes that set and read the backup cookie, run on Vercel. Both process data for us under their own terms, and their systems keep short technical logs, which can include IP addresses, to run and protect their networks. If you play from outside the United States, your data is stored and processed there.",
          },
          {
            kind: "list",
            items: [
              "Analytics events: 7 days, then only daily totals with no player id in them.",
              "Daily games: the round-by-round detail for 30 days, then only the totals and the share code. Each game is deleted 400 days after it ends. Your streak history and stats totals stay with your profile.",
              "Report notes: 180 days.",
              "Your list of answered practice questions: 180 days after your last practice answer. If you've only played Practice, Delete my data clears this device, and the list on our server goes 180 days after your last answer.",
              ...(rooms ? ["Rooms (Beta): 24 hours after the room ends."] : []),
              "IP address hashes: unreadable after 48 hours, once their salt is deleted.",
              "The backup cookie: 400 days from the last time it was renewed.",
              "Everything else: until you delete it.",
            ],
          },
        ],
      },
      {
        id: "your-data",
        heading: "Taking or deleting your data",
        blocks: [
          {
            kind: "p",
            text: "Settings has two buttons for this:",
          },
          {
            kind: "list",
            items: [
              `**Download my data** gives you a file with your profile and devices, your time zone, your Daily games and streak history, ${editor ? "your Groups and challenges, and your quizzes" : "and your Groups and challenges"}, plus the practice data on this device. It doesn't yet include your reports, your hearts, your list of answered practice questions or your analytics events.`,
              `**Delete my data** asks twice, then deletes your profile, its secrets and sync code, your Group memberships and challenges${editor ? ", your quizzes" : ""}, your reports, your hearts, your list of answered practice questions and your analytics events, and takes your player id off your Daily games. It then clears this device and removes the backup cookie. Totals such as how many people solved a Mystery on clue 2 stay, with nothing in them that points to you.`,
            ],
          },
          {
            kind: "p",
            text: "If your profile is on a device you no longer have, restore it on another with your sync code, then delete it from there.",
          },
          {
            kind: "p",
            text: `Wherever privacy law gives you more rights, such as in the EU and the UK, you have them here too. Email ${CONTACT_LINK} and we'll help. If you're in the EU or the UK, you can also complain to your data protection authority.`,
          },
        ],
      },
      {
        id: "children",
        heading: "Children",
        blocks: [
          {
            kind: "p",
            text: "Knewt is for players aged 13 and over. If someone tells us they're under 13, the app deletes their profile from our server, removes the backup cookie, clears the identity on that device and stops sending anything from it. Practice still works there, offline.",
          },
          {
            kind: "p",
            text: editor
              ? "Players aged 13 to 17 pick from generated names instead of typing their own, and can't share quizzes."
              : "Players aged 13 to 17 pick from generated names instead of typing their own.",
          },
        ],
      },
      {
        id: "changes",
        heading: "Changes and questions",
        blocks: [
          {
            kind: "p",
            text: "If we change what we collect or why, we'll update this page and its date before the change ships, and if the change matters, we'll say so in the app too.",
          },
          {
            kind: "p",
            text: `Questions about your data? Email ${CONTACT_LINK}. We read every message and aim to reply within a week.`,
          },
        ],
      },
    ],
  };
}
