/**
 * AC-DLY-03 and AC-DLY-04, mock half, with the real round plugins (PRA-1's
 * choice plugin, MYS-1's mystery and encore plugins) over the fixture
 * Dailies: every response the player could see before a round resolves is
 * scanned for that round's key, the way the ACs ask (numbers by value in
 * numeric fields and as whole formatted tokens in text; names and aliases
 * as whole tokens after normalizeName).
 *
 * It runs on the real plugins, unconditionally since the Wave 1 merge, so a
 * plugin that regressed to a stub fails here instead of skipping. The
 * echo-plugin scans in sealed.test.ts cover the protocol itself.
 */
import { describe, expect, it } from "vitest";

import { createFakeClock } from "@/engine/clock";
import { PLUGINS } from "@/engine/rounds";
import { normalizeName } from "@/engine/suggest/normalize";
import {
  parseIdempotencyKey,
  parseTimeZone,
  type AttemptId,
  type EncoreContent,
  type EntityId,
  type IdempotencyKey,
  type ItemId,
  type MysteryContent,
  type RoundIntent,
  type SealedChoiceContent,
  type TimeZone,
} from "@/engine/types";
import { createLocalIdentityProvider } from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import countryList from "../../../../content/fixtures/answer-lists/country.json";
import elementList from "../../../../content/fixtures/answer-lists/element.json";
import filmList from "../../../../content/fixtures/answer-lists/film.json";
import musicArtistList from "../../../../content/fixtures/answer-lists/music_artist.json";
import personList from "../../../../content/fixtures/answer-lists/person.json";
import { createMockBackend } from "../index";
import { createMemoryStore } from "../store";

interface ListEntity {
  id: string;
  name: string;
  display: string;
  aliases: string[];
}

const ENTITIES = new Map<string, ListEntity>(
  [countryList, elementList, filmList, musicArtistList, personList].flatMap(
    (list) =>
      (list.entities as ListEntity[]).map((entity) => [entity.id, entity]),
  ),
);
const LISTS = new Map<string, ListEntity[]>(
  [countryList, elementList, filmList, musicArtistList, personList].map(
    (list) => [list.type, list.entities as ListEntity[]],
  ),
);

const UTC = parseTimeZone("UTC") as TimeZone;
const START = {
  tz: UTC,
  browser: { context: "browser", app: "none", platform: "desktop" },
  appVersion: "test",
} as const;

let keys = 0;
function key(): IdempotencyKey {
  keys += 1;
  return parseIdempotencyKey(
    `00000000-0000-4000-8000-${keys.toString(16).padStart(12, "0")}`,
  ) as IdempotencyKey;
}

function setup(at: number) {
  const clock = createFakeClock(at);
  const identity = createLocalIdentityProvider({
    kv: createKv({ storage: createMemoryStorage() }),
    now: () => at,
  });
  return createMockBackend(
    {
      identity: () => identity,
      serverClock: createServerClock({ base: clock }),
    },
    {
      store: createMemoryStore(),
      clock,
      init: { latencyMs: 0 },
      attachControls: false,
      plugins: PLUGINS,
    },
  );
}

type Mock = ReturnType<typeof setup>;

/** Every string in a JSON value, with its path. */
function strings(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) =>
      strings(v, `${path}.${k}`),
    );
  }
  return [];
}

