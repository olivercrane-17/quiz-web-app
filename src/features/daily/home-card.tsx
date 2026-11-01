"use client";

/**
 * Today's Daily card (PRD §3.1.7, DESIGN §12.1), greybox: not started, in
 * progress and finished. DLY-2 adds the rest (offline, outage, the played
 * count, the Group line, the first-paint date script).
 *
 * The number, date, minutes and rule line render at once from the epoch
 * and the device's date, and Play is live before anything loads: it starts
 * the Daily in one tap (AC-DLY-01). The status and chips arrive with
 * `get_today` after first paint, from a lazily loaded chunk. The minutes
 * show only before the Daily starts; the rule line describes Mysteries
 * only when the day has one. The finished card draws its mini grid in the
 * player's glyph set and carries Share with the stop screen's own text
 * (AC-SHR-11), built in that chunk; SHR-1 fills the button itself.
 *
 * Size: one of Home's eager islands, with a 4 kB gzipped target, so it
 * imports no engine module (the day names are repeated below, and a test
 * keeps them equal to the engine's), and the backend loads with import().
 */
import type { Route } from "next";
import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { DailyTodayCard, TodayRoundChip } from "@/engine/types";
import { ShareButton, type SharePayload } from "@/features/share/share-button";
import { buttonClasses } from "@/ui/button-classes";

import { DEFAULT_GLYPHS, HIGH_CONTRAST_GLYPHS } from "./glyphs";
import { HOME_CARD_COPY } from "./home-copy";
import { ANSWER_TYPE_WORDS, DIFFICULTY_WORDS, waitWords } from "./words";

