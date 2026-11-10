/**
 * `/accessibility` (PRD §3.14, §3.12): the WCAG 2.2 AA target, what the
 * app does for everyone, the Settings of PRD §3.12.1 that help, known
 * limitations, how we check, how to reach us, and the date of the last
 * review. Should and Beta features (readable text, high-contrast
 * feedback, read aloud, Blitz, rooms) appear only when their flag is on,
 * and the Settings list and the More-menu line only once those controls
 * exist (RITE round 3, R3-06).
 */
import type { FeatureFlag } from "@/config/features";
import type { LocalDate } from "@/engine/types";
import { SHELL_COPY } from "@/features/shell";

import { CONTACT_LINK, formatUpdated } from "../copy";
import { legalDate, type LegalDocument } from "../document";

/** When this statement was last reviewed against WCAG 2.2 AA. */
export const ACCESSIBILITY_REVIEWED: LocalDate = legalDate("2026-11-10");

/**
 * Whether Settings has the switch that turns the answer keys off (PRD
 * §3.0.3, §3.12). Decision D20 (RITE round 2, R2-02): the statement says
 * "Turn them off" only once it does, so it never sends a player to a switch
 * that isn't there. SET-1 turns this on when it builds the switch.
 */
export const KEYBOARD_SHORTCUTS_SWITCH = false;

/**
 * Whether Settings has its controls yet (PRD §3.12.1). Until SET-1 builds
 * them, Settings is a placeholder, so the statement lists only the choices
 * the app really offers (RITE round 3, R3-06): the Daily's stopwatch, which
 * the More menu and the stopwatch itself hide, and the answer keys. SET-1
 * turns this on, and the full list of Settings shows.
 */
export const SETTINGS_CONTROLS = false;

/**
 * Whether the More menu during a game offers Reduce motion (PRD §3.12).
 * Today it has How to play and Hide stopwatch, so the statement doesn't
 * send anyone there for it (R3-06). The ticket that adds the item turns
 * this on.
 */
export const MORE_MENU_REDUCE_MOTION = false;

/** What the app offers yet, which the statement's promises follow (R3-06). */
export interface ShippedAccessibilityFeatures {
  settings: boolean;
  moreMenuReduceMotion: boolean;
}

export const SHIPPED_ACCESSIBILITY_FEATURES: ShippedAccessibilityFeatures = {
  settings: SETTINGS_CONTROLS,
  moreMenuReduceMotion: MORE_MENU_REDUCE_MOTION,
};

/**
 * The answer keys, as D20, D28 and D31 left them, with D36's sentence on
 * how practice differs from the Daily's last clue (RITE round 5, R5-01).
 */
function keyboardShortcutsText(): string {
  return `Keys A to D work while focus is on one of the answers. In practice a key answers at once. On the Daily's last clue a key only chooses: the Lock in button, or Enter on your chosen answer, locks it in.${KEYBOARD_SHORTCUTS_SWITCH ? " Turn them off if they get in your way." : ""}`;
}

export function accessibilityDocument(
  flags: (flag: FeatureFlag) => boolean,
  shipped: ShippedAccessibilityFeatures = SHIPPED_ACCESSIBILITY_FEATURES,
): LegalDocument {
  const highContrast = flags("high_contrast");
  const readable = flags("readable_text");
  const readAloud = flags("read_aloud");
  const blitz = flags("blitz");
  const rooms = flags("rooms");

  return {
    path: "/accessibility",
    title: SHELL_COPY.legal.accessibility,
    updated: ACCESSIBILITY_REVIEWED,
    lede: [
      "Everyone who enjoys a quiz should be able to play Knewt, on any device and with any assistive technology. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA everywhere in the app.",
    ],
    sections: [
      {
        id: "built-in",
        heading: "What you can rely on",
        blocks: [
          {
            kind: "list",
            items: [
              "Every screen works with a keyboard alone, with a clear focus ring and a Skip to content link at the top.",
              "Each page has a title of its own and one main heading. Focus moves to each new question or clue, and verdicts are read out once, politely.",
              "Every Mystery can be finished without typing: Next clue leads to four options on the last clue.",
              `Nothing times out in the Daily or in Practice${blitz ? " (Blitz is timed on purpose)" : ""}. The Daily's stopwatch only breaks ties, and you can hide it.`,
              "Colour never carries meaning alone. Right and wrong always come with an icon and a word.",
              "Knewt follows your device's light or dark theme and its reduced-motion setting, and keeps every state visible in Windows high-contrast themes.",
              "Pages work at 320 pixels wide and with text at 200%, without scrolling sideways.",
              "Buttons are at least 44 pixels square, and answers at least 56 pixels tall.",
              "Reading text is set in Atkinson Hyperlegible Next, a typeface made for readers with low vision.",
            ],
          },
        ],
      },
      settingsSection(shipped, {
        highContrast,
        readable,
        readAloud,
        blitz,
        rooms,
      }),
      {
        id: "limitations",
        heading: "What we know isn't right yet",
        blocks: [
          {
            kind: "list",
            items: [
              "We haven't yet tested Knewt with VoiceOver and TalkBack on real phones. That testing happens during our closed beta, and we'll update this page with what we find.",
              "Your share text uses coloured squares, and screen readers read out each square's name, which is slow to listen to.",
              ...(rooms
                ? [
                    "Host rooms (Beta) are made for a big screen and use timers. The host can turn the timer off, or give any player extra time.",
                  ]
                : []),
              ...(blitz
                ? [
                    "Blitz is timed by design. Its clock pauses while the tab is hidden.",
                  ]
                : []),
            ],
          },
        ],
      },
      {
        id: "checks",
        heading: "How we check",
        blocks: [
          {
            kind: "p",
            text: "Our automated tests check our pages with axe and try the main flows with a keyboard alone, including at 320 pixels wide and with text at 200%. We review new screens against WCAG 2.2 AA before they ship. There has been no outside audit yet.",
          },
          {
            kind: "p",
            text: `This statement was last reviewed on ${formatUpdated(ACCESSIBILITY_REVIEWED)}.`,
          },
        ],
      },
      {
        id: "contact",
        heading: "Tell us what gets in your way",
        blocks: [
          {
            kind: "p",
            text: `If something in Knewt doesn't work for you, email ${CONTACT_LINK}. Tell us the page and what happened, and we'll reply within a week. If you need anything on this site in another format, ask and we'll help.`,
          },
        ],
      },
    ],
  };
}

