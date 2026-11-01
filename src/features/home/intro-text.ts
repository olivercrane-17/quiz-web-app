/**
 * Today's dateline and greeting ("Saturday 31 October", "Good morning."),
 * by the device's local time (DESIGN §1.4, §12.1).
 *
 * The prerendered page can't know the device's clock, so the HTML holds a
 * placeholder and an inline script right after it fills both lines before
 * first paint; on a client navigation the island computes them instead.
 * Both run `introTextAt`, the script from its source text, so the function
 * may use nothing but its arguments.
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
} as const;

/** Morning from 05:00, afternoon from 12:00, evening from 18:00 until 05:00. */
export function introTextAt(now: Date, words: IntroWords): IntroText {
  const hour = now.getHours();
  const greeting =
    hour >= 5 && hour < 12
      ? words.morning
      : hour >= 12 && hour < 18
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

/** The inline script's source: fills the two lines from the device clock, never throws. */
export function introScript(): string {
  return `(function(){try{var t=(${introTextAt.toString()})(new Date(),${scriptJson(INTRO_WORDS)});var i=${scriptJson(INTRO_IDS)};var g=document.getElementById(i.greeting);if(g)g.textContent=t.greeting;var d=document.getElementById(i.date);if(d)d.textContent=t.date}catch(e){}})()`;
}
