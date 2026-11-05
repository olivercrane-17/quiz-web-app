"use client";

/**
 * Tests only: a stand-in controller for the round components (ARCHITECTURE
 * §11.3, "fake controllers built from the engine"). It runs the real
 * plugin, both halves, on the device: checks each intent, judges it,
 * announces the verdict with the round's own copy, as the Daily controller
 * does, and renders the component with the result. Never imported by app
 * code.
 */
import { useState } from "react";

import { encorePlugin } from "@/engine/rounds/encore";
import type { EncoreClient, EncoreJudge } from "@/engine/rounds/encore";
import {
  mysteryPlugin,
  type MysteryClient,
  type MysteryJudge,
} from "@/engine/rounds/mystery";
import type { EntityLookup, JudgeContext } from "@/engine/rounds/types";
import { createRng } from "@/engine/rng";
import type {
  EncoreContent,
  MysteryContent,
  RoundIntent,
  RoundMeta,
  RoundReveal,
} from "@/engine/types";
import { DEFAULT_SETTINGS } from "@/platform/settings/store";
import { announce } from "@/ui/announce";

import {
  playSettingsFrom,
  type AnswerListHandle,
  type PlaySettings,
  type RoundComponentProps,
} from "../contracts";
import { EncoreRound } from "../encore";
import { encoreAnnouncementText } from "../encore/copy";
import { mysteryAnnouncementText, mysteryMissed } from "./copy";
import { MysteryRound } from ".";

export const TEST_SETTINGS: PlaySettings = {
  ...playSettingsFrom(DEFAULT_SETTINGS, false),
  // Tests read the final state at once.
  reducedMotion: true,
};

export function mysteryMeta(overrides: Partial<RoundMeta> = {}): RoundMeta {
  return {
    index: 1,
    type: "mystery",
    difficulty: "medium",
    category: "hist",
    answerType: "person",
    ordinal: 2,
    ofType: 3,
    maxPoints: 4,
    voided: false,
    ...overrides,
  };
}

export function encoreMeta(overrides: Partial<RoundMeta> = {}): RoundMeta {
  return {
    index: 3,
    type: "encore",
    difficulty: null,
    category: "geo",
    answerType: null,
    ordinal: 1,
    ofType: 1,
    maxPoints: 0,
    voided: false,
    ...overrides,
  };
}

function judgeContext(
  entities: EntityLookup | null,
  optionsFromClue: 3 | 4,
): JudgeContext {
  return {
    at: 1000,
    rng: createRng("harness"),
    // The stored shuffle: options show in source order, the key first.
    shuffle: [0, 1, 2, 3],
    optionsFromClue,
    entities,
  };
}

export interface HarnessProps {
  content: MysteryContent;
  entities: EntityLookup;
  list: AnswerListHandle | null;
  meta?: RoundMeta;
  optionsFromClue?: 3 | 4;
  settings?: PlaySettings;
  /** The round context's first-Daily flag (PRD §3.1.4 hints). */
  firstDaily?: boolean;
  onIntent?(intent: RoundIntent): void;
  onContinue?(): void;
  /** Sees the plugin's client state after every verdict, for its outcome. */
  onClient?(client: MysteryClient): void;
}

/** A Mystery played through the real plugin. */
export function MysteryHarness({
  content,
  entities,
  list,
  meta = mysteryMeta(),
  optionsFromClue = 4,
  settings = TEST_SETTINGS,
  firstDaily,
  onIntent,
  onContinue,
  onClient,
}: HarnessProps) {
  const ctx = judgeContext(entities, optionsFromClue);
  const [state, setState] = useState(() => {
    const { open, judge } = mysteryPlugin.open(content, meta, ctx);
    return {
      open,
      judge,
      client: mysteryPlugin.init(open),
      reveal: null as RoundReveal | null,
      error: null as RoundComponentProps["error"],
    };
  });

  function handle(intent: RoundIntent) {
    onIntent?.(intent);
    if (intent.family !== "mystery") return;
    const check = mysteryPlugin.check(state.client, intent);
    if (!check.ok) {
      setState({ ...state, error: { code: check.error, retryable: false } });
      return;
    }
    const result = mysteryPlugin.judge(content, state.judge, intent, ctx);
    if (!result.ok) {
      setState({ ...state, error: { code: result.error, retryable: false } });
      return;
    }
    const text = mysteryAnnouncementText(
      mysteryPlugin.announce(state.client, result.verdict),
      { optionsFromClue },
      // What a controller knows: whether the round shows a miss so far.
      { missed: mysteryMissed(state.client.open) },
    );
    if (text !== null) announce(text);
    const client: MysteryClient = mysteryPlugin.apply(
      state.client,
      result.verdict,
    );
    const judge: MysteryJudge = result.judge;
    onClient?.(client);
    setState({
      open:
        result.verdict.kind === "continue" &&
        result.verdict.open.family === "mystery"
          ? result.verdict.open
          : state.open,
      judge,
      client,
      reveal: result.verdict.kind === "resolved" ? result.verdict.reveal : null,
      error: null,
    });
  }

  return (
    <MysteryRound
      meta={meta}
      open={state.open}
      client={state.client}
      status="idle"
      reveal={state.reveal}
      error={state.error}
      onIntent={handle}
      onContinue={onContinue ?? (() => undefined)}
      continueLabel="Next mystery"
      context={{
        mode: "daily",
        sealed: true,
        list,
        itemRef: "daily:42:1",
        settings,
        ...(firstDaily === undefined ? {} : { firstDaily }),
      }}
    />
  );
}

export interface EncoreHarnessProps {
  content: EncoreContent;
  meta?: RoundMeta;
  settings?: PlaySettings;
  onIntent?(intent: RoundIntent): void;
  onContinue?(): void;
}

/** An Encore played through the real plugin. */
export function EncoreHarness({
  content,
  meta = encoreMeta(),
  settings = TEST_SETTINGS,
  onIntent,
  onContinue,
}: EncoreHarnessProps) {
  const ctx = judgeContext(null, 4);
  const [state, setState] = useState(() => {
    const { open, judge } = encorePlugin.open(content, meta, ctx);
    return {
      open,
      judge,
      client: encorePlugin.init(open),
      reveal: null as RoundReveal | null,
    };
  });

  function handle(intent: RoundIntent) {
    onIntent?.(intent);
    if (intent.family !== "encore") return;
    const result = encorePlugin.judge(content, state.judge, intent, ctx);
    if (!result.ok) return;
    const text = encoreAnnouncementText(
      encorePlugin.announce(state.client, result.verdict),
    );
    if (text !== null) announce(text);
    const client: EncoreClient = encorePlugin.apply(
      state.client,
      result.verdict,
    );
    const judge: EncoreJudge = result.judge;
    setState({
      ...state,
      judge,
      client,
      reveal: result.verdict.kind === "resolved" ? result.verdict.reveal : null,
    });
  }

  return (
    <EncoreRound
      meta={meta}
      open={state.open}
      client={state.client}
      status="idle"
      reveal={state.reveal}
      error={null}
      onIntent={handle}
      onContinue={onContinue ?? (() => undefined)}
      continueLabel="See your results"
      context={{
        mode: "daily",
        sealed: true,
        list: null,
        itemRef: "daily:42:4",
        settings,
      }}
    />
  );
}
