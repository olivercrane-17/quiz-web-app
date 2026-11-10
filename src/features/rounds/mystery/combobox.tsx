"use client";

/**
 * The guess combobox (PRD §3.1.4, §3.12.3, §4.1.3; DESIGN §6.4): the ARIA
 * 1.2 combobox pattern with a listbox popup.
 *
 * - Suggestions come from the device's copy of the closed list as the
 *   player types, from the first character; nothing is sent per keystroke.
 *   Rows show the display form with the typed letters in bold, a
 *   disambiguation at the right ("cartographer", "1995", "France"), and
 *   already-guessed entities stay listed, disabled, "Already guessed". A
 *   row is one 48 px line, so three whole rows fit above a keyboard
 *   (AC-DLY-32); when the field is narrow in `em` (large text on a phone),
 *   names wrap instead of truncating and the disambiguation drops under
 *   them, so the word that tells decoys apart always shows (R1-03). A row
 *   that only a typo matched comes last, as the engine ranks it, and says
 *   "Similar spelling" (R1-37). A highlighted or hovered row sets its
 *   disambiguation and marks in full ink, which keeps them readable on the
 *   row's tint.
 * - Arrow keys move the highlight (`aria-activedescendant`), Enter on a
 *   highlighted row selects it, Escape closes the list (then clears the
 *   field), and Tab leaves. When exactly one selectable row matches, it is
 *   highlighted by itself (D5); namesakes still pick nothing. Then Guess,
 *   or Go on the on-screen keyboard, guesses that one match at once (D23,
 *   R2-13), while Enter from a hardware keyboard keeps D5's two steps: it
 *   picks, and a second Enter submits. With nothing highlighted, Enter
 *   selects the one entity whose name, alias or display equals the text
 *   exactly, and nothing for namesakes or no match (AC-SUG-05). With a
 *   selection in place, Enter submits. Editing the text clears the
 *   selection, and Guess stays disabled until there is one, or one match
 *   highlighted.
 * - Guess, or Enter, with nothing to guess shows the field's description,
 *   "Pick a name from the list, then Guess.", under the field and says it
 *   (R1-29); with one match highlighted it never shows, since Guess takes
 *   it (D23). A chosen name shows in full under the field (R1-28): the
 *   field itself may only have room for part of it.
 * - The count is announced on each change ("4 people match"), a moment
 *   after typing settles, so screen readers aren't flooded. When more match
 *   than the list shows (PRD §4.1.3 caps it at 6), it says so: "7 countries
 *   match. Showing 6, so keep typing.", and the second sentence also shows
 *   under the list (D26, R2-21). A list that failed to load is announced
 *   once, and the loading and failed lines describe the field.
 * - Guess, Clear and the rows keep focus in the field on touch (they cancel
 *   the pointer-down blur), so the keyboard stays up after a wrong guess.
 * - A wrong guess clears the field (`resetKey` changes); Next clue keeps
 *   the typing and its list (D9).
 * - When the field is narrow in `em` (large text on a phone), Guess takes
 *   its own full-width row under the field and its list, and the inline
 *   Clear and the search icon go (Escape and Backspace still clear), so the
 *   field keeps room for the text (R1-03). The placeholder may wrap there
 *   (D14: its noun is the point), drawn over the field while it is empty;
 *   the input's own placeholder stays for assistive tech. A container query
 *   decides, so it follows the text size as well as the width.
 * - Whenever the list opens, the page scrolls the least distance that keeps
 *   the field and its first three rows above the visual viewport's bottom
 *   edge, and the list holds only the whole rows that fit there (R1-11):
 *   zoom and short windows leave the list below the fold as surely as a
 *   keyboard does. The field itself never goes under the top edge (the
 *   sticky header): when it and three rows can't all fit, as at large text
 *   sizes, its top stays in view and the list holds the rows that fit.
 * - With the on-screen keyboard open (compact): the field keeps the room
 *   for the typed text and the chosen name (no search icon or Clear;
 *   Escape and Backspace still clear), Next clue sits beside it
 *   (`beside`), the list runs the full width under both, the space for
 *   three whole rows is reserved under it, and the page scrolls so the
 *   field, those rows and the top of the current clue (`keepVisible`) sit
 *   between the top edge and the keyboard. The list holds only whole rows
 *   that fit above the keyboard.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { normalizeName } from "@/engine/suggest";
import type { AnswerType, EntityId } from "@/engine/types";
import { playEffect } from "@/platform/sound";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";

import {
  isMysteryAnswerList,
  type SuggestionRow,
  type SuggestionSearch,
} from "../answer-list";
import type { AnswerListHandle, Suggestion } from "../contracts";
import { MYSTERY_COPY } from "./copy";
import { focusTargetProps, keepFieldFocus } from "./focus";
import { AnswerTypeIcon, ClearIcon, SearchIcon } from "./icons";
import { TONE } from "./tones";
import {
  keepBetween,
  remPx,
  roomBetweenEdges,
  viewportBottom,
  type KeyboardState,
} from "./use-keyboard";

/** DESIGN §4: suggestion rows are 48 px (3rem, `min-h-12`). */
export const ROW_HEIGHT_REM = 3;
/** AC-DLY-32 and R1-11: at least three whole rows stay visible as the list opens. */
export const MIN_VISIBLE_ROWS = 3;
/** The listbox's padding (4 px each side) and bottom border (2 px). */
const LIST_CHROME_PX = 10;
/** Typing settles this long before the count is spoken. */
export const COUNT_ANNOUNCE_DELAY_MS = 450;
/**
 * Under this width the field is too narrow for Guess beside the text
 * (R1-03): 18em is 288 px at 100% text, so only phones under 320 px stack,
 * and 576 px at 200% text, so every phone does. The classes below spell it
 * out in full (`@max-[18em]/guess:`), as Tailwind reads them from source.
 */
