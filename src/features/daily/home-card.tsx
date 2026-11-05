"use client";

/**
 * Today's Daily card (PRD §3.1.7, DESIGN §12.1), greybox: not started, in
 * progress and finished, and not ready: a backend that serves no Daily yet
 * (`unavailable`, the Supabase adapters until SQL-4 and SQL-5) gets no Play
 * and the Practice card promoted above it. DLY-2 adds the rest (offline,
 * outage, the played count, the Group line, the first-paint date script).
 *
 * The number, minutes and rule line render at once from the epoch and the
 * device's date, and Play is live before anything loads: it starts the
 * Daily in one tap (AC-DLY-01). The status and chips arrive with
 * `get_today` after first paint, from a lazily loaded chunk. The minutes
 * show only before the Daily starts; the rule line describes Mysteries
 * only when the day has one. The card never repeats the date: Today's
 * dateline above it names the day (D18). The finished card draws its mini
 * grid in the player's glyph set and carries Share with the stop screen's
 * own text (AC-SHR-11), built in that chunk. Past 7 days shows once the
 * archive has a route (R1-02).
 *
 * Size: one of Home's eager islands, with a 4 kB gzipped target, so it
 * imports no engine module (the Daily's number is worked out below, and a
 * test keeps it equal to the engine's), and the backend and the Share
 * button load with import(), only for a finished card.
 */
import type { Route } from "next";
import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";

import type { DailyTodayCard, TodayRoundChip } from "@/engine/types";
import { HOME_PROMOTE_PRACTICE } from "@/features/home";
import type {
  ShareButtonProps,
  SharePayload,
} from "@/features/share/share-button";
import { buttonClasses } from "@/ui/button-classes";
import { Chip } from "@/ui/chip";

import { glyphsFor } from "./glyphs";
import { HOME_CARD_COPY } from "./home-copy";
import { ARCHIVE_HREF } from "./links";
import { ANSWER_TYPE_WORDS, DIFFICULTY_WORDS, waitWords } from "./words";

const COPY = HOME_CARD_COPY;

const DAY_MS = 86_400_000;

function utcDay(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * "Daily #42" for a date (`YYYY-MM-DD`) and the epoch. No date: Today's
 * dateline names the day once (D18).
 */
export function dailyLine(date: string, epoch: string): string {
  const number = Math.round((utcDay(date) - utcDay(epoch)) / DAY_MS) + 1;
  return COPY.dailyLine(number);
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

/** The finished card's Share: the stop screen's text and the button, loaded together. */
interface ShareSlot {
  payload: SharePayload;
  Button: ComponentType<ShareButtonProps>;
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
  /** The backend serves no Daily (`unavailable`): nothing to play yet. */
  const [notReady, setNotReady] = useState(false);
  const [share, setShare] = useState<ShareSlot | null>(null);
  // The device's date is only known in the browser; the prerender holds a
  // same-length placeholder, hidden until it is replaced.
  const today = useSyncExternalStore(never, deviceDate, () => null);

  useEffect(() => {
    let live = true;
    void import("./home-data")
      .then((data) => data.loadTodayCard())
      .then(({ card: result, highContrast }) => {
        if (!live) return;
        if (result.ok) {
          setLoaded({
            card: result.value,
            receivedAt: Date.now(),
            highContrast,
          });
        } else if (
          // Not a server shedding load for a moment (which says when to
          // come back): Play stays for that, and the Daily screen copes.
          result.error.retryAfterMs === null &&
          (result.error.code === "unavailable" ||
            result.error.code === "feature_disabled")
        ) {
          setNotReady(true);
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
    void Promise.all([
      import("./home-data").then((data) =>
        data.loadSharePayload(finishedId, highContrast),
      ),
      import("@/features/share/share-button"),
    ])
      .then(([payload, share]) => {
        if (live && payload !== null) {
          setShare({ payload, Button: share.ShareButton });
        }
      })
      .catch(() => {
        // The card works without Share; See results still has it.
      });
    return () => {
      live = false;
    };
  }, [finishedId, highContrast]);

  const date = card?.daily.date ?? today;
  // Which Daily, and before it starts how long it takes; the dateline
  // above names the day (D18). An unfinished run's heading names the Daily
  // itself, so its line says where the run stands instead.
  const line = date === null ? null : dailyLine(date, epoch);
  const dailyNumber = card?.daily.dailyNumber;
  const rule =
    card === null || card.rounds.some((chip) => chip.type === "mystery")
      ? COPY.rule
      : COPY.ruleChoice;

  let heading: string = COPY.heading;
  let action: ReactNode = (
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
      {/* Flat labels, never pills that read as controls (R1-27). */}
      <ul aria-label={COPY.roundsLabel} className="flex flex-wrap gap-2">
        {(card?.rounds.map(chipText) ?? COPY.placeholderChips).map(
          (chip, index) => (
            <li key={index} className="flex max-w-full">
              <Chip className="max-w-full whitespace-normal">{chip}</Chip>
            </li>
          ),
        )}
      </ul>
    </>
  );

  if (card === null && notReady) {
    // No Play and no chips for a Daily that can't start; Quick play goes
    // first, in the Practice card the marker moves above this one.
    action = null;
    body = (
      <p className="text-base" {...HOME_PROMOTE_PRACTICE}>
        {COPY.notReady}
      </p>
    );
  } else if (card !== null && status === "in_progress") {
    heading = COPY.continueHeading(card.daily.dailyNumber);
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
    const glyphs = glyphsFor(highContrast);
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
        {share === null ? null : (
          <share.Button payload={share.payload} surface="home" />
        )}
      </>
    );
    after = <NextDaily loaded={loaded} />;
  }

  return (
    <section
      aria-labelledby="qz-daily-card"
      data-daily-card={card === null && notReady ? "not_ready" : status}
      className="flex flex-col gap-3 rounded-3xl border-2 border-foreground bg-background p-4 shadow-[0_4px_0_0] shadow-foreground/40 sm:p-5"
    >
      <h2 id="qz-daily-card" className="text-xl font-bold">
        {heading}
      </h2>
      {card !== null && status === "in_progress" ? (
        // Its own line under "Continue Daily #42" (DESIGN §12.1), so a
        // narrow card never starts a line with the separator.
        <p className="text-sm font-semibold" data-daily-progress="">
          {progressLine(card)}
        </p>
      ) : (
        <p className="text-sm font-semibold">
          <span className={line === null ? "invisible" : undefined}>
            {line ?? COPY.dailyLine(0)}
          </span>
          {status === "not_started" ? ` · ${COPY.minutes(minutes)}` : null}
        </p>
      )}
      {body}
      {action}
      {after}
      {ARCHIVE_HREF === null ? null : (
        <Link
          href={ARCHIVE_HREF}
          prefetch={false}
          className={buttonClasses({
            variant: "text",
            className: "self-start",
          })}
        >
          {COPY.pastWeek}
        </Link>
      )}
    </section>
  );
}
