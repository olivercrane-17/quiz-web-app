/**
 * Sealed-payload assertions on the mock backend (ARCHITECTURE §11.4, PRD
 * AC-DLY-03, AC-DLY-04, AC-ARC-04). The mock logs every result it hands the
 * page; `expectSealedPayloads(page)` replays that log against the fixture
 * content of the attempts this page played and fails on anything a round
 * gave away before it resolved:
 *
 * - a Mystery's answer, accepted or distractor ids, the answer's name or any
 *   alias (as whole words after normalizeName; once the options are issued
 *   they may name it among three others), a clue not yet issued, or its
 *   explanation;
 * - an Encore's value (by value in numeric fields, as a whole formatted
 *   token in text) or its explanation;
 * - a choice question's explanation;
 * - any sealed content id, ever.
 *
 * It also checks the shape of every Mystery the page was shown: the clues
 * issued match the clue number, options appear only from clue
 * `optionsFromClue` on, and each option is exactly { index, label,
 * alreadyGuessed }, so nothing marks the key. The log covers the page's
 * current document, so a reload starts a new one. The real-network version
 * of these checks runs in e2e-real/.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, type Page } from "@playwright/test";

import { fixtureRoundContent } from "../../src/content/loaders/fixtures/sealed";
import { normalizeName } from "../../src/engine/suggest/normalize";
import type {
  EncoreContent,
  MysteryContent,
  SealedChoiceContent,
} from "../../src/engine/types";
import shared from "../../src/config/shared.json";

import { mockControls } from "./mock";

/** One entry of the mock's response log. */
export interface LoggedResponse {
  method: string;
  at: number;
  payload: unknown;
}

/** What the scan needs from an attempt row of the mock database. */
export interface AttemptRowView {
  id: string;
  rounds: { spec: { contentId?: unknown } }[];
}

type RoundContent = MysteryContent | EncoreContent | SealedChoiceContent;

export interface SealedContentLookup {
  round(contentId: string): RoundContent | null;
  /** The name, display and aliases of an answer entity. */
  names(entityId: string): string[];
}

export interface SealedScan {
  /** The attempts this page played. */
  attempts: string[];
  /** The rounds whose content the scan checked. */
  rounds: number;
  /** The responses it read. */
  responses: number;
}

const OPTION_KEYS = "alreadyGuessed,index,label";
const OPTIONS_FROM_CLUE = shared.optionsFromClue;

/** The fixture content and answer lists of content/fixtures/. */
export function fixtureLookup(
  root: string = process.cwd(),
): SealedContentLookup {
  const lists = join(root, "content/fixtures/answer-lists");
  const names = new Map<string, string[]>();
  for (const file of readdirSync(lists).filter((name) =>
    name.endsWith(".json"),
  )) {
    const list = JSON.parse(readFileSync(resolve(lists, file), "utf8")) as {
      entities: {
        id: string;
        name: string;
        display: string;
        aliases?: string[];
      }[];
    };
    for (const entity of list.entities) {
      names.set(entity.id, [
        entity.name,
        entity.display,
        ...(entity.aliases ?? []),
      ]);
    }
  }
  return {
    round: (contentId) =>
      fixtureRoundContent(
        contentId as Parameters<typeof fixtureRoundContent>[0],
      ),
    names: (entityId) => names.get(entityId) ?? [],
  };
}

/** Every string in a JSON value, with its path. */
function* stringsOf(
  value: unknown,
  path = "",
): Generator<{ path: string; text: string }> {
  if (typeof value === "string") {
    yield { path, text: value };
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* stringsOf(item, `${path}[${index}]`);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      yield* stringsOf(item, `${path}.${key}`);
    }
  }
}

/** Every number in a JSON value, with its path. */
function* numbersOf(
  value: unknown,
  path = "",
): Generator<{ path: string; value: number }> {
  if (typeof value === "number") {
    yield { path, value };
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* numbersOf(item, `${path}[${index}]`);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      yield* numbersOf(item, `${path}.${key}`);
    }
  }
}

/** Every object in a JSON value. */
function* objectsOf(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* objectsOf(item);
  } else if (typeof value === "object" && value !== null) {
    yield value as Record<string, unknown>;
    for (const item of Object.values(value)) yield* objectsOf(item);
  }
}

/** A name as a whole token after normalizeName (AC-DLY-04). */
export function containsName(text: string, name: string): boolean {
  const needle = normalizeName(name);
  return needle !== "" && ` ${normalizeName(text)} `.includes(` ${needle} `);
}