export const NARROW_FIELD_EM = 18;

const NOTHING: SuggestionSearch = { rows: [], total: 0 };

/** Types whose display ends ", Country" (CONTENT_GUIDE §2.10). */
const COUNTRY_SUFFIXED: ReadonlySet<AnswerType> = new Set(["city", "landmark"]);

/**
 * The row's two parts: the name, and the disambiguation at the right
 * (DESIGN §6.4), with where it starts in the display. A trailing bracket is
 * the qualifier ("Ada Morrow (cartographer)", "Heat (1995)"); for cities
 * and landmarks the country after the last comma is ("Paris, France"). A
 * comma in any other name ("Earth, Wind & Fire") is part of the name.
 */
export function splitDisplay(
  display: string,
  type: AnswerType | null,
): { name: string; aside: string | null; asideStart: number } {
  const bracket = /^(.*\S)\s+\(([^()]+)\)$/.exec(display);
  if (bracket?.[1] !== undefined && bracket[2] !== undefined) {
    return {
      name: bracket[1],
      aside: bracket[2],
      // The qualifier ends just before the closing bracket.
      asideStart: display.length - 1 - bracket[2].length,
    };
  }
  const comma = display.lastIndexOf(", ");
  if (type !== null && COUNTRY_SUFFIXED.has(type) && comma > 0) {
    return {
      name: display.slice(0, comma),
      aside: display.slice(comma + 2),
      asideStart: comma + 2,
    };
  }
  return { name: display, aside: null, asideStart: display.length };
}

/**
 * The row D5 highlights by itself: the one selectable row when exactly one
 * matching entity can be picked, else -1. Matches past the shown rows count
 * as selectable: a Mystery holds at most three guesses, so a list long
 * enough to hide rows always has more than one entity to pick.
 */
export function loneSelectableRow(
  rows: readonly Suggestion[],
  total: number,
): number {
  let lone = -1;
  let selectable = Math.max(0, total - rows.length);
  rows.forEach((row, index) => {
    if (row.alreadyGuessed) return;
    selectable += 1;
    lone = index;
  });
  return selectable === 1 ? lone : -1;
}