/** Every number in a JSON value, with its path. */
function numbers(value: unknown, path = ""): { path: string; value: number }[] {
  if (typeof value === "number") return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => numbers(item, `${path}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) =>
      numbers(v, `${path}.${k}`),
    );
  }
  return [];
}

/** A name as a whole token after normalizeName (AC-DLY-04). */
function hasName(text: string, name: string): boolean {
  const needle = normalizeName(name);
  return needle !== "" && ` ${normalizeName(text)} `.includes(` ${needle} `);
}

/** A number as a whole formatted token: "1,250" and "86.4" count, "9/12" and "#12" don't. */
function hasNumber(text: string, value: number): boolean {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[(]+|[),.;:!?]+$/g, ""))
    .some(
      (token) =>
        /^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(token) &&
        Number(token.replaceAll(",", "")) === value,
    );
}

/** The responses since `from`, as the client received them. */
function since(mock: Mock, from: number): unknown[] {
  return mock.controls
    .responses()
    .slice(from)
    .map((response) => response.payload);
}

async function actOn(
  mock: Mock,
  attemptId: AttemptId,
  index: number,
  step: number,
  intent: RoundIntent,
) {
  return mock.sealed.act({
    attemptId,
    index,
    step,
    intent,
    clientActiveMs: 1000,
    hiddenMs: 0,
    key: key(),
  });
}

async function contentOf(mock: Mock, attemptId: AttemptId, index: number) {
  const id = mock.controls.inspect<ItemId>(
    `attempts.${attemptId}.rounds.${index}.spec.contentId`,
  );
  const content = await mock.context.content.round(id);
  if (content === null) throw new Error(`no content for ${id}`);
  return content;
}

/** What a Mystery's responses may not hold before it resolves (AC-DLY-03). */
function mysteryLeaks(
  payloads: unknown[],
  content: MysteryContent,
  issued: number,
  optionsShown: boolean,
): string[] {
  const problems: string[] = [];
  const json = JSON.stringify(payloads);
  if (json.includes(content.id)) problems.push(`content id ${content.id}`);
  for (const id of [content.answer, ...content.accepted]) {
    if (json.includes(id)) problems.push(`answer or accepted id ${id}`);
  }
  for (const id of content.distractors) {
    if (json.includes(id)) problems.push(`distractor id ${id}`);
  }
  const answer = ENTITIES.get(content.answer);
  const names =
    answer === undefined
      ? []
      : [answer.name, answer.display, ...answer.aliases];
  for (const { path, text } of strings(payloads)) {
    // The options name the answer among three others once they're issued.
    if (optionsShown && /\.options\[\d+\]\.label$/.test(path)) continue;
    for (const name of names) {
      if (hasName(text, name))
        problems.push(`answer name "${name}" at ${path}`);
    }
  }
  content.clues.slice(issued).forEach((clue, i) => {
    if (json.includes(clue)) problems.push(`clue ${issued + i + 1}`);
  });
  if (json.includes(content.explanation)) problems.push("the explanation");
  return problems;
}

/** A wrong guess from the answer's own list that is neither the key nor a distractor. */
function wrongGuessFor(content: MysteryContent): EntityId {
  const taken = new Set<string>([
    content.answer,
    ...content.accepted,
    ...content.distractors,
  ]);
  const other = LISTS.get(content.answerType)?.find(
    (entity) => !taken.has(entity.id),
  );
  if (other === undefined) throw new Error("no other entity to guess");
  return other.id as EntityId;
}

describe("sealed secrecy with the real plugins", () => {
  it("AC-DLY-03 AC-DLY-04 Daily #42 (three Mysteries and an Encore): no key before each round resolves", async () => {
    const mock = setup(Date.UTC(2026, 10, 1, 9));
    const started = await mock.sealed.start({ kind: "today" }, START);
    if (!started.ok) throw new Error(started.error.code);
    const { attemptId } = started.value;
    const problems: string[] = [];
    // The start is round 0's begin, so its scan starts at the first response.
    let from = 0;

    for (let index = 0; index < started.value.rounds.length; index += 1) {
      if (index > 0) {
        from = mock.controls.responses().length;
        await mock.sealed.beginRound(attemptId, index);
      }
      const content = await contentOf(mock, attemptId, index);
      if (content.kind === "mystery") {
        const scan = (label: string, issued: number, options: boolean) => {
          for (const problem of mysteryLeaks(
            since(mock, from),
            content,
            issued,
            options,
          )) {
            problems.push(`Mystery ${index + 1}, ${label}: ${problem}`);
          }
        };
        scan("clue 1", 1, false);
        const guessed = await actOn(mock, attemptId, index, 1, {
          family: "mystery",
          kind: "guess",
          entityId: wrongGuessFor(content),
        });
        expect(guessed).toMatchObject({
          ok: true,
          value: { verdict: { kind: "continue" } },
        });
        // A stale call answers with the attempt's snapshot.
        expect(
          await actOn(mock, attemptId, index, 1, {
            family: "mystery",
            kind: "next_clue",
          }),
        ).toMatchObject({ ok: false, error: { code: "stale" } });
        await mock.sealed.get(attemptId);
        scan("after a wrong guess", 2, false);

        let clue = 2;
        for (;;) {
          const snapshot = await mock.sealed.get(attemptId);
          const open = snapshot.ok ? snapshot.value.current?.open : null;
          if (open?.family !== "mystery") throw new Error("not a Mystery");
          if (open.options !== null) {
            scan(`with the options on clue ${open.clue}`, open.clue, true);
            for (const option of open.options) {
              expect(Object.keys(option).sort()).toEqual([
                "alreadyGuessed",
                "index",
                "label",
              ]);
            }
            const answer = ENTITIES.get(content.answer);
            const pick = open.options.find(
              (option) =>
                answer !== undefined && hasName(option.label, answer.display),
            );
            if (pick === undefined)
              throw new Error("the answer isn't an option");
            const picked = await actOn(mock, attemptId, index, open.clue, {
              family: "mystery",
              kind: "pick",
              option: pick.index,
            });
            expect(picked).toMatchObject({
              ok: true,
              value: { verdict: { kind: "resolved" } },
            });
            break;
          }
          const next = await actOn(mock, attemptId, index, clue, {
            family: "mystery",
            kind: "next_clue",
          });
          expect(next).toMatchObject({ ok: true });
          clue += 1;
          // The options name the answer among three others once issued.
          const issued =
            next.ok && next.value.verdict.kind === "continue"
              ? next.value.verdict.open
              : null;
          scan(
            `on clue ${clue}`,
            clue,
            issued?.family === "mystery" && issued.options !== null,
          );
        }
      } else if (content.kind === "encore") {
        const encore: EncoreContent = content;
        await mock.sealed.get(attemptId);
        const payloads = since(mock, from);
        const json = JSON.stringify(payloads);
        for (const { path, value } of numbers(payloads)) {
          if (value === encore.answer) {
            problems.push(`Encore: the answer ${value} at ${path}`);
          }
        }
        for (const { path, text } of strings(payloads)) {
          if (hasNumber(text, encore.answer)) {
            problems.push(`Encore: the answer in "${text}" at ${path}`);
          }
        }
        if (json.includes(encore.id)) problems.push("Encore: its content id");
        if (json.includes(encore.explanation)) {
          problems.push("Encore: the explanation");
        }
        const locked = await actOn(mock, attemptId, index, 1, {
          family: "encore",
          kind: "lock_in",
          value: Math.max(1, Math.round(encore.answer * 2)),
        });
        expect(locked).toMatchObject({
          ok: true,
          value: { verdict: { kind: "resolved" } },
        });
      } else {
        throw new Error(`Daily #42 has no ${content.kind} rounds`);
      }
    }
    expect(problems).toEqual([]);
    expect(await mock.sealed.finish(attemptId)).toMatchObject({
      ok: true,
      value: { maxPoints: 12 },
    });
  });

  it("AC-DLY-03 Daily #56 (nine choice questions): no key, explanation or content id before each answer", async () => {
    const mock = setup(Date.UTC(2026, 10, 15, 9));
    const started = await mock.sealed.start({ kind: "today" }, START);
    if (!started.ok) throw new Error(started.error.code);
    const { attemptId } = started.value;
    const problems: string[] = [];
    let from = 0;
    for (let index = 0; index < 9; index += 1) {
      if (index > 0) {
        from = mock.controls.responses().length;
        await mock.sealed.beginRound(attemptId, index);
      }
      const snapshot = await mock.sealed.get(attemptId);
      const open = snapshot.ok ? snapshot.value.current?.open : null;
      if (open?.family !== "choice") throw new Error("not a choice round");
      const content = (await contentOf(
        mock,
        attemptId,
        index,
      )) as SealedChoiceContent;
      const json = JSON.stringify(since(mock, from));
      if (json.includes(content.id)) problems.push(`Q${index + 1}: content id`);
      if (json.includes(content.explanation)) {
        problems.push(`Q${index + 1}: the explanation`);
      }
      for (const option of open.options) {
        expect(Object.keys(option).sort()).toEqual([
          "alreadyGuessed",
          "index",
          "label",
        ]);
      }
      expect(Object.keys(open).sort()).toEqual([
        "family",
        "format",
        "index",
        "issuedAt",
        "options",
        "stem",
      ]);
      const answered = await actOn(mock, attemptId, index, 1, {
        family: "choice",
        kind: "answer",
        option: 0,
      });
      expect(answered).toMatchObject({ ok: true });
    }
    expect(problems).toEqual([]);
  });
});