/**
 * "Settings that help" once SET-1 has built them; until then, "Choices you
 * can make", with only what the app offers today (R3-06): round 3's Dee and
 * Lena read six Settings and a Reduce motion item in the More menu, and
 * found a placeholder and a menu with How to play and Hide stopwatch.
 */
function settingsSection(
  shipped: ShippedAccessibilityFeatures,
  on: {
    highContrast: boolean;
    readable: boolean;
    readAloud: boolean;
    blitz: boolean;
    rooms: boolean;
  },
): LegalDocument["sections"][number] {
  const { highContrast, readable, readAloud, blitz, rooms } = on;
  // A Should setting whose flag is on lives in Settings, so Settings exists.
  if (!shipped.settings && !highContrast && !readable && !readAloud) {
    return {
      id: "settings",
      heading: "Choices you can make",
      blocks: [
        {
          kind: "terms",
          items: [
            {
              term: "Daily stopwatch",
              details: [
                "Hide it with Hide stopwatch in the More menu during the Daily. Selecting the stopwatch opens that menu too. Hidden, it still counts for tie-breaks.",
              ],
            },
            {
              term: "Keyboard shortcuts",
              details: [keyboardShortcutsText()],
            },
          ],
        },
      ],
    };
  }
  const moreMenu = [
    ...(shipped.moreMenuReduceMotion ? ["Reduce motion"] : []),
    ...(highContrast ? ["High-contrast feedback"] : []),
  ];
  return {
    id: "settings",
    heading: "Settings that help",
    blocks: [
      { kind: "p", text: "In Settings:" },
      {
        kind: "terms",
        items: [
          {
            term: "Theme",
            details: ["Follow your device, or choose Light or Dark."],
          },
          {
            term: "Reduce motion",
            details: [
              "Swaps movement for gentle fades and turns confetti off, whatever your device is set to.",
            ],
          },
          {
            term: "Sound effects",
            details: [
              "Off until you turn them on. Nothing in the game depends on sound.",
            ],
          },
          ...(highContrast
            ? [
                {
                  term: "High-contrast feedback",
                  details: [
                    "Right and wrong use blue and orange instead of teal and red, in the game and in your share text.",
                  ],
                },
              ]
            : []),
          ...(readable
            ? [
                {
                  term: "Readable text",
                  details: [
                    "More space between letters and between lines, on plainer paper.",
                  ],
                },
              ]
            : []),
          ...(readAloud
            ? [
                {
                  term: "Read aloud",
                  details: [
                    `Adds a button that reads questions, clues, options and explanations aloud.${blitz ? " It pauses the Blitz clock while it speaks." : ""}`,
                  ],
                },
              ]
            : []),
          {
            term: "Daily stopwatch",
            details: ["Show it or hide it."],
          },
          {
            term: "Keyboard shortcuts",
            details: [keyboardShortcutsText()],
          },
          {
            term: "Auto-advance",
            details: [
              "In Practice, moves on after each explanation, with time to read it first. Off unless you turn it on.",
            ],
          },
          ...(rooms
            ? [
                {
                  term: "Room timer announcements",
                  details: [
                    "In a room, says when 10 seconds and 5 seconds are left.",
                  ],
                },
              ]
            : []),
        ],
      },
      ...(moreMenu.length === 0
        ? []
        : [
            {
              kind: "p" as const,
              text:
                moreMenu.length > 1
                  ? `${moreMenu.join(" and ")} are also in the More menu during a game, so you never have to leave it to find them.`
                  : `${moreMenu[0] ?? ""} is also in the More menu during a game, so you never have to leave it to find it.`,
            },
          ]),
    ],
  };
}