const COPY = HOME_CARD_COPY;

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const MONTHS = [
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

const DAY_MS = 86_400_000;

function utcDay(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** "Sunday 1 November" for a date (`YYYY-MM-DD`). */
export function longDate(date: string): string {
  const at = new Date(utcDay(date));
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

/** "Daily #42 · Sunday 1 November" for a date (`YYYY-MM-DD`) and the epoch. */
export function dailyLine(date: string, epoch: string): string {
  const number = Math.round((utcDay(date) - utcDay(epoch)) / DAY_MS) + 1;
  return COPY.dailyLine(number, longDate(date));
}

/** The device's local date, `YYYY-MM-DD`. */
function deviceDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function never(): () => void {
  return () => {};
}

export function chipText(chip: TodayRoundChip): string {
  if (chip.type === "encore") return COPY.encoreChip;
  const what =
    chip.answerType === null
      ? COPY.questionChip
      : ANSWER_TYPE_WORDS[chip.answerType];
  return chip.difficulty === null
    ? what
    : `${what} · ${DIFFICULTY_WORDS[chip.difficulty]}`;
}

/** "Mystery 2 of 3", "Question 4 of 9", "Encore": where an unfinished run stands. */
export function progressLine(card: DailyTodayCard): string {
  const index = card.progress?.roundIndex ?? 0;
  const current = card.rounds[index];
  if (current === undefined) return "";
  const family = (type: string) =>
    type === "mystery" || type === "encore" ? type : "choice";
  const mine = family(current.type);
  const same = card.rounds.filter((chip) => family(chip.type) === mine);
  const ordinal = card.rounds
    .slice(0, index + 1)
    .filter((chip) => family(chip.type) === mine).length;
  const words = COPY.progress;
  return mine === "encore"
    ? words.encore
    : mine === "mystery"
      ? words.mystery(ordinal, same.length)
      : words.choice(ordinal, same.length);
}

interface Loaded {
  card: DailyTodayCard;
  /** Device time when the card arrived, to run the countdown on server time. */
  receivedAt: number;
  /** The stored high-contrast setting: the mini grid's glyphs (DESIGN §6.11). */
  highContrast: boolean;
}

function warm(): void {
  void import("./home-data").then((data) => {
    data.warmDaily();
  });
}

function everyHalfMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, 30_000);
  return () => {
    clearInterval(timer);
  };
}

/** Whole minutes until the next Daily, on server time (the card's own clock sample). */
function minutesLeft(loaded: Loaded): number {
  const serverNow = loaded.card.serverTime + (Date.now() - loaded.receivedAt);
  return Math.max(
    0,
    Math.floor((loaded.card.nextUnlockAt - serverNow) / 60_000),
  );
}

function NextDaily({ loaded }: { loaded: Loaded }) {
  const minutes = useSyncExternalStore(
    everyHalfMinute,
    () => minutesLeft(loaded),
    () => null,
  );
  if (minutes === null) return null;
  return (
    <p className="text-sm">{COPY.nextDaily(waitWords(minutes * 60_000))}</p>
  );
}

export interface DailyHomeCardProps {
  /** DAILY_EPOCH, passed from the server so no config code ships here. */
  epoch: string;
  /** `daily_minutes` (PRD §3.1.7). */
  minutes: number;
}

export function DailyHomeCard({ epoch, minutes }: DailyHomeCardProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [share, setShare] = useState<SharePayload | null>(null);
  // The device's date is only known in the browser; the prerender holds a
  // same-length placeholder, hidden until it is replaced.
  const today = useSyncExternalStore(never, deviceDate, () => null);

  useEffect(() => {
    let live = true;
    void import("./home-data")
      .then((data) => data.loadTodayCard())
      .then(({ card: result, highContrast }) => {
        if (live && result.ok) {
          setLoaded({
            card: result.value,
            receivedAt: Date.now(),
            highContrast,
          });
        }
      })
      .catch(() => {
        // Play still works: the Daily screen has its own offline states.
      });
    return () => {
      live = false;
    };
  }, []);

  const card = loaded?.card ?? null;
  const status = card?.status ?? "not_started";
  const finishedId = status === "finished" ? (card?.attemptId ?? null) : null;
  const highContrast = loaded?.highContrast ?? false;

  useEffect(() => {
    if (finishedId === null) return;
    let live = true;
    void import("./home-data")
      .then((data) => data.loadSharePayload(finishedId, highContrast))
      .then((payload) => {
        if (live) setShare(payload);
      })
      .catch(() => {
        // The card works without Share; See results still has it.
      });
    return () => {
      live = false;
    };
  }, [finishedId, highContrast]);

  const date = card?.daily.date ?? today;
  // The minutes say how long a Daily takes, so only before it starts.
  const line =
    date === null
      ? null
      : status === "in_progress"
        ? longDate(date)
        : dailyLine(date, epoch);
  const dailyNumber = card?.daily.dailyNumber;
  const rule =
    card === null || card.rounds.some((chip) => chip.type === "mystery")
      ? COPY.rule
      : COPY.ruleChoice;

  let heading: string = COPY.heading;
  let action = (
    <Link
      href="/daily"
      onPointerDown={warm}
      className={buttonClasses({ variant: "ticket", block: true })}
    >
      {COPY.play}
    </Link>
  );
  let after: ReactNode = null;
  let body = (
    <>
      <p className="text-base">{rule}</p>
      <ul aria-label={COPY.roundsLabel} className="flex flex-wrap gap-2">
        {(card?.rounds.map(chipText) ?? COPY.placeholderChips).map(
          (chip, index) => (
            <li
              key={index}
              className="rounded-full border border-border px-3 py-1 text-sm"
            >
              {chip}
            </li>
          ),
        )}
      </ul>
    </>
  );

  if (card !== null && status === "in_progress") {
    heading = COPY.continueHeading(card.daily.dailyNumber, progressLine(card));
    action = (
      <Link
        href="/daily"
        onPointerDown={warm}
        className={buttonClasses({ variant: "ticket", block: true })}
      >
        {COPY.continue}
      </Link>
    );
    body = <></>;
  } else if (card?.finished && loaded !== null) {
    const { points, maxPoints, rows } = card.finished;
    const glyphs = highContrast ? HIGH_CONTRAST_GLYPHS : DEFAULT_GLYPHS;
    heading = COPY.doneHeading(points, maxPoints);
    action = (
      <Link
        href={`/daily/${dailyNumber}/results` as Route}
        className={buttonClasses({ variant: "secondary", block: true })}
      >
        {COPY.seeResults}
      </Link>
    );
    body = (
      <>
        <div aria-hidden="true" className="flex flex-col text-lg leading-tight">
          {rows.map((row, index) => (
            <span key={index}>
              {row.map((cell) => glyphs.cells[cell]).join("")}
            </span>
          ))}
        </div>
        {share === null ? null : <ShareButton payload={share} surface="home" />}
      </>
    );
    after = <NextDaily loaded={loaded} />;
  }

  return (
    <section
      aria-labelledby="qz-daily-card"
      data-daily-card={status}
      className="flex flex-col gap-3 rounded-3xl border-2 border-foreground bg-background p-4 shadow-[0_4px_0_0] shadow-foreground/40 sm:p-5"
    >
      <h2 id="qz-daily-card" className="text-xl font-bold">
        {heading}
      </h2>
      <p className="text-sm font-semibold">
        <span className={line === null ? "invisible" : undefined}>
          {line ?? COPY.dailyLine(0, "Wednesday 30 September")}
        </span>
        {status === "not_started" ? ` · ${COPY.minutes(minutes)}` : null}
      </p>
      {body}
      {action}
      {after}
      <Link
        href={"/archive" as Route}
        // Built by a later ticket: no prefetch, which would 404 until then.
        prefetch={false}
        className={buttonClasses({ variant: "text", className: "self-start" })}
      >
        {COPY.pastWeek}
      </Link>
    </section>
  );
}
