"use client";

/**
 * The guess combobox (PRD §3.1.4, §3.12.3, §4.1.3; DESIGN §6.4): the ARIA
 * 1.2 combobox pattern with a listbox popup.
 *
 * - Suggestions come from the device's copy of the closed list as the
 *   player types, from the first character; nothing is sent per keystroke.
 *   Rows show the display form with the typed letters in bold, a
 *   disambiguation at the right ("cartographer", "1995", "France"), and
 *   already-guessed entities stay listed, disabled, "Already guessed".
 * - Arrow keys move the highlight (`aria-activedescendant`), Enter on a
 *   highlighted row selects it, Escape closes the list (then clears the
 *   field), and Tab leaves. With nothing highlighted, Enter selects the one
 *   entity whose name or alias equals the text exactly, and nothing for
 *   namesakes or no match (AC-SUG-05). With a selection in place, Enter
 *   submits. Editing the text clears the selection, and Guess stays
 *   disabled until there is one.
 * - The count is announced on each change ("4 people match"), a moment
 *   after typing settles, so screen readers aren't flooded.
 * - Guess, Clear and the rows keep focus in the field on touch (they cancel
 *   the pointer-down blur), so the keyboard stays up after a wrong guess.
 * - With the on-screen keyboard open, the list holds only whole rows that
 *   fit above it, and Next clue can sit beside the field (`beside`).
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

import { normalizeName } from "@/engine/suggest";
import type { AnswerType, EntityId } from "@/engine/types";
import { playEffect } from "@/platform/sound";
import { announce } from "@/ui/announce";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";

import { isMysteryAnswerList, type SuggestionSearch } from "../answer-list";
import type { AnswerListHandle, Suggestion } from "../contracts";
import { MYSTERY_COPY } from "./copy";
import { AnswerTypeIcon, ClearIcon, SearchIcon } from "./icons";
import { TONE } from "./tones";

/** DESIGN §4: suggestion rows are 48 px. */
export const ROW_HEIGHT = 48;
/** AC-DLY-32: at least three whole rows stay visible with the keyboard up. */
export const MIN_VISIBLE_ROWS = 3;
/** Typing settles this long before the count is spoken. */
export const COUNT_ANNOUNCE_DELAY_MS = 450;

const NOTHING: SuggestionSearch = { rows: [], total: 0 };

/** Keeps focus where it is when a control is pressed: the field and its keyboard stay up. */
const keepFocus = (event: MouseEvent) => {
  event.preventDefault();
};

/** Types whose display ends ", Country" (CONTENT_GUIDE §2.10). */
const COUNTRY_SUFFIXED: ReadonlySet<AnswerType> = new Set(["city", "landmark"]);

/**
 * The row's two parts: the name, and the disambiguation at the right
 * (DESIGN §6.4). A trailing bracket is the qualifier ("Ada Morrow
 * (cartographer)", "Heat (1995)"); for cities and landmarks the country
 * after the last comma is ("Paris, France"). A comma in any other name
 * ("Earth, Wind & Fire") is part of the name.
 */
export function splitDisplay(
  display: string,
  type: AnswerType | null,
): { name: string; aside: string | null } {
  const bracket = /^(.*\S)\s+\(([^()]+)\)$/.exec(display);
  if (bracket?.[1] !== undefined && bracket[2] !== undefined) {
    return { name: bracket[1], aside: bracket[2] };
  }
  const comma = display.lastIndexOf(", ");
  if (type !== null && COUNTRY_SUFFIXED.has(type) && comma > 0) {
    return { name: display.slice(0, comma), aside: display.slice(comma + 2) };
  }
  return { name: display, aside: null };
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
      <mark className="bg-transparent font-extrabold text-inherit">
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
  /** The clue on screen; a new one clears the field, which keeps focus. */
  clue: number;
  /** The player's guess is being judged. */
  busy: boolean;
  /** Offline, or another action is in flight. */
  disabled: boolean;
  sound: boolean;
  /** The on-screen keyboard is open, with the visual viewport's bottom edge in layout coordinates. */
  keyboard: { open: boolean; bottom: number };
  /** Where a `clue_heading` focus request lands after a wrong guess. */
  focusTarget: boolean;
  /** Shown beside the field: Next clue while the keyboard is open. */
  beside?: ReactNode;
  inputRef: Ref<HTMLInputElement>;
  onGuess(entityId: EntityId): void;
  onFocusChange?(focused: boolean): void;
}

