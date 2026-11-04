import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createKv, createMemoryStorage } from "@/platform/storage";

import {
  DISPLAY_ATTRIBUTES,
  THEME_COLORS,
  applyDisplaySettings,
  bootScript,
  displayAttributes,
  displaySettingsFrom,
  readDisplaySettings,
  settingsKeyFor,
  type DisplaySettings,
} from "./boot";
import { DEFAULT_SETTINGS, decodeSettings } from "./store";

const html = () => document.documentElement;

/** What `<html>` carries now, attribute by attribute. */
function attributesNow(): Record<string, string | null> {
  return Object.fromEntries(
    DISPLAY_ATTRIBUTES.map((name) => [name, html().getAttribute(name)]),
  );
}

/** Runs the inline script as the HTML parser would, before any React. */
function runBootScript(devices = false): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script ships as text
  new Function(bootScript({ devices }))();
}

function clearHtml(): void {
  for (const name of DISPLAY_ATTRIBUTES) html().removeAttribute(name);
}

beforeEach(() => {
  localStorage.clear();
  clearHtml();
});

afterEach(() => {
  delete (window as { __QZ_DEVICE__?: unknown }).__QZ_DEVICE__;
  clearHtml();
  localStorage.clear();
  document.head.replaceChildren();
});

/** Stored text, and the settings the store itself would decode from it. */
const STORED: [string, string | null][] = [
  ["nothing stored", null],
  ["a dark theme", '{"v":1,"theme":"dark"}'],
  ["a light theme", '{"v":1,"theme":"light"}'],
  ["the system theme", '{"v":1,"theme":"system","motion":"system"}'],
  [
    "every switch on, from before versioning",
    '{"theme":"light","motion":"on","readableText":true,"highContrast":true}',
  ],
  ["Reduce motion off", '{"v":1,"motion":"off"}'],
  [
    "values that are not a field's options",
    '{"v":1,"theme":"sepia","motion":"maybe","readableText":"yes","highContrast":1}',
  ],
  ["an unknown version", '{"v":2,"theme":"dark","highContrast":true}'],
  ["an array", "[1,2]"],
  ["a JSON string", '"dark"'],
  ["JSON null", "null"],
  ["text that is not JSON", "{theme:dark"],
];

describe("the boot script", () => {
  it.each(STORED)(
    "sets the attributes the store would, for %s",
    (_name, stored) => {
      if (stored !== null) localStorage.setItem("qz:settings", stored);
      runBootScript();

      const raw = stored === null ? null : safeParse(stored);
      const store = decodeSettings(raw) ?? DEFAULT_SETTINGS;
      expect(attributesNow()).toEqual(displayAttributes(store));
      // The code path agrees with the script, case by case.
      expect(displaySettingsFrom(raw)).toEqual({
        theme: store.theme,
        motion: store.motion,
        readableText: store.readableText,
        highContrast: store.highContrast,
      });
    },
  );

  it("maps each setting onto its attribute", () => {
    localStorage.setItem(
      "qz:settings",
      '{"v":1,"theme":"dark","motion":"on","readableText":true,"highContrast":true}',
    );
    runBootScript();
    expect(attributesNow()).toEqual({
      "data-theme": "dark",
      "data-motion": "reduce",
      "data-readable": "on",
      "data-contrast": "on",
    });
  });

  it("never throws, even when storage does", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => {
      runBootScript();
    }).not.toThrow();
    expect(attributesNow()).toEqual(
      Object.fromEntries(DISPLAY_ATTRIBUTES.map((name) => [name, null])),
    );
  });

  it("stays under 600 bytes", () => {
    for (const devices of [false, true]) {
      expect(
        new TextEncoder().encode(bootScript({ devices })).length,
      ).toBeLessThan(600);
    }
  });

  it("reads a test's device namespace in mock builds only", () => {
    localStorage.setItem("qz:settings", '{"v":1,"theme":"light"}');
    localStorage.setItem("qz:d:phone-3:settings", '{"v":1,"theme":"dark"}');
    (window as { __QZ_DEVICE__?: unknown }).__QZ_DEVICE__ = "phone-3";

    runBootScript(true);
    expect(html().getAttribute("data-theme")).toBe("dark");

    clearHtml();
    runBootScript(false);
    expect(html().getAttribute("data-theme")).toBe("light");

    // A name the kv layer would refuse falls back to the shared key.
    (window as { __QZ_DEVICE__?: unknown }).__QZ_DEVICE__ = "Phone 3";
    clearHtml();
    runBootScript(true);
    expect(html().getAttribute("data-theme")).toBe("light");
  });

  it("reads the key the kv layer writes, with or without a device", () => {
    for (const device of [null, "phone-3"]) {
      const storage = createMemoryStorage();
      createKv({ storage, device }).write("qz:settings", DEFAULT_SETTINGS);
      expect(storage.key(0)).toBe(settingsKeyFor(device));
    }
  });
});

describe("applyDisplaySettings", () => {
  const settings = (patch: Partial<DisplaySettings>): DisplaySettings => ({
    theme: "system",
    motion: "system",
    readableText: false,
    highContrast: false,
    ...patch,
  });

  it("sets the attributes and removes the ones a setting no longer needs", () => {
    applyDisplaySettings(
      settings({ theme: "dark", motion: "off", highContrast: true }),
    );
    expect(attributesNow()).toEqual({
      "data-theme": "dark",
      "data-motion": "full",
      "data-readable": null,
      "data-contrast": "on",
    });
    applyDisplaySettings(settings({ readableText: true }));
    expect(attributesNow()).toEqual({
      "data-theme": null,
      "data-motion": null,
      "data-readable": "on",
      "data-contrast": null,
    });
  });

  it("points the browser's theme colour at a chosen theme, and back", () => {
    document.head.innerHTML = `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}">`;
    const contents = () =>
      [
        ...document.querySelectorAll<HTMLMetaElement>(
          'meta[name="theme-color"]',
        ),
      ].map((meta) => meta.content);
    applyDisplaySettings(settings({ theme: "dark" }));
    expect(contents()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
    applyDisplaySettings(settings({ theme: "light" }));
    expect(contents()).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
    applyDisplaySettings(settings({ theme: "system" }));
    expect(contents()).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });
});

describe("readDisplaySettings", () => {
  it("falls back to the defaults without usable storage", () => {
    const defaults = displaySettingsFrom(null);
    expect(readDisplaySettings(null, "qz:settings")).toEqual(defaults);
    expect(
      readDisplaySettings(
        {
          getItem() {
            throw new Error("blocked");
          },
        },
        "qz:settings",
      ),
    ).toEqual(defaults);
    expect(
      readDisplaySettings({ getItem: () => "{not json" }, "qz:settings"),
    ).toEqual(defaults);
  });

  it("reads the stored value under the given key", () => {
    const storage = createMemoryStorage({
      "qz:d:tv:settings": '{"v":1,"theme":"dark","readableText":true}',
    });
    expect(readDisplaySettings(storage, settingsKeyFor("tv"))).toEqual({
      theme: "dark",
      motion: "system",
      readableText: true,
      highContrast: false,
    });
  });
});

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
