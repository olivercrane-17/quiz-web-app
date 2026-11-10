"use client";

/**
 * The parts of a round that no first screen shows, loaded apart from the
 * rounds (ARCHITECTURE §10.9): the reveal's crowd chart and the Encore's
 * number line (`late-parts`). They stay out of the first load of every
 * route that runs rounds, which is how RITE round 4's Lock in bar and
 * legends fit under those routes' budgets. A round asks for them as it
 * arrives (`loadLateParts`), well before either is due, and draws each
 * once it is here (`useLateParts`). Nobody needs either to play on: the
 * result line says in words what the number line draws, and the chart is
 * an extra under the explanation. So a reveal shows without them, and a
 * request that fails is asked again by the next round's call.
 */
import { useSyncExternalStore } from "react";

import type * as Parts from "./late-parts";

type LateParts = typeof Parts;

let parts: LateParts | null = null;
let loading: Promise<void> | null = null;
const waiting = new Set<() => void>();

/** Asks for the parts once; resolves when they are here, or the request failed. */
export function loadLateParts(): Promise<void> {
  loading ??= import("./late-parts").then(
    (module) => {
      parts = module;
      for (const draw of waiting) draw();
    },
    () => {
      loading = null;
    },
  );
  return loading;
}

function subscribe(draw: () => void) {
  waiting.add(draw);
  return () => {
    waiting.delete(draw);
  };
}

const loaded = () => parts;
const notYet = () => null;

/** The late parts once they have loaded, else null. */
export function useLateParts(): LateParts | null {
  return useSyncExternalStore(subscribe, loaded, notYet);
}
