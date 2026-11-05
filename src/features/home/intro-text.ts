/**
 * Today's dateline, greeting and first-visit line ("Saturday 31 October",
 * "Good morning.", "Name the mystery in as few clues as you can."), by the
 * device's local time and storage (DESIGN §1.4, §12.1; D18).
 *
 * The prerendered page can't know the device's clock or storage, so the
 * HTML holds placeholders and an inline script right after them fills the
 * lines before first paint; on a client navigation the island computes
 * them instead. Both run `introTextAt`, the script from its source text,
 * so the function may use nothing but its arguments.
 *
 * **First visit.** The line shows while the device has no identity yet,
 * which the first island that boots mints (§9.1): so on a device's first
 * load of Today, and through the client navigations of that visit, but not
 * once the page is opened again. The prerendered HTML shows it, so a
 * newcomer's page never shifts; the inline script hides it before first
 * paint for everyone else.
 */
import { scriptJson } from "@/ui/inline-script";

import { HOME_COPY } from "./copy";

/**
 * The engine's WEEKDAY_NAMES and MONTH_NAMES, repeated so Today's bundle
 * doesn't carry the engine's time module (and the id parsers it imports).
 * A unit test keeps them equal.
 */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface IntroWords {
  night: string;
  morning: string;
  afternoon: string;
  evening: string;
  weekdays: readonly string[];
  months: readonly string[];
}

export interface IntroText {
  greeting: string;
  date: string;
}

export const INTRO_WORDS: IntroWords = {
  ...HOME_COPY.greeting,
  weekdays: WEEKDAY_NAMES,
  months: MONTH_NAMES,
};

export const INTRO_IDS = {
  greeting: "qz-home-greeting",
  date: "qz-home-date",
  firstVisit: "qz-home-first-visit",
} as const;

/**
 * Hello from midnight to 4:59 (D18), morning from 05:00, afternoon from
 * 12:00, evening from 18:00.
 */
export function introTextAt(now: Date, words: IntroWords): IntroText {
  const hour = now.getHours();
  const greeting =
    hour < 5
      ? words.night
      : hour < 12
        ? words.morning
        : hour < 18
          ? words.afternoon
          : words.evening;
  const date =
    (words.weekdays[now.getDay()] ?? "") +
    " " +
    now.getDate() +
    " " +
    (words.months[now.getMonth()] ?? "");
  return { greeting, date };
}

/** The kv layer's device names (src/platform/storage/kv.ts). */
const DEVICE_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Where the identity lives (`qz:identity`, src/platform/identity/local.ts),
 * in a mock build's device namespace when a test asked for one, as the kv
 * layer names it: `qz:d:<device>:identity`.
 */
export function identityStorageKey(device: unknown): string {
  return typeof device === "string" && DEVICE_NAME.test(device)
    ? `qz:d:${device}:identity`
    : "qz:identity";
}

/** True while `storage` holds no identity; storage that can't be read counts as none. */
export function isFirstVisit(
  storage: { getItem(key: string): string | null } | null,
  key: string,
): boolean {
  try {
    return storage?.getItem(key) == null;
  } catch {
    return true;
  }
}

/**
 * The inline script's source: fills the date and greeting from the device
 * clock and hides the first-visit line where an identity is stored. Never
 * throws. `devices` (mock builds only) reads a test's device namespace, as
 * the boot script does.
 */
export function introScript({ devices }: { devices: boolean }): string {
  const key = devices
    ? `var v=window.__QZ_DEVICE__,k=typeof v=="string"&&${DEVICE_NAME.toString()}.test(v)?"qz:d:"+v+":identity":"qz:identity";`
    : `var k="qz:identity";`;
  return (
    `(function(){var i=${scriptJson(INTRO_IDS)};` +
    `try{var t=(${introTextAt.toString()})(new Date(),${scriptJson(INTRO_WORDS)});` +
    `var g=document.getElementById(i.greeting);if(g)g.textContent=t.greeting;` +
    `var d=document.getElementById(i.date);if(d)d.textContent=t.date}catch(e){}` +
    `try{${key}var f=document.getElementById(i.firstVisit);` +
    `if(f&&localStorage.getItem(k)!==null)f.hidden=true}catch(e){}})()`
  );
}
