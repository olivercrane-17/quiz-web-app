/**
 * The settings store (ARCHITECTURE §6.2): typed settings with their PRD
 * defaults (§3.12.1), kept in `qz:settings`. UI-free: SET-1 builds the
 * settings page on top of it, and the root layout's boot script (DS-1)
 * reads the same key before first paint.
 *
 * Decoding is lenient field by field: a stored value that isn't one of a
 * field's options falls back to that field's default, so one bad field
 * never costs the player the rest of their settings. Storage that is not a
 * settings object at all is quarantined and reset by the kv layer.
 */
import { getKv, type Kv } from "@/platform/storage";
import type { DifficultyChoice } from "@/engine/types";

export interface Settings {
  v: 1;
  theme: "system" | "light" | "dark";
  /** "Reduce motion". */
  motion: "system" | "on" | "off";
  /** false by default (host screen keeps its own toggle). */
  sound: boolean;
  haptics: boolean;
  readableText: boolean;
  highContrast: boolean;
  readAloud: boolean;
  stopwatch: "shown" | "hidden";
  /** true by default. */
  shortcuts: boolean;
  autoAdvance: boolean;
  timerAnnouncements: boolean;
  /** Remembered per device, 'mixed' by default. */
  practiceDifficulty: DifficultyChoice;
}

export type SettingsPatch = Partial<Omit<Settings, "v">>;

/** PRD §3.12.1's defaults. */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  v: 1,
  theme: "system",
  motion: "system",
  sound: false,
  haptics: false,
  readableText: false,
  highContrast: false,
  readAloud: false,
  stopwatch: "shown",
  shortcuts: true,
  autoAdvance: false,
  timerAnnouncements: false,
  practiceDifficulty: "mixed",
});

export const SETTINGS_KEY = "qz:settings";

type Field = Exclude<keyof Settings, "v">;

const CHOICES: { [K in Field]: readonly Settings[K][] } = {
  theme: ["system", "light", "dark"],
  motion: ["system", "on", "off"],
  sound: [true, false],
  haptics: [true, false],
  readableText: [true, false],
  highContrast: [true, false],
  readAloud: [true, false],
  stopwatch: ["shown", "hidden"],
  shortcuts: [true, false],
  autoAdvance: [true, false],
  timerAnnouncements: [true, false],
  practiceDifficulty: ["easy", "medium", "hard", "mixed"],
};

const FIELDS = Object.keys(CHOICES) as Field[];

function isChoice<K extends Field>(
  field: K,
  value: unknown,
): value is Settings[K] {
  return (CHOICES[field] as readonly unknown[]).includes(value);
}

/**
 * Settings from storage: null when the value is not a settings object (or
 * comes from an unknown version); otherwise every field, with defaults for
 * missing or unknown values. A value without `v` (storage from before
 * versioning) is read the same way.
 */
export function decodeSettings(raw: unknown): Settings | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== undefined && record.v !== 1) return null;
  const out: Record<string, unknown> = { v: 1 };
  for (const field of FIELDS) {
    const value = record[field];
    out[field] = isChoice(field, value) ? value : DEFAULT_SETTINGS[field];
  }
  return out as unknown as Settings;
}

export interface SettingsStore {
  get(): Readonly<Settings>;
  /** Applies the valid fields of a patch; unknown values are ignored. */
  update(patch: SettingsPatch): Readonly<Settings>;
  reset(): Readonly<Settings>;
  /** Re-reads storage, after another tab changed it. */
  refresh(): Readonly<Settings>;
  subscribe(listener: (settings: Readonly<Settings>) => void): () => void;
}

function same(a: Settings, b: Settings): boolean {
  return FIELDS.every((field) => a[field] === b[field]);
}

export function createSettingsStore(kv: Kv): SettingsStore {
  const listeners = new Set<(settings: Readonly<Settings>) => void>();
  const load = (): Readonly<Settings> =>
    Object.freeze(
      kv.read("qz:settings", decodeSettings) ?? { ...DEFAULT_SETTINGS },
    );
  let current = load();

  const set = (next: Settings, persist: boolean): Readonly<Settings> => {
    const frozen = Object.freeze({ ...next });
    if (persist) kv.write("qz:settings", frozen);
    if (!same(current, frozen)) {
      current = frozen;
      for (const listener of listeners) listener(current);
    }
    return current;
  };

  return {
    get: () => current,
    update(patch: SettingsPatch): Readonly<Settings> {
      const next: Record<string, unknown> = { ...current };
      for (const field of FIELDS) {
        if (!Object.hasOwn(patch, field)) continue;
        const value = patch[field];
        if (isChoice(field, value)) next[field] = value;
      }
      return set(next as unknown as Settings, true);
    },
    reset: () => set({ ...DEFAULT_SETTINGS }, true),
    refresh: () => set(load(), false),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let shared: SettingsStore | null = null;

/** The tab's settings store over the shared kv. */
export function getSettingsStore(): SettingsStore {
  shared ??= createSettingsStore(getKv());
  return shared;
}