/** `text` (which starts at `offset` in the display) with the matched range in a `<mark>`. */
function Highlighted({
  text,
  offset,
  match,
}: {
  text: string;
  offset: number;
  match: Suggestion["match"];
}) {
  if (match === null) return <>{text}</>;
  const start = Math.max(0, match.start - offset);
  const end = Math.min(text.length, match.end - offset);
  if (end <= start) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      {/* Forced colours paint the matched letters as the system highlight (DESIGN §11). */}
      <mark className="bg-transparent font-extrabold text-inherit forced-colors:bg-[color:Mark] forced-colors:text-[color:MarkText] forced-colors:forced-color-adjust-none">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

export interface GuessComboboxProps {
  answerType: AnswerType | null;
  list: AnswerListHandle | null;
  alreadyGuessed: ReadonlySet<EntityId>;
  /** The clue on screen: the layout is measured again when it changes. */
  clue: number;
  /**
   * Clears the field when it changes, focus kept: the count of wrong
   * guesses, so a wrong guess clears and Next clue keeps the typing (D9).
   */
  resetKey: number;
  /** The player's guess is being judged. */
  busy: boolean;
  /** Offline, or another action is in flight. */
  disabled: boolean;
  sound: boolean;
  /** The on-screen keyboard is open, with the visual viewport's bottom edge in layout coordinates. */
  keyboard: KeyboardState;
  /** Where a `clue_heading` focus request lands after a wrong guess. */
  focusTarget: boolean;
  /** Shown beside the field: Next clue while the keyboard is open. */
  beside?: ReactNode;
  /**
   * The element whose top should stay in view above the field (the current
   * clue's card) while the list is open or the keyboard is up. It must be
   * a stable function.
   */
  keepVisible?: () => HTMLElement | null;
  /** More of the field's description, such as the first-Daily hint's id. */
  describedBy?: string;
  inputRef: Ref<HTMLInputElement>;
  onGuess(entityId: EntityId): void;
  onFocusChange?(focused: boolean): void;
}

export function GuessCombobox({
  answerType,
  list,
  alreadyGuessed,
  clue,
  resetKey,
  busy,
  disabled,
  sound,
  keyboard,
  focusTarget,
  beside,
  keepVisible,
  describedBy: moreDescription,
  inputRef,
  onGuess,
  onFocusChange,
}: GuessComboboxProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const statusId = `${id}-status`;
  const noMatchesId = `${id}-no-matches`;
  const loadingId = `${id}-loading`;
  const failedId = `${id}-failed`;

  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Suggestion | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  /** Guess or Enter found nothing picked: the hint shows (R1-29). */
  const [nudged, setNudged] = useState(false);
  const [shownReset, setShownReset] = useState(resetKey);
  if (resetKey !== shownReset) {
    // A wrong guess: start afresh, without remounting, so the field keeps focus.
    setShownReset(resetKey);
    setQuery("");
    setSelection(null);
    setExpanded(false);
    setActive(-1);
    setNudged(false);
  }

  const words = MYSTERY_COPY.guess;
  const hasQuery = normalizeName(query) !== "";
  const ready = list?.status === "ready";
  const compact = keyboard.open;

  const result = useMemo<SuggestionSearch>(() => {
    if (list === null || !hasQuery || selection !== null) return NOTHING;
    if (isMysteryAnswerList(list)) return list.search(query, alreadyGuessed);
    const rows: SuggestionRow[] = list
      .suggest(query, alreadyGuessed)
      .map((row) => ({ ...row, typo: false }));
    return { rows, total: rows.length };
  }, [list, query, hasQuery, selection, alreadyGuessed]);
  const rows = result.rows;

  const searching = expanded && selection === null && hasQuery && ready;
  const listOpen = searching && rows.length > 0;
  const noMatches = searching && rows.length === 0;
  // D5: a lone selectable row is highlighted until the arrows move away.
  const lone = listOpen ? loneSelectableRow(rows, result.total) : -1;
  const current = active >= 0 ? active : lone;
  const activeRow = listOpen && current >= 0 ? rows[current] : undefined;
  /** D23: the one selectable match, highlighted, which Guess and Go take at once. */
  const loneMatch = lone >= 0 && current === lone ? activeRow : undefined;
  const optionId = (index: number) => `${id}-option-${String(index)}`;
  const locked = busy || disabled;
  const failed = list?.status === "failed";
  const loading = list?.status === "loading" && hasQuery && selection === null;
  const hintShown = nudged && selection === null && !locked;
  /** D26: more match than the list shows. */
  const moreThanShown = listOpen && result.total > rows.length;

  const countText = noMatches
    ? words.noMatches
    : listOpen
      ? moreThanShown
        ? words.countMore(answerType, result.total, rows.length)
        : words.count(answerType, result.total)
      : "";

  // Speak the count once typing settles (DESIGN §6.4).
  useEffect(() => {
    if (countText === "") return;
    const timer = setTimeout(() => {
      announce(countText);
    }, COUNT_ANNOUNCE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [countText]);

  // A list that failed to load is said once (DESIGN §6.9): the Mystery stays
  // finishable through Next clue and the four options.
  useEffect(() => {
    if (failed) announce(MYSTERY_COPY.guess.listFailed);
  }, [failed]);

  // Keep the highlighted row in view when the list scrolls.
  useEffect(() => {
    if (activeRow === undefined) return;
    const row = document.getElementById(`${id}-option-${String(current)}`);
    if (typeof row?.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [id, current, activeRow]);

  // Whenever the list opens, or the keyboard is up: scroll the field, three
  // whole rows and the top of the current clue into view, then fit the list
  // to the rows above the bottom edge (the keyboard's, else the visual
  // viewport's: R1-11). With the keyboard up, the space for those rows is
  // reserved (below), so the scroll is the same before and after the list
  // opens and is never cut short by the page ending. When the field and
  // three rows are taller than the room between the edges (large text, R1-03),
  // the field's own top is what must stay in view: the typing is what the
  // player is reading, and the list then holds the one or two rows that fit.
  const fieldRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** The list's height cap: the whole rows that fit above the bottom edge. */
  const [listMax, setListMax] = useState<string | null>(null);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const before = field?.getBoundingClientRect();
    // Nothing laid out (a hidden route, or no layout engine): nothing to keep in view.
    if ((!keyboard.open && !listOpen) || field === null || !before?.height) {
      setListMax(null);
      return;
    }
    // A row is 48 px (3rem) until names wrap, as they do at large text
    // sizes (R1-03): then its drawn height counts.
    const rowPx = ROW_HEIGHT_REM * remPx();
    const drawn = listOpen
      ? [
          ...(listRef.current?.querySelectorAll<HTMLElement>(
            '[role="option"]',
          ) ?? []),
        ].map((row) => row.getBoundingClientRect().height)
      : [];
    const rowHeight = (index: number) => drawn[index] || rowPx;
    const bottom = keyboard.open ? keyboard.bottom : viewportBottom();
    const shownRows = keyboard.open
      ? MIN_VISIBLE_ROWS
      : Math.min(MIN_VISIBLE_ROWS, rows.length);
    let block = 0;
    for (let index = 0; index < shownRows; index += 1) {
      block += rowHeight(index);
    }
    const blockBottom = before.bottom + block + LIST_CHROME_PX;
    if (blockBottom - before.top > roomBetweenEdges(bottom)) {
      keepBetween(bottom, blockBottom, before.top, "read");
    } else {
      keepBetween(
        bottom,
        blockBottom,
        keepVisible?.()?.getBoundingClientRect().top ?? before.top,
      );
    }
    // Whole rows down to the edge itself: the scroll above keeps a small
    // gap where it can, and a sub-pixel short scroll mustn't cost a row.
    const room = bottom - field.getBoundingClientRect().bottom - LIST_CHROME_PX;
    if (!drawn.some((height) => height > 0)) {
      const whole = Math.max(1, Math.floor(room / rowPx));
      setListMax(
        `calc(${String(whole * ROW_HEIGHT_REM)}rem + ${String(LIST_CHROME_PX)}px)`,
      );
      return;
    }
    let fit = rowHeight(0);
    for (
      let index = 1;
      index < drawn.length && fit + rowHeight(index) <= room + 0.5;
      index += 1
    ) {
      fit += rowHeight(index);
    }
    setListMax(`${String(Math.ceil(fit + LIST_CHROME_PX))}px`);
  }, [keyboard, listOpen, rows, clue, keepVisible]);

  // A chosen name leaves the caret at its end, so Backspace edits it; the
  // whole name shows under the field (R1-28), wherever the field scrolls.
  useLayoutEffect(() => {
    if (selection === null) return;
    const input = document.getElementById(inputId);
    if (!(input instanceof HTMLInputElement)) return;
    const end = input.value.length;
    if (document.activeElement === input) input.setSelectionRange(end, end);
  }, [selection, inputId]);

  function choose(row: Suggestion) {
    if (row.alreadyGuessed) return;
    setSelection(row);
    setQuery(row.display);
    setExpanded(false);
    setActive(-1);
    setNudged(false);
    if (sound) playEffect("suggestion_picked");
    announce(words.selected(row.display));
  }

  /** Guess or Enter with nothing picked: say how to pick (R1-29, D5). */
  function nudge() {
    if (locked) return;
    setNudged(true);
    announce(words.hint);
  }

  function submit() {
    if (selection === null || locked || selection.alreadyGuessed) return;
    onGuess(selection.entityId);
  }

  /**
   * D23: Guess, or Go, with the one match highlighted guesses it in one
   * step. The field shows the name while it is judged, as after a pick; the
   * verdict is what's said next, so the pick itself isn't announced.
   */
  function guessLone(row: Suggestion) {
    if (row.alreadyGuessed || locked) return;
    setSelection(row);
    setQuery(row.display);
    setExpanded(false);
    setActive(-1);
    setNudged(false);
    if (sound) playEffect("suggestion_picked");
    onGuess(row.entityId);
  }

  /** Guess pressed: the selection, else the one highlighted match (D23), else how to pick. */
  function pressGuess() {
    if (selection !== null) submit();
    else if (loneMatch !== undefined) guessLone(loneMatch);
    else nudge();
  }

  function clear() {
    setQuery("");
    setSelection(null);
    setExpanded(false);
    setActive(-1);
  }

  function exactRow(): Suggestion | null {
    if (list === null || !ready) return null;
    if (isMysteryAnswerList(list))
      return list.exactMatch(query, alreadyGuessed);
    // A plain handle: only a lone row whose display reads as the text.
    const target = normalizeName(query);
    const exact = rows.filter((row) => normalizeName(row.display) === target);
    return exact.length === 1 ? (exact[0] ?? null) : null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (rows.length === 0) {
          if (hasQuery && selection === null) setExpanded(true);
          return;
        }
        if (!listOpen) {
          setExpanded(true);
          setActive(0);
          return;
        }
        setActive((current + 1) % rows.length);
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (!listOpen) return;
        setActive(current <= 0 ? rows.length - 1 : current - 1);
        return;
      }
      case "Enter": {
        event.preventDefault();
        if (locked) return;
        // With the on-screen keyboard up, Enter is its Go key, which guesses
        // the one highlighted match like Guess does (D23); a hardware Enter
        // keeps D5's pick, then submit.
        if (loneMatch !== undefined && keyboard.open) {
          guessLone(loneMatch);
          return;
        }
        if (activeRow !== undefined) {
          choose(activeRow);
          return;
        }
        if (selection !== null) {
          submit();
          return;
        }
        const exact = exactRow();
        if (exact !== null && !exact.alreadyGuessed) {
          choose(exact);
          return;
        }
        // Namesakes or nothing: the list stays open to pick from, and the
        // hint says how.
        if (hasQuery) setExpanded(true);
        nudge();
        return;
      }
      case "Escape": {
        if (listOpen || noMatches) {
          event.preventDefault();
          setExpanded(false);
          setActive(-1);
        } else if (query !== "") {
          event.preventDefault();
          clear();
        }
        return;
      }
      case "Tab":
        setExpanded(false);
        setActive(-1);
        return;
      default:
        return;
    }
  }

  const plural = MYSTERY_COPY.guess.listLabel(answerType, query.trim());
  const placeholder = words.placeholder(answerType);
  const describedBy = [
    hintId,
    moreDescription ?? null,
    noMatches ? noMatchesId : listOpen ? statusId : null,
    loading ? loadingId : null,
    failed ? failedId : null,
  ]
    .filter((part) => part !== null)
    .join(" ");

  return (
    <div
      className={cx(
        "@container/guess relative",
        // The field and three whole rows, which the list opens into, and a
        // little room under them, so the page can scroll that far.
        compact && "min-h-[calc(3.625rem+9rem+26px)]",
      )}
      data-combobox=""
      data-keyboard={compact ? "open" : undefined}
    >
      {/*
        One grid for both layouts. Wide: the field's frame spans the field
        and Guess, which sits inside its right edge, with Next clue beside
        while the keyboard is up; the list hangs from the frame, then the
        notes. Narrow (R1-03): one column, so the field takes the row, the
        list and the notes follow, then Guess on a row of its own, and Next
        clue on the next one when it is there: two buttons that can't share
        a row stack (DESIGN §10.2). Focus order stays field, Guess, Next clue.
      */}
      <div
        className={cx(
          "group/field grid items-center gap-x-2 @max-[18em]/guess:grid-cols-[minmax(0,1fr)]",
          beside === undefined
            ? "grid-cols-[minmax(0,1fr)_auto]"
            : "grid-cols-[minmax(0,1fr)_auto_auto]",
        )}
      >
        {/* The field's frame: border, fill and focus ring, behind the field and Guess. */}
        <div
          ref={fieldRef}
          aria-hidden="true"
          data-field-frame=""
          className={cx(
            "pointer-events-none col-start-1 col-end-3 row-start-1 self-stretch rounded-2xl border-2 outline-offset-[3px] group-has-[input:focus-visible]/field:outline-[3px] group-has-[input:focus-visible]/field:outline-[color:var(--kn-focus,var(--foreground))] @max-[18em]/guess:col-end-[-1]",
            TONE.surface,
            TONE.inkBorder,
            listOpen && "rounded-b-none",
            disabled && "opacity-80",
          )}
        />
        <div
          data-field=""
          className={cx(
            "relative col-start-1 row-start-1 flex h-[3.625rem] min-w-0 items-center @max-[18em]/guess:col-end-[-1]",
            disabled && "opacity-80",
          )}
        >
          {compact ? null : (
            // A narrow field gives the icon's room to the text (R1-03, D14).
            <SearchIcon
              size={22}
              className={cx(
                "ml-3 shrink-0 @max-[18em]/guess:hidden",
                TONE.ink2,
              )}
            />
          )}
          <div className="relative h-full min-w-0 flex-1">
            <label
              htmlFor={inputId}
              className={cx(
                "pointer-events-none absolute top-1.5 right-1 left-2.5 truncate text-xs font-bold whitespace-nowrap",
                TONE.ink3,
              )}
            >
              {words.label}
            </label>
            {query === "" ? (
              // A narrow field's placeholder: it wraps onto a second line
              // rather than lose its noun (D14). The input's own, which
              // assistive tech reads, is transparent there.
              <span
                aria-hidden="true"
                data-placeholder=""
                className={cx(
                  "pointer-events-none absolute inset-x-0 top-[1.375rem] bottom-1 hidden items-center overflow-hidden pr-1 pl-2.5 text-xs leading-tight font-semibold @max-[18em]/guess:flex",
                  TONE.ink2,
                )}
              >
                {placeholder}
              </span>
            ) : null}
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              aria-expanded={listOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                activeRow === undefined ? undefined : optionId(current)
              }
              aria-describedby={describedBy}
              aria-disabled={disabled || undefined}
              {...focusTargetProps(focusTarget ? "clue_heading" : null)}
              readOnly={locked}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="go"
              placeholder={placeholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelection(null);
                setExpanded(true);
                setActive(-1);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => {
                // Back in a field that kept its typing (D9): its list comes back.
                if (hasQuery && selection === null) setExpanded(true);
                onFocusChange?.(true);
              }}
              onBlur={() => {
                setExpanded(false);
                setActive(-1);
                onFocusChange?.(false);
              }}
              className={cx(
                // The placeholder is set smaller than the typed name, so the
                // longest short noun (D14) fits beside Guess at 360 px; a
                // narrow field draws its own, which can wrap (above).
                "absolute inset-0 w-full truncate rounded-none border-0 bg-transparent pt-[1.375rem] pr-1 pb-1 pl-2.5 text-[1.1875rem] font-bold outline-none placeholder:text-[0.9375rem] placeholder:font-semibold @max-[18em]/guess:placeholder:text-transparent",
                TONE.ink,
              )}
            />
          </div>
          {query !== "" && !locked && !compact ? (
            <button
              type="button"
              aria-label={words.clear}
              onMouseDown={keepFieldFocus}
              onClick={clear}
              className={cx(
                "grid size-11 shrink-0 place-items-center rounded-full outline-offset-[-2px] focus-visible:outline-[3px] focus-visible:outline-[color:var(--kn-focus,var(--foreground))] @max-[18em]/guess:hidden",
                TONE.ink2,
              )}
            >
              <ClearIcon size={20} />
            </button>
          ) : null}
        </div>
        <Button
          variant="primary"
          size="small"
          // Ready with a pick, or with the one match highlighted (D23).
          disabled={(selection === null && loneMatch === undefined) || disabled}
          focusableWhenDisabled
          busy={busy}
          // The label holds still while busy; "Checking…" shows under the field.
          slowLabel={words.button}
          onMouseDown={keepFieldFocus}
          // A press with nothing to guess says how to pick (R1-29); the
          // button's own click is blocked while it's disabled.
          onClickCapture={() => {
            if (selection === null && loneMatch === undefined) nudge();
          }}
          onClick={pressGuess}
          data-guess=""
          // The marked utilities override the variant's own (cx doesn't
          // merge them), so Guess stays small inside the field, and takes
          // a whole row of its own when the field is narrow.
          className="col-start-2 row-start-1 mr-1.5 min-h-11! shrink-0 rounded-[11px]! px-3.5! text-base! @max-[18em]/guess:col-start-1 @max-[18em]/guess:col-end-[-1] @max-[18em]/guess:row-start-4 @max-[18em]/guess:mt-2 @max-[18em]/guess:mr-0 @max-[18em]/guess:min-h-12! @max-[18em]/guess:w-full"
        >
          {words.button}
        </Button>
        {beside === undefined ? null : (
          <div
            data-beside=""
            className="col-start-3 row-start-1 flex self-stretch @max-[18em]/guess:col-start-1 @max-[18em]/guess:col-end-[-1] @max-[18em]/guess:row-start-5 @max-[18em]/guess:mt-2 @max-[18em]/guess:*:flex-1"
          >
            {beside}
          </div>
        )}

        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={plural}
          hidden={!listOpen}
          style={listMax === null ? undefined : { maxHeight: listMax }}
          className={cx(
            // Every column: under Next clue too while it sits beside the
            // field, so the rows keep the row's whole width (AC-DLY-32).
            "z-[3] col-start-1 col-end-[-1] row-start-2 overflow-y-auto rounded-b-2xl border-2 border-t-0 p-1",
            TONE.surface,
            TONE.inkBorder,
            TONE.ledgeTall,
          )}
        >
          {rows.map((row, index) => {
            const isActive = index === current;
            const { name, aside, asideStart } = splitDisplay(
              row.display,
              answerType,
            );
            // Full ink on the highlight's or the hover's tint, where the
            // secondary ink falls short of 4.5:1 (WCAG 1.4.3).
            const quiet = cx(
              isActive ? TONE.ink : TONE.ink2,
              !row.alreadyGuessed &&
                "group-hover/row:text-[color:var(--kn-ink,var(--foreground))]",
            );
            return (
              <li
                key={row.entityId}
                id={optionId(index)}
                role="option"
                // The row's name, said as it is written: "The Broken
                // Lighthouse, 1972". Left to the row's own parts, each a
                // box of its own, it read "The Broken Lighthouse , 1972"
                // (R4-17).
                aria-label={[
                  name,
                  row.alreadyGuessed ? words.alreadyGuessed : aside,
                  row.typo ? words.typo : null,
                ]
                  .filter((part) => part !== null)
                  .join(", ")}
                aria-selected={isActive}
                aria-disabled={row.alreadyGuessed || undefined}
                data-entity={row.entityId}
                data-typo={row.typo ? "" : undefined}
                onMouseDown={keepFieldFocus}
                onClick={() => {
                  choose(row);
                }}
                className={cx(
                  // A narrow field's rows give their padding to the name,
                  // so a long word fits whole ("Lighthouse" at 320 px and
                  // 200% text).
                  "group/row relative flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[11px] py-1.5 pr-2.5 pl-3 text-lg select-none @max-[18em]/guess:pr-1.5 @max-[18em]/guess:pl-2.5",
                  index > 0 &&
                    !isActive &&
                    "shadow-[0_-1px_0_0_var(--kn-rule,var(--border))]",
                  isActive &&
                    cx(
                      TONE.accentTint,
                      // Forced colours drop the tint: an outline marks the row.
                      "forced-colors:outline-2 forced-colors:-outline-offset-2 forced-colors:outline-[color:Highlight]",
                    ),
                  row.alreadyGuessed
                    ? cx("cursor-not-allowed", TONE.ink3)
                    : "hover:bg-[color:var(--kn-surface-2,var(--muted))]",
                )}
              >
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className={cx(
                      "absolute top-2.5 bottom-2.5 left-[3px] w-1 rounded-sm forced-colors:bg-[color:Highlight] forced-colors:forced-color-adjust-none",
                      TONE.accentBar,
                    )}
                  />
                ) : null}
                {answerType === null ? null : (
                  // A narrow field gives the icon's room to the name.
                  <AnswerTypeIcon
                    type={answerType}
                    size={20}
                    className={cx(
                      "shrink-0 @max-[18em]/guess:hidden",
                      TONE.ink3,
                    )}
                  />
                )}
                {/* One line: the name truncates before the qualifier and the
                    marks do. When the field is narrow (R1-03) the name
                    wraps instead, and the qualifier sits under it. */}
                <span className="flex min-w-0 flex-1 items-center gap-x-2.5 gap-y-0.5 leading-snug @max-[18em]/guess:flex-wrap @max-[18em]/guess:items-baseline">
                  <span
                    data-row-name=""
                    className="min-w-0 truncate @max-[18em]/guess:overflow-visible @max-[18em]/guess:break-words @max-[18em]/guess:whitespace-normal"
                  >
                    <Highlighted text={name} offset={0} match={row.match} />
                  </span>
                  {row.alreadyGuessed ? (
                    <>
                      {" "}
                      <span className="ml-auto shrink-0 text-sm font-semibold whitespace-nowrap @max-[18em]/guess:ml-0 @max-[18em]/guess:basis-full @max-[18em]/guess:whitespace-normal">
                        {words.alreadyGuessed}
                      </span>
                    </>
                  ) : aside === null ? null : (
                    <>
                      {" "}
                      <span
                        data-row-aside=""
                        className={cx(
                          "ml-auto max-w-[45%] shrink-0 truncate text-right text-sm font-semibold @max-[18em]/guess:ml-0 @max-[18em]/guess:max-w-full @max-[18em]/guess:basis-full @max-[18em]/guess:overflow-visible @max-[18em]/guess:text-left @max-[18em]/guess:break-words @max-[18em]/guess:whitespace-normal",
                          quiet,
                        )}
                      >
                        <Highlighted
                          text={aside}
                          offset={asideStart}
                          match={row.match}
                        />
                      </span>
                    </>
                  )}
                  {row.typo ? (
                    <>
                      {" "}
                      <span
                        data-typo-mark=""
                        className={cx(
                          "shrink-0 rounded-full border border-dashed px-2 text-xs leading-[1.4] font-bold whitespace-nowrap @max-[18em]/guess:max-w-full @max-[18em]/guess:whitespace-normal forced-colors:border-[color:CanvasText]",
                          aside === null &&
                            !row.alreadyGuessed &&
                            "ml-auto @max-[18em]/guess:ml-0",
                          TONE.strongBorder,
                          quiet,
                        )}
                      >
                        {words.typo}
                      </span>
                    </>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        <div
          data-guess-notes=""
          className="col-start-1 col-end-[-1] row-start-3"
        >
          {moreThanShown ? (
            // D26: right under the list, so nobody hunts for a seventh row.
            // The count says it in full to screen readers already.
            <p
              aria-hidden="true"
              data-showing=""
              className={cx("mt-2 text-[0.9375rem] font-semibold", TONE.ink2)}
            >
              {words.showing(rows.length)}
            </p>
          ) : null}
          {/* The field's description, shown once Guess or Enter finds nothing picked. */}
          <p
            id={hintId}
            data-hint={hintShown ? "shown" : undefined}
            className={
              hintShown
                ? cx("mt-2 text-[0.9375rem] font-semibold", TONE.ink)
                : "sr-only"
            }
          >
            {words.hint}
          </p>
          {/* The count, for the field's description; "No matches" is visible already. */}
          <p id={statusId} className="sr-only">
            {listOpen ? countText : ""}
          </p>
          {selection === null ? null : (
            // The field says it already; this is for eyes the field cut short.
            <p
              aria-hidden="true"
              data-pick=""
              className={cx(
                "mt-2 text-[0.9375rem] leading-snug font-semibold break-words",
                TONE.ink2,
              )}
            >
              {words.pickLead}{" "}
              <strong className={TONE.ink}>{selection.display}</strong>
            </p>
          )}
          {noMatches ? (
            <p
              id={noMatchesId}
              className={cx("mt-2 text-[0.9375rem] font-semibold", TONE.ink2)}
            >
              {words.noMatches}
            </p>
          ) : null}
          {loading ? (
            <p
              id={loadingId}
              className={cx("mt-2 text-[0.9375rem]", TONE.ink2)}
            >
              {words.listLoading}
            </p>
          ) : null}
          {failed ? (
            <div className={cx("mt-2 text-[0.9375rem]", TONE.ink2)}>
              <p id={failedId}>{words.listFailed}</p>
              {isMysteryAnswerList(list) ? (
                <Button
                  variant="text"
                  onMouseDown={keepFieldFocus}
                  onClick={() => {
                    list.retry();
                  }}
                >
                  {MYSTERY_COPY.errors.retry}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
