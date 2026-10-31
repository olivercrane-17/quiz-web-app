import { describe, expect, it, vi } from "vitest";

import { createKv, createMemoryStorage } from "@/platform/storage";

import { DEFAULT_SETTINGS, createSettingsStore, decodeSettings } from "./store";

describe("settings", () => {
  it("defaults to PRD §3.12.1", () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });

  it("starts from the defaults on a fresh device", () => {
    const store = createSettingsStore(
      createKv({ storage: createMemoryStorage() }),
    );
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it("decodes field by field, keeping good values and defaulting the rest", () => {
    expect(
      decodeSettings({
        theme: "dark",
        sound: "loud",
        practiceDifficulty: "hard",
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "dark",
      practiceDifficulty: "hard",
    });
    expect(decodeSettings({ v: 2, theme: "dark" })).toBeNull();
    expect(decodeSettings("dark")).toBeNull();
    expect(decodeSettings([])).toBeNull();
  });

  it("persists updates, ignores invalid values and notifies subscribers", () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(createKv({ storage }));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const next = store.update({
      theme: "dark",
      sound: true,
      stopwatch: "nope" as never,
    });
    expect(next).toMatchObject({
      theme: "dark",
      sound: true,
      stopwatch: "shown",
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem("qz:settings") ?? "null")).toMatchObject({
      v: 1,
      theme: "dark",
      sound: true,
    });
    store.update({ theme: "dark" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.reset();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it("reads what another tab wrote on refresh", () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(createKv({ storage }));
    storage.setItem(
      "qz:settings",
      JSON.stringify({ ...DEFAULT_SETTINGS, motion: "on" }),
    );
    expect(store.get().motion).toBe("system");
    expect(store.refresh().motion).toBe("on");
  });

  it("quarantines settings it can't read and starts again from the defaults", () => {
    const storage = createMemoryStorage({ "qz:settings": '{"v":7}' });
    const store = createSettingsStore(createKv({ storage }));
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(storage.getItem("qz:quarantine:settings")).toBe('{"v":7}');
  });
});
