/**
 * The legal feature's shared words (ARCHITECTURE §2.4): the page frame's
 * labels, the contact address, licence names and answer-list names. Each
 * page's own text is in `./documents/`.
 *
 * Written in the brand voice (DESIGN §1.3: calm and factual for privacy,
 * data and rules) and the brief's style rules. We could not get legal
 * review (decisions memo §7, §10), so these pages are sensible defaults.
 * Open for the owner before launch, and recorded in the launch report
 * rather than on the pages:
 * - legal review is recommended before marketing user quiz sharing (PRD
 *   §3.9.5), and before launch for the terms and the privacy page;
 * - the contact mailbox below must exist, on the domain the owner picks
 *   (`knewt.app` is DESIGN §0.2's placeholder);
 * - the operator's legal name and address belong on /privacy and /terms
 *   once there is one;
 * - /privacy promises EU and UK rights but names no lawful basis for the
 *   gameplay records, the analytics events or the IP-based abuse checks,
 *   and no transfer basis for keeping EU and UK players' data in
 *   us-east-1; the review should supply both (the right to complain to a
 *   data protection authority is on the page);
 * - whether content/ and public/content/ stay under the repository's MIT
 *   licence or get one of their own: /terms says the practice questions
 *   are MIT until the owner decides.
 */
import type { LocalDate } from "@/engine/types";
import { MONTH_NAMES, dateParts } from "@/engine/time";

/** Where every page sends questions, reports and takedown requests. */
export const CONTACT_EMAIL = "hello@knewt.app";

/** `[hello@knewt.app](mailto:hello@knewt.app)`, as a text mark. */
export const CONTACT_LINK = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const LEGAL_COPY = {
  /** Before the date under each page's title (DESIGN §12.40). */
  lastUpdated: "Last updated",
  /** The table of contents' label. */
  onThisPage: "On this page",
} as const;

/** "5 November 2026": months spelled out, no weekday (DESIGN §12.40). */
export function formatUpdated(date: LocalDate): string {
  const [year, month, day] = dateParts(date);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** Licence names as people know them, by SPDX id (or the manifest's words). */
const LICENCE_NAMES: Readonly<Record<string, string>> = {
  "0BSD": "Zero-Clause BSD License",
  "Apache-2.0": "Apache License 2.0",
  "BSD-3-Clause": "BSD 3-Clause License",
  "CC-BY-4.0": "CC BY 4.0",
  "CC-BY-SA-3.0": "CC BY-SA 3.0",
  "CC-BY-SA-4.0": "CC BY-SA 4.0",
  "CC0-1.0": "CC0 (public domain dedication)",
  ISC: "ISC License",
  MIT: "MIT License",
  "ODbL-1.0": "Open Database License 1.0",
  "ODC-PDDL-1.0": "Open Data Commons Public Domain Dedication 1.0",
  "OFL-1.1": "SIL Open Font License 1.1",
  "Public domain": "Public domain",
  "Unicode-3.0": "Unicode License v3",
};

/** "Apache-2.0 AND CC-BY-4.0" gives "Apache License 2.0 and CC BY 4.0". */
export function licenceName(spdx: string): string {
  return spdx
    .split(/\s+AND\s+/)
    .map((part) => LICENCE_NAMES[part] ?? part)
    .join(" and ");
}

/** Where a licence can be read in full, for the ones with a canonical page. */
const LICENCE_URLS: Readonly<Record<string, string>> = {
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "ODbL-1.0": "https://opendatacommons.org/licenses/odbl/1-0/",
  "ODC-PDDL-1.0": "https://opendatacommons.org/licenses/pddl/1-0/",
};

/** The licence's name, linked to its text where it has a canonical page. */
export function licenceMark(spdx: string): string {
  return spdx
    .split(/\s+AND\s+/)
    .map((part) => {
      const name = LICENCE_NAMES[part] ?? part;
      const url = LICENCE_URLS[part];
      return url === undefined ? name : `[${name}](${url})`;
    })
    .join(" and ");
}

/** The answer lists by type, as /credits names them (PRD §3.18.4). */
export const LIST_NAMES: Readonly<Record<string, string>> = {
  animal: "Animals",
  book: "Books",
  city: "Cities",
  country: "Countries",
  dish: "Dishes and drinks",
  element: "Chemical elements",
  film: "Films",
  landmark: "Landmarks",
  music_artist: "Music artists",
  person: "People",
  sport: "Sports and games",
  tv_series: "TV series",
};

/** "Countries", "Countries and Cities", "Countries, Cities and People". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** List names for answer types, in the order given. */
export function listNames(types: readonly string[]): string {
  return joinNames(types.map((type) => LIST_NAMES[type] ?? type));
}