/** A number as a whole formatted token: "1,250" and "86.4" count; "9/12" and "#12" don't. */
export function containsNumber(text: string, value: number): boolean {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[(]+|[),.;:!?]+$/g, ""))
    .some(
      (token) =>
        /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(token) &&
        Number(token.replaceAll(",", "")) === value,
    );
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

/** A result's value when it succeeded: `{ ok: true, value }`. */
function okValue(payload: unknown): Record<string, unknown> | null {
  const result = record(payload);
  return result?.ok === true ? record(result.value) : null;
}

interface AttemptState {
  rows: AttemptRowView;
  resolved: Set<number>;
  /** The highest clue issued so far, per Mystery round. */
  issued: Map<number, number>;
  /** The Mystery rounds whose options have been issued. */
  options: Set<number>;
  open: number | null;
}

/**
 * What a response does to an attempt: the rounds it opens (with the open
 * views it issues) and the rounds it resolves.
 */
function effectOf(
  method: string,
  value: Record<string, unknown> | null,
  state: AttemptState | null,
): { opens: Record<string, unknown>[]; resolves: number[] } {
  const opens: Record<string, unknown>[] = [];
  const resolves: number[] = [];
  if (value === null) return { opens, resolves };
  if (method === "sealed.start" || method === "sealed.get") {
    for (const resolvedRound of Array.isArray(value.resolved)
      ? value.resolved
      : []) {
      const index = record(record(resolvedRound)?.meta)?.index;
      if (typeof index === "number") resolves.push(index);
    }
    const open = record(record(value.current)?.open);
    if (open !== null) opens.push(open);
  } else if (method === "sealed.beginRound") {
    const start = record(value.start);
    if (start?.kind === "open" && record(start.open) !== null) {
      opens.push(record(start.open) as Record<string, unknown>);
    } else if (start?.kind === "withdrawn" && state !== null) {
      const next = record(start.next)?.index;
      resolves.push(
        typeof next === "number" ? next - 1 : state.rows.rounds.length - 1,
      );
    }
  } else if (method === "sealed.act") {
    const verdict = record(value.verdict);
    if (verdict?.kind === "continue" && record(verdict.open) !== null) {
      opens.push(record(verdict.open) as Record<string, unknown>);
    } else if (verdict?.kind === "resolved" && state?.open != null) {
      resolves.push(state.open);
    }
  }
  return { opens, resolves };
}

/**
 * Every leak and every malformed Mystery view in `responses`, as one line
 * each. Pure: the page-free half of expectSealedPayloads.
 */
