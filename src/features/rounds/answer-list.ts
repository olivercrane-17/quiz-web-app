/**
 * The Mystery's answer list as the guess combobox uses it (ARCHITECTURE
 * §4.4.3 `AnswerListHandle`, §4.7): the suggestion engine over one closed
 * list, with its load status.
 *
 * - `answerListFor(type)` is the current handle for a type (an immutable
 *   snapshot: a new object whenever the status changes), and starts the
 *   load the first time anyone asks. `useAnswerList(type)` re-renders on
 *   each change; `preloadAnswerLists(types)` warms the lists a Daily needs
 *   at start (PRD §3.1.3).
 * - Lists are global and never filtered per Daily (PRD §3.18.4), so one
 *   handle per type serves every round and mode.
 * - A failed load reads `failed`, and the Mystery stays finishable through
 *   Next clue and the options (PRD §4.1.3 step 8); `retry()` tries again.
 *
 * Beyond the contract, the handle offers `search` (the rows plus how many
 * entities match, for the count announcement, each row saying whether only
 * a typo matched it, so the combobox can mark it, R1-37) and `exactMatch`
 * (Enter with nothing highlighted, PRD §4.1.3 step 6). `isMysteryAnswerList`
 * tells a round whether a handle it was given has them.
 *
 * Nothing here is a "use client" module: the hook only ever runs in client
 * islands, and the rest is plain TypeScript.
 */
import { useCallback, useSyncExternalStore } from "react";

import { SUGGESTION_COUNT } from "@/config/tunables";
import { loadAnswerList } from "@/content/loaders/answer-lists";
import {
  createSuggestionIndex,
  exactMatch,
  suggest,
  type SuggestionIndex,
} from "@/engine/suggest";
import type { AnswerList, AnswerType, EntityId } from "@/engine/types";

import type { AnswerListHandle, Suggestion } from "./contracts";

/** A suggestion row as `search` returns it. */
export interface SuggestionRow extends Suggestion {
  /** Only a typo matched it (PRD §4.1.3 step 3): the last tier, marked in the list. */
  typo: boolean;
}

export interface SuggestionSearch {
  /** At most SUGGESTION_COUNT rows, ranked. */
  rows: SuggestionRow[];
  /** Every matching entity, of which `rows` are the first. */
  total: number;
}

export interface MysteryAnswerList extends AnswerListHandle {
  /** The list's answer type; null for a handle made from a list in memory without one. */
  readonly type: AnswerType | null;
  search(
    query: string,
    alreadyGuessed: ReadonlySet<EntityId>,
  ): SuggestionSearch;
  /** The single entity whose name or alias equals the normalized text, else null (namesakes, nothing). */
  exactMatch(
    query: string,
    alreadyGuessed: ReadonlySet<EntityId>,
  ): Suggestion | null;
  /** After a failed load, tries again. */
  retry(): void;
}

export function isMysteryAnswerList(
  list: AnswerListHandle | null,
): list is MysteryAnswerList {
  return (
    list !== null &&
    typeof (list as Partial<MysteryAnswerList>).search === "function" &&
    typeof (list as Partial<MysteryAnswerList>).exactMatch === "function"
  );
}

const NONE: SuggestionSearch = Object.freeze({ rows: [], total: 0 });

function emptyHandle(
  status: "loading" | "failed",
  type: AnswerType | null,
  retry: () => void,
): MysteryAnswerList {
  return Object.freeze({
    status,
    type,
    suggest: () => [],
    search: () => NONE,
    exactMatch: () => null,
    retry,
  });
}