export function GuessCombobox({
  answerType,
  list,
  alreadyGuessed,
  clue,
  busy,
  disabled,
  sound,
  keyboard,
  focusTarget,
  beside,
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

  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Suggestion | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const [shownClue, setShownClue] = useState(clue);
  if (clue !== shownClue) {
    // A new clue: start afresh, without remounting, so the field keeps focus.
    setShownClue(clue);
    setQuery("");
    setSelection(null);
    setExpanded(false);
    setActive(-1);
  }

  const words = MYSTERY_COPY.guess;
  const hasQuery = normalizeName(query) !== "";
  const ready = list?.status === "ready";

  const result = useMemo<SuggestionSearch>(() => {
    if (list === null || !hasQuery || selection !== null) return NOTHING;
    if (isMysteryAnswerList(list)) return list.search(query, alreadyGuessed);
    const rows = list.suggest(query, alreadyGuessed);
    return { rows, total: rows.length };
  }, [list, query, hasQuery, selection, alreadyGuessed]);
  const rows = result.rows;

  const searching = expanded && selection === null && hasQuery && ready;
  const listOpen = searching && rows.length > 0;
  const noMatches = searching && rows.length === 0;
  const activeRow = listOpen && active >= 0 ? rows[active] : undefined;
  const optionId = (index: number) => `${id}-option-${String(index)}`;
  const locked = busy || disabled;

  const countText = noMatches
    ? words.noMatches
    : listOpen
      ? words.count(answerType, result.total)
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

  // Keep the highlighted row in view when the list scrolls.
  useEffect(() => {
    if (activeRow === undefined) return;
    const row = document.getElementById(`${id}-option-${String(active)}`);
    if (typeof row?.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [id, active, activeRow]);

  // With the keyboard up, the list holds whole rows that fit above it.
  const listRef = useRef<HTMLUListElement>(null);
  const [maxRows, setMaxRows] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!keyboard.open || element === null) {
      setMaxRows(null);
      return;
    }
    const room = keyboard.bottom - element.getBoundingClientRect().top - 8;
    setMaxRows(Math.max(MIN_VISIBLE_ROWS, Math.floor(room / ROW_HEIGHT)));
  }, [keyboard.open, keyboard.bottom, listOpen, rows.length]);

  function choose(row: Suggestion) {
    if (row.alreadyGuessed) return;
    setSelection(row);
    setQuery(row.display);
    setExpanded(false);
    setActive(-1);
    if (sound) playEffect("suggestion_picked");
    announce(words.selected(row.display));
  }

  function submit() {
    if (selection === null || locked || selection.alreadyGuessed) return;
    onGuess(selection.entityId);
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
        setActive((a) => (a + 1) % rows.length);
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (!listOpen) return;
        setActive((a) => (a <= 0 ? rows.length - 1 : a - 1));
        return;
      }
      case "Enter": {
        event.preventDefault();
        if (locked) return;
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
        // Namesakes or nothing: the list stays open to pick from.
        if (hasQuery) setExpanded(true);
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

  const failed = list?.status === "failed";
  const loading = list?.status === "loading" && hasQuery && selection === null;
  const plural = MYSTERY_COPY.guess.listLabel(answerType, query.trim());

  return (
    <div
      className="relative"
      data-combobox=""
      data-keyboard={keyboard.open ? "open" : undefined}
    >
      <div className="flex items-stretch gap-2">
        <div
          className={cx(
            "relative flex h-[58px] min-w-0 flex-1 items-center rounded-2xl border-2 outline-offset-2 has-[input:focus-visible]:outline-[3px] has-[input:focus-visible]:outline-[color:color-mix(in_oklab,var(--kn-play-accent,var(--foreground))_50%,transparent)]",
            TONE.surface,
            TONE.inkBorder,
            listOpen && "rounded-b-none",
            disabled && "opacity-80",
          )}
        >
          <SearchIcon size={22} className={cx("ml-3", TONE.ink2)} />
          <div className="relative h-full min-w-0 flex-1">
            <label
              htmlFor={inputId}
              className={cx(
                "pointer-events-none absolute top-1.5 left-2.5 text-xs font-bold",
                TONE.ink3,
              )}
            >
              {words.label}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              aria-expanded={listOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                activeRow === undefined ? undefined : optionId(active)
              }
              aria-describedby={`${hintId} ${noMatches ? noMatchesId : statusId}`}
              aria-disabled={disabled || undefined}
              data-focus-target={focusTarget ? "clue_heading" : undefined}
              readOnly={locked}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="go"
              placeholder={words.placeholder(answerType)}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelection(null);
                setExpanded(true);
                setActive(-1);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => onFocusChange?.(true)}
              onBlur={() => {
                setExpanded(false);
                setActive(-1);
                onFocusChange?.(false);
              }}
              className={cx(
                "absolute inset-0 w-full truncate rounded-none border-0 bg-transparent pt-[22px] pr-1 pb-1 pl-2.5 text-[19px] font-bold outline-none placeholder:font-semibold placeholder:opacity-60",
                TONE.ink,
              )}
            />
          </div>
          {query !== "" && !locked ? (
            <button
              type="button"
              aria-label={words.clear}
              onMouseDown={keepFocus}
              onClick={clear}
              className={cx(
                "grid size-11 shrink-0 place-items-center rounded-full outline-offset-[-2px] focus-visible:outline-[3px] focus-visible:outline-[color:var(--kn-focus,var(--foreground))]",
                TONE.ink2,
              )}
            >
              <ClearIcon size={20} />
            </button>
          ) : null}
          <Button
            variant="primary"
            size="small"
            disabled={selection === null || disabled}
            focusableWhenDisabled
            busy={busy}
            onMouseDown={keepFocus}
            onClick={submit}
            className="mr-1.5 min-h-11 shrink-0 rounded-[11px] px-3.5 text-base"
          >
            {words.button}
          </Button>
        </div>
        {beside}
      </div>

      <p id={hintId} className="sr-only">
        {words.hint}
      </p>
      {/* The count, for the field's description; "No matches" is visible already. */}
      <p id={statusId} className="sr-only">
        {listOpen ? countText : ""}
      </p>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={plural}
        hidden={!listOpen}
        style={
          maxRows === null ? undefined : { maxHeight: maxRows * ROW_HEIGHT + 8 }
        }
        className={cx(
          "z-[3] overflow-y-auto rounded-b-2xl border-2 border-t-0 p-1",
          TONE.surface,
          TONE.inkBorder,
          TONE.ledgeTall,
          beside !== undefined && beside !== null && "mr-0",
        )}
      >
        {rows.map((row, index) => {
          const isActive = index === active;
          const { name, aside } = splitDisplay(row.display, answerType);
          const asideOffset = row.display.length - (aside?.length ?? 0);
          return (
            <li
              key={row.entityId}
              id={optionId(index)}
              role="option"
              aria-selected={isActive}
              aria-disabled={row.alreadyGuessed || undefined}
              data-entity={row.entityId}
              onMouseDown={keepFocus}
              onClick={() => {
                choose(row);
              }}
              className={cx(
                "relative flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[11px] pr-2.5 pl-3 text-lg select-none",
                index > 0 &&
                  !isActive &&
                  "shadow-[0_-1px_0_0_var(--kn-rule,var(--border))]",
                isActive && TONE.accentTint,
                row.alreadyGuessed
                  ? cx("cursor-not-allowed", TONE.ink3)
                  : "hover:bg-[color:var(--kn-surface-2,var(--muted))]",
              )}
            >
              {isActive ? (
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute top-2.5 bottom-2.5 left-[3px] w-1 rounded-sm",
                    TONE.accentBar,
                  )}
                />
              ) : null}
              {answerType === null ? null : (
                <AnswerTypeIcon
                  type={answerType}
                  size={20}
                  className={TONE.ink3}
                />
              )}
              <span className="min-w-0 flex-1 truncate">
                <Highlighted text={name} offset={0} match={row.match} />
              </span>
              {row.alreadyGuessed ? (
                <>
                  <span className="sr-only">,</span>{" "}
                  <span className="shrink-0 text-sm font-semibold">
                    {words.alreadyGuessed}
                  </span>
                </>
              ) : aside === null ? null : (
                <>
                  <span className="sr-only">,</span>{" "}
                  <span
                    className={cx(
                      "max-w-[45%] shrink-0 truncate text-sm font-semibold",
                      TONE.ink2,
                    )}
                  >
                    <Highlighted
                      text={aside}
                      offset={asideOffset}
                      match={row.match}
                    />
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {noMatches ? (
        <p
          id={noMatchesId}
          className={cx("mt-2 text-[15px] font-semibold", TONE.ink2)}
        >
          {words.noMatches}
        </p>
      ) : null}
      {loading ? (
        <p className={cx("mt-2 text-[15px]", TONE.ink2)}>{words.listLoading}</p>
      ) : null}
      {failed ? (
        <div className={cx("mt-2 text-[15px]", TONE.ink2)}>
          <p>{words.listFailed}</p>
          {isMysteryAnswerList(list) ? (
            <Button
              variant="text"
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
  );
}