export function sealedLeaks(
  responses: readonly LoggedResponse[],
  attempts: readonly AttemptRowView[],
  lookup: SealedContentLookup = fixtureLookup(),
): string[] {
  const problems: string[] = [];
  const states = new Map<string, AttemptState>(
    attempts.map((rows) => [
      rows.id,
      {
        rows,
        resolved: new Set(),
        issued: new Map(),
        options: new Set(),
        open: null,
      },
    ]),
  );
  const contents = new Map<string, RoundContent | null>();
  const contentOf = (attempt: AttemptRowView, index: number) => {
    const id = attempt.rounds[index]?.spec.contentId;
    if (typeof id !== "string") return null;
    if (!contents.has(id)) contents.set(id, lookup.round(id));
    return contents.get(id) ?? null;
  };
  const allContentIds = attempts.flatMap((attempt) =>
    attempt.rounds
      .map((row) => row.spec.contentId)
      .filter((id): id is string => typeof id === "string"),
  );
  let current: AttemptState | null = null;

  responses.forEach((response, k) => {
    const where = `response ${k + 1} (${response.method})`;
    const value = okValue(response.payload);
    const attemptId = value?.attemptId;
    if (
      (response.method === "sealed.start" ||
        response.method === "sealed.get") &&
      typeof attemptId === "string"
    ) {
      current = states.get(attemptId) ?? current;
    }
    const json = JSON.stringify(response.payload) ?? "";
    const texts = [...stringsOf(response.payload)];
    const shows = (secret: string) =>
      secret !== "" && texts.some(({ text }) => text.includes(secret));

    // No sealed content id ever reaches the page.
    for (const id of allContentIds) {
      if (json.includes(id)) problems.push(`${where}: the content id ${id}`);
    }

    // The shape of every Mystery view: clues issued, options, option keys.
    for (const object of objectsOf(response.payload)) {
      if (object.family !== "mystery" || typeof object.clue !== "number") {
        continue;
      }
      const clues = Array.isArray(object.clues) ? object.clues : [];
      if (clues.length !== object.clue) {
        problems.push(
          `${where}: a Mystery on clue ${object.clue} carries ${clues.length} clue(s)`,
        );
      }
      if (Array.isArray(object.options)) {
        if (object.clue < OPTIONS_FROM_CLUE) {
          problems.push(
            `${where}: a Mystery shows options on clue ${object.clue}, before clue ${OPTIONS_FROM_CLUE}`,
          );
        }
        for (const option of object.options) {
          const keys = Object.keys(record(option) ?? {})
            .sort()
            .join();
          if (keys !== OPTION_KEYS) {
            problems.push(
              `${where}: an option carries { ${keys} }, not { ${OPTION_KEYS} }`,
            );
          }
        }
      }
    }

    const state: AttemptState | null = current;
    if (state === null) return;
    const { opens, resolves } = effectOf(response.method, value, state);
    for (const open of opens) {
      const index = open.index;
      if (typeof index !== "number") continue;
      state.open = index;
      if (open.family === "mystery" && typeof open.clue === "number") {
        state.issued.set(
          index,
          Math.max(state.issued.get(index) ?? 0, open.clue),
        );
        if (Array.isArray(open.options)) state.options.add(index);
      }
    }
    const resolved = new Set([...state.resolved, ...resolves]);

    state.rows.rounds.forEach((_row, index) => {
      if (resolved.has(index)) return;
      const content = contentOf(state.rows, index);
      if (content === null) return;
      const round = `round ${index + 1} (${content.kind}, unresolved)`;
      if (shows(content.explanation)) {
        problems.push(`${where}: ${round} explanation`);
      }
      if (content.kind === "mystery") {
        for (const id of [
          content.answer,
          ...content.accepted,
          ...content.distractors,
        ]) {
          if (json.includes(id))
            problems.push(`${where}: ${round} entity id ${id}`);
        }
        const issued = state.issued.get(index) ?? 0;
        content.clues.forEach((clue, clueIndex) => {
          if (clueIndex + 1 > issued && shows(clue)) {
            problems.push(
              `${where}: ${round} clue ${clueIndex + 1}, not issued yet`,
            );
          }
        });
        const names = lookup.names(content.answer);
        for (const { path, text } of texts) {
          if (
            state.options.has(index) &&
            /\.options\[\d+\]\.label$/.test(path)
          ) {
            continue;
          }
          for (const name of names) {
            if (containsName(text, name)) {
              problems.push(`${where}: ${round} answer name at ${path}`);
            }
          }
        }
      } else if (content.kind === "encore") {
        for (const number of numbersOf(response.payload)) {
          if (number.value === content.answer) {
            problems.push(`${where}: ${round} answer value at ${number.path}`);
          }
        }
        for (const { path, text } of texts) {
          if (containsNumber(text, content.answer)) {
            problems.push(`${where}: ${round} answer value in text at ${path}`);
          }
        }
      }
    });
    state.resolved = resolved;
  });
  return problems;
}

/**
 * Fails the test if any result the mock handed `page` gave a sealed round
 * away before it resolved (see the top of this file). Run it after the
 * play the spec wants to check; it scans the current document's log.
 */
export async function expectSealedPayloads(page: Page): Promise<SealedScan> {
  const mock = mockControls(page);
  const responses = await mock.responses();
  const rows =
    (await mock.inspect<Record<string, AttemptRowView> | undefined>(
      "attempts",
    )) ?? {};
  const playedIds = new Set(
    responses
      .filter(
        (response) =>
          response.method === "sealed.start" ||
          response.method === "sealed.get",
      )
      .map((response) => okValue(response.payload)?.attemptId)
      .filter((id): id is string => typeof id === "string"),
  );
  const played = Object.values(rows).filter((row) => playedIds.has(row.id));
  expect(
    played.length,
    "expectSealedPayloads needs an attempt this page started or loaded",
  ).toBeGreaterThan(0);

  const problems = sealedLeaks(responses, played);
  expect(problems, "sealed content reached the page too early").toEqual([]);
  return {
    attempts: played.map((row) => row.id),
    rounds: played.reduce((sum, row) => sum + row.rounds.length, 0),
    responses: responses.length,
  };
}