function readyHandle(
  index: SuggestionIndex,
  type: AnswerType | null,
): MysteryAnswerList {
  const search = (
    query: string,
    alreadyGuessed: ReadonlySet<EntityId>,
  ): SuggestionSearch => {
    const { rows, total } = suggest(index, query, {
      limit: SUGGESTION_COUNT,
      alreadyGuessed,
    });
    return {
      total,
      rows: rows.map(
        ({ entityId, display, alreadyGuessed: guessed, match, tier }) => ({
          entityId,
          display,
          alreadyGuessed: guessed,
          match,
          typo: tier === "typo",
        }),
      ),
    };
  };
  return Object.freeze({
    status: "ready" as const,
    type,
    search,
    // The contract's rows: a Suggestion is exactly these four fields.
    suggest: (query: string, alreadyGuessed: ReadonlySet<EntityId>) =>
      search(query, alreadyGuessed).rows.map(
        ({ entityId, display, alreadyGuessed: guessed, match }) => ({
          entityId,
          display,
          alreadyGuessed: guessed,
          match,
        }),
      ),
    exactMatch(query: string, alreadyGuessed: ReadonlySet<EntityId>) {
      const entity = exactMatch(index, query);
      if (entity === null) return null;
      const row = search(query, alreadyGuessed).rows.find(
        (r) => r.entityId === entity.id,
      );
      return (
        row ?? {
          entityId: entity.id,
          display: entity.display,
          alreadyGuessed: alreadyGuessed.has(entity.id),
          match: null,
        }
      );
    },
    retry: () => undefined,
  });
}

/** A ready handle over a list already in memory: fixtures, previews and tests. */
export function answerListHandleOf(list: AnswerList): MysteryAnswerList {
  return readyHandle(createSuggestionIndex(list), list.type);
}

const IDLE = new Map<AnswerType, MysteryAnswerList>();

/** One shared loading snapshot per type. */
function idleHandle(type: AnswerType): MysteryAnswerList {
  let handle = IDLE.get(type);
  if (handle === undefined) {
    handle = emptyHandle("loading", type, () => undefined);
    IDLE.set(type, handle);
  }
  return handle;
}

interface Entry {
  handle: MysteryAnswerList;
  listeners: Set<() => void>;
  loading: boolean;
}

const entries = new Map<AnswerType, Entry>();

function notify(entry: Entry): void {
  for (const listener of [...entry.listeners]) listener();
}

function load(type: AnswerType, entry: Entry): void {
  if (entry.loading) return;
  entry.loading = true;
  void loadAnswerList(type).then((result) => {
    entry.loading = false;
    entry.handle = result.ok
      ? readyHandle(createSuggestionIndex(result.value), type)
      : emptyHandle("failed", type, () => {
          entry.handle = emptyHandle("loading", type, () => undefined);
          notify(entry);
          load(type, entry);
        });
    notify(entry);
  });
}

function entryFor(type: AnswerType): Entry {
  let entry = entries.get(type);
  if (entry === undefined) {
    const created: Entry = {
      // The same loading snapshot prerendering saw, so hydration changes nothing.
      handle: idleHandle(type),
      listeners: new Set(),
      loading: false,
    };
    entries.set(type, created);
    load(type, created);
    entry = created;
  }
  return entry;
}

/** The current handle for a type; the first ask starts its load. */
export function answerListFor(type: AnswerType): MysteryAnswerList {
  return entryFor(type).handle;
}

/** Starts loading every list a run needs, so the first keystroke finds it ready. */
export function preloadAnswerLists(
  types: readonly (AnswerType | null)[],
): void {
  for (const type of types) if (type !== null) entryFor(type);
}

/** Calls `listener` whenever the type's handle changes. */
export function subscribeAnswerList(
  type: AnswerType,
  listener: () => void,
): () => void {
  const entry = entryFor(type);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/**
 * The hook's handle for a type: the store's, or before anything asked for
 * the type, the shared loading snapshot that prerendering also sees.
 */
function snapshotFor(type: AnswerType | null): MysteryAnswerList | null {
  if (type === null) return null;
  return entries.get(type)?.handle ?? idleHandle(type);
}

/**
 * The handle for a Mystery's answer type, re-rendering as it loads; null for
 * a round without one. The load starts when the island subscribes, after
 * mount, never during render or prerendering.
 */
export function useAnswerList(
  type: AnswerType | null,
): MysteryAnswerList | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      type === null ? () => undefined : subscribeAnswerList(type, listener),
    [type],
  );
  return useSyncExternalStore(
    subscribe,
    () => snapshotFor(type),
    () => (type === null ? null : idleHandle(type)),
  );
}

/** Tests only: forgets every list, so each test starts cold. */
export function resetAnswerListsForTests(): void {
  entries.clear();
}
